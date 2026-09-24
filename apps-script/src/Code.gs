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
      fecha: Object.prototype.toString.call(fecha) === '[object Date]'
        ? Utilities.formatDate(fecha, tz, 'dd/MM/yyyy')
        : String(fecha),
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

    // Evita que dos envíos simultáneos del mismo SMS pasen ambos el chequeo
    // de duplicados antes de que cualquiera de los dos escriba.
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = getSheet();

      if (id && movimientoExiste(sheet, id)) {
        return jsonResponse({
          ok: true,
          duplicate: true,
          message: 'El movimiento ya estaba registrado.'
        });
      }

      agregarFila(sheet, [fecha, descripcion, monto, fuente, id]);
    } finally {
      lock.releaseLock();
    }

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
    parseBancolombiaCompra,
    parseBancolombiaPagoProducto,
    parseBancolombiaTransferenciaEnviada,
    parseBancolombiaTransferenciaRecibida,
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
  const destinatario = texto.match(/a la llave\s*@[\w.]+\s*desde tu cuenta\s*\*?\d+\s*a\s+(.+?)\s+el\s+\d{2}\/\d{2}\/\d{2}/i);
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

function movimientoExiste(sheet, id) {
  if (!id) return false;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const ids = sheet.getRange(2, 5, lastRow - 1, 1).getValues();
  return ids.some(row => String(row[0]) === id);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
