const SHEET_ID = '1JW21uKlY-Ai07Fney1eMJsFCVZ_Phg84fra-pBqULnQ';
const SHEET_NAME = 'Movimientos';

// ?accion=movimientos&clave=... devuelve todas las filas (lo usa la app de
// presupuesto). Sin parámetros responde un chequeo de salud.
function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.accion === 'movimientos') {
    return listarMovimientos(params.clave);
  }
  return jsonResponse({
    ok: true,
    message: 'GastosMensuales está funcionando.'
  });
}

// La clave de lectura vive en las propiedades del script y no en el código,
// porque este archivo es público en GitHub.
function listarMovimientos(clave) {
  const esperada = PropertiesService.getScriptProperties().getProperty('CLAVE_LECTURA');
  if (!esperada || clave !== esperada) {
    return jsonResponse({ ok: false, error: 'Clave de lectura incorrecta.' });
  }

  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return jsonResponse({ ok: true, movimientos: [] });
  }

  const tz = Session.getScriptTimeZone();
  const movimientos = sheet
    .getRange(2, 1, lastRow - 1, 5)
    .getValues()
    .filter(fila => fila.some(celda => celda !== ''))
    .map(([fecha, descripcion, monto, fuente, id]) => ({
      fecha: fechaTexto(fecha, tz),
      descripcion: String(descripcion),
      monto: Number(monto),
      fuente: String(fuente),
      id: String(id),
    }));

  return jsonResponse({ ok: true, movimientos });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({
        ok: false,
        error: 'No se recibieron datos.'
      });
    }

    const data = JSON.parse(e.postData.contents);

    // El lector de correos manda el correo completo; de ahí se saca solo
    // la frase del movimiento y sigue el mismo camino que un SMS.
    if (data.correo) {
      const aviso = avisoDeCorreo(data.correo);
      delete data.correo;
      if (!aviso) {
        return jsonResponse({
          ok: false,
          ignorado: true,
          error: 'El correo no es un aviso de movimiento.'
        });
      }
      data.texto = aviso;
    }

    let monto, fecha, descripcion, fuente, id;

    if (data.texto) {
      const parsed = parsearSMS(String(data.texto));
      if (!parsed) {
        return jsonResponse({
          ok: false,
          error: 'No se pudo reconocer el formato del SMS.',
          texto: data.texto
        });
      }
      monto = parsed.monto;
      fecha = parsed.fecha;
      descripcion = parsed.descripcion;
      fuente = parsed.fuente;
      id = parsed.id;
    } else {
      monto = Number(data.monto);
      fecha = String(data.fecha || '').trim();
      descripcion = String(data.descripcion || data.descripción || '').trim();
      fuente = String(data.fuente || '').trim();
      id = String(data.id || '').trim();
    }

    Logger.log('Datos recibidos: ' + JSON.stringify(data));

    if (
      isNaN(monto) ||
      !fecha ||
      !descripcion ||
      !fuente
    ) {
      return jsonResponse({
        ok: false,
        error: 'Faltan datos obligatorios.',
        recibidos: { monto, fecha, descripcion, fuente, id }
      });
    }

    const sheet = getSheet();

    if (id && movimientoExiste(sheet, { id, fecha, monto, fuente })) {
      return jsonResponse({
        ok: true,
        duplicate: true,
        message: 'El movimiento ya estaba registrado.'
      });
    }

    agregarFila(sheet, [fecha, descripcion, monto, fuente, id]);

    return jsonResponse({
      ok: true,
      message: 'Movimiento registrado.'
    });

  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error.message
    });
  }
}

// ---------- Parsers de SMS ----------
function parsearSMS(texto) {
  const parsers = [
    parseBancoDeBogotaCompra,
    parseBancoDeBogotaCorreo,
    parseRappiCardCompra,
    parseBancolombiaCompra,
    parseBancolombiaPagoProducto,
    parseBancolombiaTransferenciaEnviada,
    parseBancolombiaTransferenciaRecibida,
    parseBancolombiaTransferenciaRecibidaLlave,
    parseBancolombiaPagoQR,
    parseBancolombiaAhorroBolsillo,
  ];
  for (const parser of parsers) {
    const resultado = parser(texto);
    if (resultado) return resultado;
  }
  return null;
}

