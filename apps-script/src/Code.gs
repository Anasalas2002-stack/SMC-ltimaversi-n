// ============================================================
// FINANZAS AUTOMÁTICO — recibe el texto de tus SMS bancarios
// (enviados desde un Atajo de iPhone) y los registra en un
// Google Sheet. No usa Gmail para nada — evita por completo
// el bloqueo del Admin Console de Workspace.
// ============================================================

// ---------- CONFIGURACIÓN ----------
const SHEET_ID = '';              // Pega aquí el ID de tu Google Sheet, o déjalo vacío para usar la hoja activa
const SHEET_NAME = 'Movimientos';

// Cámbiala por lo que quieras: es una palabra secreta que el Atajo
// debe enviar junto con el SMS, para que nadie más pueda escribir
// en tu hoja aunque adivine la URL.
const CLAVE_SECRETA = 'ana-finanzas-2026';

// ---------- PUNTO DE ENTRADA — lo llama el Atajo de iPhone ----------
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.clave !== CLAVE_SECRETA) {
      return respuesta({ ok: false, error: 'Clave incorrecta' });
    }
    const texto = body.mensaje || '';
    const parsed = parsearSMS(texto);
    const sheet = getSheet();
    sheet.appendRow([
      parsed.fecha,
      parsed.descripcion,
      parsed.monto,
      parsed.tipo,
      texto.slice(0, 200), // guarda el texto original también, por si acaso
    ]);
    return respuesta({ ok: true, parsed });
  } catch (err) {
    return respuesta({ ok: false, error: err.toString() });
  }
}

function respuesta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- Parsers de SMS, uno por tipo de mensaje ----------

// "ANA, transferiste $1,020,000.00 a la llave @rueda3611 desde tu
//  cuenta *3335 a GLORIA ELISA RUEDA PINILLA el 16/09/26 a las 18:32.
//  Con Bre-b es de una y gratis."
function parseTransferenciaBreB(texto) {
  const monto = texto.match(/transferiste\s*\$\s*([\d,]+\.\d{2})/i);
  const dest = texto.match(/a la llave\s*@[\w.]+\s*desde tu cuenta\s*\*?\d+\s*a\s+(.+?)\s+el\s+\d{2}\/\d{2}\/\d{2}/i);
  const fecha = texto.match(/el\s+(\d{2})\/(\d{2})\/(\d{2})\s+a las\s+(\d{2}:\d{2})/i);
  if (!monto || !fecha) return null;
  return {
    fecha: `20${fecha[3]}-${fecha[2]}-${fecha[1]}`,
    monto: monto[1].replace(/,/g, ''),
    descripcion: dest ? dest[1].trim() : 'Transferencia Bre-B',
    tipo: 'Transferencia',
  };
}

// "Banco de Bogota: Tu compra por 18,072 fue aprobada con Tarjeta
//  Crédito 6359 el 20/09/26 02:04:31 en UBER*RIDES ¿Dudas? Llama a
//  la Servilinea..."
function parseCompraBancoBogota(texto) {
  const monto = texto.match(/compra por\s*([\d,]+)/i);
  const fecha = texto.match(/el\s+(\d{2})\/(\d{2})\/(\d{2})\s+\d{2}:\d{2}:\d{2}/i);
  const comercio = texto.match(/en\s+(.+?)\s+¿Dudas/i);
  if (!monto || !fecha) return null;
  return {
    fecha: `20${fecha[3]}-${fecha[2]}-${fecha[1]}`,
    monto: monto[1].replace(/,/g, ''),
    descripcion: comercio ? comercio[1].trim() : 'Banco de Bogotá',
    tipo: 'Compra tarjeta',
  };
}

// Intenta cada parser conocido; si ninguno calza, guarda un genérico
// con lo que se pueda sacar (monto y fecha, si aparecen), para no
// perder el movimiento mientras agregamos el patrón correcto.
function parsearSMS(texto) {
  const parsers = [parseTransferenciaBreB, parseCompraBancoBogota];
  for (const parser of parsers) {
    const resultado = parser(texto);
    if (resultado) return resultado;
  }
  // Fallback genérico
  const montoGenerico = texto.match(/\$\s*([\d,]+\.?\d*)/);
  return {
    fecha: new Date().toISOString().slice(0, 10),
    monto: montoGenerico ? montoGenerico[1].replace(/,/g, '') : '0',
    descripcion: 'SIN RECONOCER — revisar formato',
    tipo: 'Desconocido',
  };
}

// ---------- Utilidades ----------
function getSheet() {
  const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Fecha', 'Descripción', 'Monto', 'Tipo', 'Texto original']);
  }
  return sheet;
}

// ---------- Para probar manualmente desde el editor (opcional) ----------
function probarConEjemplo() {
  const ejemplo1 = "ANA, transferiste $1,020,000.00 a la llave @rueda3611 desde tu cuenta *3335 a GLORIA ELISA RUEDA PINILLA el 16/09/26 a las 18:32. Con Bre-b es de una y gratis.";
  const ejemplo2 = "Banco de Bogota: Tu compra por 18,072 fue aprobada con Tarjeta Crédito 6359 el 20/09/26 02:04:31 en UBER*RIDES ¿Dudas? Llama a la Servilinea";
  Logger.log(JSON.stringify(parsearSMS(ejemplo1)));
  Logger.log(JSON.stringify(parsearSMS(ejemplo2)));
}