// "Banco de Bogota: Tu compra por 39,900 fue aprobada con Tarjeta
//  Crédito 6359 el 21/09/26 18:41:12 en Rappi ¿Dudas?..."
function parseBancoDeBogotaCompra(texto) {
  const monto = texto.match(/compra por\s*([\d,]+)/i);
  const fechaHora = texto.match(/el\s+(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/i);
  const comercio = texto.match(/en\s+(.+?)\s+¿Dudas/i);
  if (!monto || !fechaHora) return null;
  const montoNumero = Number(monto[1].replace(/,/g, ''));
  const [, dd, mm, yy, hh, mi, ss] = fechaHora;
  return {
    monto: montoNumero,
    fecha: `${dd}/${mm}/20${yy}`,
    descripcion: comercio ? comercio[1].trim() : 'Banco de Bogotá',
    fuente: 'Banco de Bogotá',
    id: `BDB-${yy}${mm}${dd}${hh}${mi}${ss}-${montoNumero}`,
  };
}

// Correo: "...la compra realizada el día 2026/10/14 13:19:27 fue aprobada
//  por un monto de $ 14,824.00 pesos, desde el comercio JENAGRO 65 SAS ,
//  con la Tarjeta Crédito terminada en 6359". Da el mismo ID que el SMS de
//  esa compra (los centavos se descartan, como en el SMS), así que una
//  compra que llegue por los dos lados no se duplica.
function parseBancoDeBogotaCorreo(texto) {
  const m = texto.match(/compra realizada el d[ií]a\s+(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s+fue aprobada por un monto de\s*\$\s*([\d,]+)(?:\.\d+)?\s*pesos,?\s*desde el comercio\s+(.+?)\s*,\s*con la Tarjeta/i);
  if (!m) return null;
  const [, yyyy, mm, dd, hh, mi, ss, montoTxt, comercio] = m;
  const montoNumero = Number(montoTxt.replace(/,/g, ''));
  return {
    monto: montoNumero,
    fecha: `${dd}/${mm}/${yyyy}`,
    descripcion: comercio.trim(),
    fuente: 'Banco de Bogotá',
    id: `BDB-${yyyy.slice(2)}${mm}${dd}${hh}${mi}${ss}-${montoNumero}`,
  };
}

// "RappiCard: compra por $62.097 en GOOGLE WORKSPACE el
//  2026-11-01 08:01:10" (frase que arma avisoDeCorreo con los campos del
//  correo de RappiCard).
function parseRappiCardCompra(texto) {
  const m = texto.match(/RappiCard:\s*compra por\s*\$\s*([\d.,]+)\s+en\s+(.+?)\s+el\s+(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/i);
  if (!m) return null;
  const [, montoTxt, comercio, yyyy, mm, dd, hh, mi, ss] = m;
  const montoNumero = parseMontoCOP(montoTxt);
  return {
    monto: montoNumero,
    fecha: `${dd}/${mm}/${yyyy}`,
    descripcion: comercio.trim(),
    fuente: 'RappiCard',
    id: `RAPPI-${yyyy}${mm}${dd}${hh}${mi}${ss}-${montoNumero}`,
  };
}

// Los correos reenviados traen encabezados, publicidad y avisos legales.
// Esto saca solo la frase del movimiento, en un formato que los parsers ya
// entienden. Devuelve null si el correo no es un aviso (p. ej. un extracto).
function avisoDeCorreo(correo) {
  const s = String(correo);
  // Bancolombia pone en el correo la misma frase del SMS (hasta el
  // siguiente párrafo, por si el texto plano viene partido en líneas).
  const bancolombia = s.match(/Bancolombia:[\s\S]*?(?=\n\s*\n|$)/);
  if (bancolombia) return bancolombia[0].replace(/\s+/g, ' ').trim();
  const bdb = s.match(/la compra realizada el d[ií]a[\s\S]+?terminada en \d+/i);
  if (bdb) return bdb[0].replace(/\s+/g, ' ');
  if (/RappiCard/i.test(s)) {
    const monto = s.match(/Monto\s+\$\s*([\d.,]+)/i);
    const comercio = s.match(/Comercio\s+([^\n]+)/i);
    const fecha = s.match(/Fecha de la transacci[oó]n\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/i);
    if (monto && comercio && fecha) {
      return `RappiCard: compra por $${monto[1]} en ${comercio[1].trim()} el ${fecha[1]}`;
    }
  }
  return null;
}

// "Bancolombia: Compraste $8.800,00 en BOLD SA*DROGUERI con tu T.Deb
//  *9275, el 19/09/2026 a las 12:29..."
function parseBancolombiaCompra(texto) {
  const monto = texto.match(/Compraste\s*\$\s*([\d.,]+)/i);
  const comercio = texto.match(/en\s+(.+?)\s+con tu/i);
  const fechaHora = texto.match(/el\s+(\d{2})\/(\d{2})\/(\d{4})\s+a las\s+(\d{2}):(\d{2})/i);
  if (!monto || !fechaHora) return null;
  const montoNumero = Number(monto[1].replace(/\./g, '').replace(',', '.'));
  const [, dd, mm, yyyy, hh, mi] = fechaHora;
  const comercioTxt = comercio ? comercio[1].trim() : 'Bancolombia';
  return {
    monto: montoNumero,
    fecha: `${dd}/${mm}/${yyyy}`,
    descripcion: comercioTxt,
    fuente: 'Bancolombia',
    id: `BCOL-${yyyy}${mm}${dd}${hh}${mi}-${montoNumero}-${comercioTxt.replace(/\s+/g, '').toUpperCase()}`,
  };
}

// "Bancolombia: Pagaste $350,000.00 a BANCO DAVIVIENDA SA desde tu
//  producto 3335 el 18/09/2026 16:51:17. ¿Dudas?..."
function parseBancolombiaPagoProducto(texto) {
  const monto = texto.match(/Pagaste\s*\$\s*([\d,]+\.\d{2})\s*a\s+.+?\s+desde tu producto/i);
  const destinatario = texto.match(/Pagaste\s*\$[\d,.]+\s*a\s+(.+?)\s+desde tu producto/i);
  const fechaHora = texto.match(/el\s+(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/i);
  if (!monto || !fechaHora) return null;
  const montoNumero = Number(monto[1].replace(/,/g, ''));
  const [, dd, mm, yyyy, hh, mi, ss] = fechaHora;
  const dest = destinatario ? destinatario[1].trim() : 'Bancolombia';
  return {
    monto: montoNumero,
    fecha: `${dd}/${mm}/${yyyy}`,
    descripcion: dest,
    fuente: 'Bancolombia',
    id: `BCOLPAG-${yyyy}${mm}${dd}${hh}${mi}${ss}-${montoNumero}`,
  };
}

// "Bancolombia: ANA, transferiste $286,433.00 a la llave @riano9246
//  desde tu cuenta *3335 a JUAN RIANO el 18/09/26 a las 17:44..."
function parseBancolombiaTransferenciaEnviada(texto) {
  const monto = texto.match(/transferiste\s*\$\s*([\d,]+\.\d{2})/i);
  const destinatario = texto.match(/a la llave\s*@?[\w.]+\s*desde tu cuenta\s*\*?\d+\s*a\s+(.+?)\s+el\s+\d{2}\/\d{2}\/\d{2}/i);
  const fechaHora = texto.match(/el\s+(\d{2})\/(\d{2})\/(\d{2})\s+a las\s+(\d{2}):(\d{2})/i);
  if (!monto || !fechaHora) return null;
  const montoNumero = Number(monto[1].replace(/,/g, ''));
  const [, dd, mm, yy, hh, mi] = fechaHora;
  const dest = destinatario ? destinatario[1].trim() : 'Bancolombia';
  return {
    monto: montoNumero,
    fecha: `${dd}/${mm}/20${yy}`,
    descripcion: dest,
    fuente: 'Bancolombia',
    id: `BCOLTRF-${yy}${mm}${dd}${hh}${mi}-${montoNumero}`,
  };
}

// "Bancolombia: Recibiste una transferencia por $532,900 de JOSE SALAS
//  en tu cuenta **3335, el 13/09/2026 a las 16:21..."
function parseBancolombiaTransferenciaRecibida(texto) {
  const monto = texto.match(/Recibiste una transferencia por\s*\$\s*([\d,]+(?:\.\d{2})?)/i);
  const remitente = texto.match(/de\s+(.+?)\s+en tu cuenta/i);
  const fechaHora = texto.match(/el\s+(\d{2})\/(\d{2})\/(\d{4})\s+a las\s+(\d{2}):(\d{2})/i);
  if (!monto || !fechaHora) return null;
  const montoNumero = Number(monto[1].replace(/,/g, ''));
  const [, dd, mm, yyyy, hh, mi] = fechaHora;
  const rem = remitente ? remitente[1].trim() : 'Bancolombia';
  return {
    monto: montoNumero,
    fecha: `${dd}/${mm}/${yyyy}`,
    descripcion: `De ${rem}`,
    fuente: 'Bancolombia',
    id: `BCOLREC-${yyyy}${mm}${dd}${hh}${mi}-${montoNumero}`,
  };
}

// "Bancolombia: Anamaria, recibiste una transferencia de LUIS PEREZ por
//  $48,500.00 en tu cuenta *3335 conectada a la llave 1234567890 el
//  05/11/26 a las 10:23..." (formato nuevo, desde noviembre de 2026).
function parseBancolombiaTransferenciaRecibidaLlave(texto) {
  const m = texto.match(/recibiste una transferencia de\s+(.+?)\s+por\s*\$\s*([\d,.]*\d)\s+en tu cuenta[\s\S]*?el\s+(\d{2})\/(\d{2})\/(\d{2})\s+a las\s+(\d{2}):(\d{2})/i);
  if (!m) return null;
  const [, remitente, montoTxt, dd, mm, yy, hh, mi] = m;
  const montoNumero = parseMontoCOP(montoTxt);
  return {
    monto: montoNumero,
    fecha: `${dd}/${mm}/20${yy}`,
    descripcion: `De ${remitente.trim()}`,
    fuente: 'Bancolombia',
    id: `BCOLREC-20${yy}${mm}${dd}${hh}${mi}-${montoNumero}`,
  };
}

// "Bancolombia: ANA MARIA SALAS GALINDO pagaste $9,200.00 por codigo QR
//  desde tu cuenta *3335 a la llave 0092747202 el 13/09/2026 a las 17:07..."
function parseBancolombiaPagoQR(texto) {
  const monto = texto.match(/pagaste\s*\$\s*([\d,]+\.\d{2})\s*por codigo QR/i);
  const llave = texto.match(/a la llave\s+([\w\d]+)\s+el\s+\d{2}\/\d{2}\/\d{4}/i);
  const fechaHora = texto.match(/el\s+(\d{2})\/(\d{2})\/(\d{4})\s+a las\s+(\d{2}):(\d{2})/i);
  if (!monto || !fechaHora) return null;
  const montoNumero = Number(monto[1].replace(/,/g, ''));
  const [, dd, mm, yyyy, hh, mi] = fechaHora;
  const desc = llave ? `QR a ${llave[1]}` : 'Pago QR';
  return {
    monto: montoNumero,
    fecha: `${dd}/${mm}/${yyyy}`,
    descripcion: desc,
    fuente: 'Bancolombia',
    id: `BCOLQR-${yyyy}${mm}${dd}${hh}${mi}-${montoNumero}`,
  };
}

// "Bancolombia: ANA, tu ahorro de $20.000 ya lo tienes en tu bolsillo
//  Ahorro de tu cuenta de ahorros *3335, el 21/09/2026 a las 07:31..."
function parseBancolombiaAhorroBolsillo(texto) {
  const monto = texto.match(/tu ahorro de\s*\$\s*([\d.,]+\d)/i);
  const bolsillo = texto.match(/en tu bolsillo\s+(.+?)\s+de tu cuenta/i);
  const fechaHora = texto.match(/el\s+(\d{2})\/(\d{2})\/(\d{4})\s+a las\s+(\d{2}):(\d{2})/i);
  if (!monto || !fechaHora) return null;
  const montoNumero = parseMontoCOP(monto[1]);
  const [, dd, mm, yyyy, hh, mi] = fechaHora;
  const nombre = bolsillo ? bolsillo[1].trim() : '';
  const desc = !nombre || nombre.toLowerCase() === 'ahorro'
    ? 'Ahorro en bolsillo'
    : `Ahorro en bolsillo ${nombre}`;
  return {
    monto: montoNumero,
    fecha: `${dd}/${mm}/${yyyy}`,
    descripcion: desc,
    fuente: 'Bancolombia',
    id: `BCOLAHO-${yyyy}${mm}${dd}${hh}${mi}-${montoNumero}`,
  };
}

// Convierte montos en cualquiera de los formatos que usan los bancos:
// "20.000", "8.800,00", "350,000.00", "532,900".
function parseMontoCOP(txt) {
  const s = String(txt).trim();
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    return lastComma > lastDot
      ? Number(s.replace(/\./g, '').replace(',', '.'))
      : Number(s.replace(/,/g, ''));
  }
  if (lastDot !== -1) {
    return /^\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, '')) : Number(s);
  }
  if (lastComma !== -1) {
    return /^\d{1,3}(,\d{3})+$/.test(s) ? Number(s.replace(/,/g, '')) : Number(s.replace(',', '.'));
  }
  return Number(s);
}

// ---------- Utilidades ----------
function getSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Fecha', 'Descripción', 'Monto', 'Fuente', 'ID']);
  }
  return sheet;
}

// Fecha e ID se guardan como texto plano: si no, Sheets interpreta
// "05/10/2026" según el idioma de la hoja y puede volverlo 10 de mayo.
function agregarFila(sheet, fila) {
  const row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1).setNumberFormat('@');
  sheet.getRange(row, 5).setNumberFormat('@');
  sheet.getRange(row, 1, 1, fila.length).setValues([fila]);
}

// Además del mismo ID, cuenta como repetido:
// - un movimiento que ya se cargó desde un extracto (ID "EXT-…") con la
//   misma fecha, monto y banco: si no, el barrido de SMS volvería a agregar
//   las compras de los últimos días;
// - una compra de Banco de Bogotá con el mismo monto y casi la misma hora:
//   el SMS y el correo de una compra a veces difieren en uno o dos segundos.
function movimientoExiste(sheet, mov) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const tz = Session.getScriptTimeZone();
  const fecha = fechaTexto(mov.fecha, tz);
  return sheet.getRange(2, 1, lastRow - 1, 5).getValues().some(([f, , monto, fuente, id]) => {
    if (String(id) === mov.id) return true;
    if (mismaCompraBdB(id, mov.id)) return true;
    return String(id).startsWith('EXT-') &&
      fuente === mov.fuente &&
      Number(monto) === Number(mov.monto) &&
      fechaTexto(f, tz) === fecha;
  });
}

// IDs "BDB-aammddhhmmss-monto" con el mismo monto y a menos de 2 minutos.
function mismaCompraBdB(idA, idB) {
  const a = String(idA).match(/^BDB-(\d{12})-(.+)$/);
  const b = String(idB).match(/^BDB-(\d{12})-(.+)$/);
  if (!a || !b || a[2] !== b[2]) return false;
  return Math.abs(segundosBdB(a[1]) - segundosBdB(b[1])) <= 120;
}

function segundosBdB(t) {
  const [yy, mm, dd, hh, mi, ss] = t.match(/\d\d/g).map(Number);
  return Date.UTC(2000 + yy, mm - 1, dd, hh, mi, ss) / 1000;
}

// Fechas del Sheet a "dd/mm/aaaa": pueden ser texto dd/mm/aaaa, texto
// aaaa-mm-dd (filas pegadas a mano) o fechas que Sheets ya convirtió.
function fechaTexto(valor, tz) {
  if (Object.prototype.toString.call(valor) === '[object Date]') {
    return Utilities.formatDate(valor, tz, 'dd/MM/yyyy');
  }
  const s = String(valor);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : s;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
