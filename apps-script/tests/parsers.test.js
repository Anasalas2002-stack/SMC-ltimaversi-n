// Carga src/Code.gs (el mismo archivo que se pega/despliega en Apps Script)
// en un sandbox de vm, con los servicios de Google simulados, y prueba los
// parsers contra SMS reales. Si un cambio de regex rompe un banco que ya
// funcionaba, falla aquí antes de llegar a producción.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function crearHoja(filasIniciales = []) {
  const filas = filasIniciales.map(f => [...f]);
  return {
    filas,
    getLastRow: () => filas.length,
    appendRow: fila => filas.push([...fila]),
    getRange: (row, col, numRows = 1, numCols = 1) => ({
      setNumberFormat() {},
      getValues: () => filas.slice(row - 1, row - 1 + numRows).map(f => f.slice(col - 1, col - 1 + numCols)),
      setValues: valores => valores.forEach((v, i) => { filas[row - 1 + i] = [...v]; }),
    }),
  };
}

function cargarScript({ hoja = crearHoja([['Fecha', 'Descripción', 'Monto', 'Fuente', 'ID']]), claveLectura = 'secreta' } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'Code.gs'), 'utf8');
  const context = {
    Logger: { log() {} },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: texto => ({ texto, setMimeType() { return this; } }),
    },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => hoja, insertSheet: () => hoja }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === 'CLAVE_LECTURA' ? claveLectura : null) }) },
    Session: { getScriptTimeZone: () => 'America/Bogota' },
    Utilities: {
      formatDate: d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'Code.gs' });
  return { ctx: context, hoja };
}

const respuesta = salida => JSON.parse(salida.texto);
const post = (ctx, body) => respuesta(ctx.doPost({ postData: { contents: JSON.stringify(body) } }));

const SMS = {
  bdbCompra: 'Banco de Bogota: Tu compra por 39,900 fue aprobada con Tarjeta Crédito 6359 el 21/09/26 18:41:12 en Rappi ¿Dudas? Llama a la Servilinea',
  bcolCompra: 'Bancolombia: Compraste $8.800,00 en BOLD SA*DROGUERI con tu T.Deb *9275, el 19/09/2026 a las 12:29. Si tienes dudas, encuentranos aqui: 6045109095 o 018000931987. Estamos cerca.',
  bcolPago: 'Bancolombia: Pagaste $350,000.00 a BANCO DAVIVIENDA SA desde tu producto 3335 el 18/09/2026 16:51:17. ¿Dudas? Llamanos al 6045109095. Estamos cerca',
  bcolTransfEnviada: 'Bancolombia: ANA, transferiste $286,433.00 a la llave @riano9246 desde tu cuenta *3335 a JUAN RIANO el 18/09/26 a las 17:44. Con Bre-b es de una y gratis. Dudas al 018000912345',
  bcolTransfLlaveNumerica: 'Bancolombia: ANA, transferiste $90,000.00 a la llave 39782050 desde tu cuenta *3335 a MARIA DEL PILAR CANO el 23/09/26 a las 14:32. Con Bre-b es de una y gratis. Dudas al 018000912345',
  bcolTransfRecibida: 'Bancolombia: Recibiste una transferencia por $532,900 de JOSE SALAS en tu cuenta **3335, el 13/09/2026 a las 16:21. Si tienes dudas, hablemos: 018000931987. Siempre a tu lado.',
  bcolQR: 'Bancolombia: ANA MARIA SALAS GALINDO pagaste $9,200.00 por codigo QR desde tu cuenta *3335 a la llave 0092747202 el 13/09/2026 a las 17:07. Con codigo QR es facil y de una. Dudas al 018000912345',
  bcolAhorro: 'Bancolombia: ANA, tu ahorro de $20.000 ya lo tienes en tu bolsillo Ahorro de tu cuenta de ahorros *3335, el 21/09/2026 a las 07:31. Vas muy bien. ¿Dudas? Llamanos al 6045109095.',
};

const CASOS = [
  ['Banco de Bogotá · compra con tarjeta', SMS.bdbCompra, { fecha: '21/09/2026', descripcion: 'Rappi', monto: 39900, fuente: 'Banco de Bogotá', id: 'BDB-260921184112-39900' }],
  ['Bancolombia · compra con débito', SMS.bcolCompra, { fecha: '19/09/2026', descripcion: 'BOLD SA*DROGUERI', monto: 8800, fuente: 'Bancolombia', id: 'BCOL-202609191229-8800-BOLDSA*DROGUERI' }],
  ['Bancolombia · pago desde producto', SMS.bcolPago, { fecha: '18/09/2026', descripcion: 'BANCO DAVIVIENDA SA', monto: 350000, fuente: 'Bancolombia', id: 'BCOLPAG-20260918165117-350000' }],
  ['Bancolombia · transferencia Bre-B enviada', SMS.bcolTransfEnviada, { fecha: '18/09/2026', descripcion: 'JUAN RIANO', monto: 286433, fuente: 'Bancolombia', id: 'BCOLTRF-2609181744-286433' }],
  ['Bancolombia · transferencia Bre-B a llave numérica', SMS.bcolTransfLlaveNumerica, { fecha: '23/09/2026', descripcion: 'MARIA DEL PILAR CANO', monto: 90000, fuente: 'Bancolombia', id: 'BCOLTRF-2609231432-90000' }],
  ['Bancolombia · transferencia recibida', SMS.bcolTransfRecibida, { fecha: '13/09/2026', descripcion: 'De JOSE SALAS', monto: 532900, fuente: 'Bancolombia', id: 'BCOLREC-202609131621-532900' }],
  ['Bancolombia · pago con QR', SMS.bcolQR, { fecha: '13/09/2026', descripcion: 'QR a 0092747202', monto: 9200, fuente: 'Bancolombia', id: 'BCOLQR-202609131707-9200' }],
  ['Bancolombia · ahorro en bolsillo', SMS.bcolAhorro, { fecha: '21/09/2026', descripcion: 'Ahorro en bolsillo', monto: 20000, fuente: 'Bancolombia', id: 'BCOLAHO-202609210731-20000' }],
];

for (const [nombre, texto, esperado] of CASOS) {
  test(`parser · ${nombre}`, () => {
    const { ctx } = cargarScript();
    assert.deepEqual({ ...ctx.parsearSMS(texto) }, esperado);
  });
}

test('parser · mensajes que no son movimientos no se reconocen', () => {
  const { ctx } = cargarScript();
  assert.equal(ctx.parsearSMS('Bancolombia: Tu clave dinamica es 123456. No la compartas.'), null);
  assert.equal(ctx.parsearSMS('{"error":"No se pudo reconocer el formato del SMS.","ok":false}'), null);
});

test('parseMontoCOP · entiende los formatos de ambos bancos', () => {
  const { ctx } = cargarScript();
  const casos = { '20.000': 20000, '8.800,00': 8800, '350,000.00': 350000, '532,900': 532900, '1.020.000': 1020000, '45.5': 45.5 };
  for (const [entrada, esperado] of Object.entries(casos)) {
    assert.equal(ctx.parseMontoCOP(entrada), esperado, entrada);
  }
});

test('doPost · registra un SMS y descarta el mismo SMS la segunda vez', () => {
  const { ctx, hoja } = cargarScript();
  assert.deepEqual(post(ctx, { texto: SMS.bdbCompra }), { ok: true, message: 'Movimiento registrado.' });
  assert.equal(post(ctx, { texto: SMS.bdbCompra }).duplicate, true);
  assert.equal(hoja.filas.length, 2);
  assert.deepEqual(hoja.filas[1], ['21/09/2026', 'Rappi', 39900, 'Banco de Bogotá', 'BDB-260921184112-39900']);
});

test('doPost · un SMS de una compra que ya se cargó del extracto no se duplica', () => {
  const hoja = crearHoja([
    ['Fecha', 'Descripción', 'Monto', 'Fuente', 'ID'],
    [new Date(2026, 8, 26), 'TIENDA D1 CHAPINERO AL', 107630, 'Banco de Bogotá', 'EXT-BDB-20260926-107630'],
    ['2026-09-24', 'Rappi', 11500, 'Banco de Bogotá', 'EXT-BDB-20260924-11500'],
  ]);
  const { ctx } = cargarScript({ hoja });
  const sms = (monto, dia) => `Banco de Bogota: Tu compra por ${monto} fue aprobada con Tarjeta Crédito 6359 el ${dia}/09/26 12:00:00 en TIENDA D1 ¿Dudas? Llama a la Servilinea`;
  assert.equal(post(ctx, { texto: sms('107,630', '26') }).duplicate, true, 'fecha tipo Date');
  assert.equal(post(ctx, { texto: sms('11,500', '24') }).duplicate, true, 'fecha pegada como aaaa-mm-dd');
  assert.equal(post(ctx, { texto: sms('20,000', '26') }).message, 'Movimiento registrado.', 'otro monto el mismo día sí entra');
  assert.equal(hoja.filas.length, 4);
});

test('doPost · un SMS no reconocido no escribe nada', () => {
  const { ctx, hoja } = cargarScript();
  const r = post(ctx, { texto: 'Bancolombia: Tu clave dinamica es 123456.' });
  assert.equal(r.ok, false);
  assert.equal(hoja.filas.length, 1);
});

test('doPost · sigue aceptando campos ya separados (flujo anterior)', () => {
  const { ctx, hoja } = cargarScript();
  const r = post(ctx, { fecha: '2026-09-22', descripción: 'PRUEBA iPhone', monto: 1, fuente: 'PRUEBA', id: 'IPHONE-TEST-001' });
  assert.equal(r.ok, true);
  assert.equal(hoja.filas[1][1], 'PRUEBA iPhone');
});

test('doGet · sin parámetros responde el chequeo de salud', () => {
  const { ctx } = cargarScript();
  assert.equal(respuesta(ctx.doGet({ parameter: {} })).ok, true);
});

test('doGet · movimientos requiere la clave de lectura', () => {
  const { ctx } = cargarScript();
  assert.equal(respuesta(ctx.doGet({ parameter: { accion: 'movimientos', clave: 'otra' } })).ok, false);
  assert.equal(respuesta(ctx.doGet({ parameter: { accion: 'movimientos' } })).ok, false);
});

test('doGet · sin CLAVE_LECTURA configurada no entrega datos', () => {
  const { ctx } = cargarScript({ claveLectura: null });
  assert.equal(respuesta(ctx.doGet({ parameter: { accion: 'movimientos', clave: '' } })).ok, false);
});

test('doGet · devuelve las filas, con fechas tipo Date convertidas a dd/mm/aaaa', () => {
  const hoja = crearHoja([
    ['Fecha', 'Descripción', 'Monto', 'Fuente', 'ID'],
    [new Date(2026, 8, 22), 'PRUEBA iPhone', 1, 'PRUEBA', 'IPHONE-TEST-001'],
    ['21/09/2026', 'Rappi', 39900, 'Banco de Bogotá', 'BDB-260921184112-39900'],
    ['', '', '', '', ''],
  ]);
  const { ctx } = cargarScript({ hoja });
  const r = respuesta(ctx.doGet({ parameter: { accion: 'movimientos', clave: 'secreta' } }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.movimientos, [
    { fecha: '22/09/2026', descripcion: 'PRUEBA iPhone', monto: 1, fuente: 'PRUEBA', id: 'IPHONE-TEST-001' },
    { fecha: '21/09/2026', descripcion: 'Rappi', monto: 39900, fuente: 'Banco de Bogotá', id: 'BDB-260921184112-39900' },
  ]);
});

// ---------- Correos reenviados (lector de correos) ----------
// Cuerpos reales recortados y anonimizados: encabezado del reenvío, la
// frase del movimiento y parte del texto legal que traen alrededor.
const CORREO = {
  bdb: (fechaHora, monto, comercio) => [
    '________________________________',
    'De: NOTIFICACIONES@BANCODEBOGOTA.NET <NOTIFICACIONES@BANCODEBOGOTA.NET>',
    'Enviados: miércoles, 14 de octubre de 2026 1:19:32 p. m. (UTC-05:00) Bogota, Lima, Quito, Rio Branco',
    'Asunto: Banco de Bogotá, Notificación de compra',
    '',
    'Señor(a):',
    'TITULAR',
    '',
    `El Banco de Bogotá le informa que la compra realizada el día ${fechaHora} fue aprobada por un monto de $ ${monto} pesos, desde el comercio ${comercio} , con la Tarjeta Crédito terminada en 0000 .`,
    '',
    'En caso de no haber realizado esta transacción, por favor comuníquese inmediatamente con nuestra línea de atención.',
  ].join('\n'),
  bancolombia: [
    '________________________________',
    'De: alertasynotificaciones@ayn.notificacionesbancolombia.com <alertasynotificaciones@ayn.notificacionesbancolombia.com>',
    'Asunto: Alertas y Notificaciones',
    '',
    '[Logo Bancolombia]',
    '¡Listo!',
    'Todo salió bien con tus movimientos',
    '',
    'Bancolombia: Transferiste $110,000.00 desde tu cuenta *3335 a la cuenta *0000000000 el 31/10/26 a las 21:00. ¿Dudas? Llamanos al 018000931987. Estamos cerca.',
    '',
    '[Vigilado Superintendencia Financiera de Colombia Bancolombia_S.A. Establecimiento Bancario]',
  ].join('\n'),
  rappi: [
    '________________________________',
    'De: RappiCard <noreply@rappicard.co>',
    'Asunto: RappiCard - Resumen de transacción',
    '',
    '¡Hola, TITULAR!',
    'Realizaste una compra con tu RappiCard.',
    '',
    'Detalle de tu transacción:',
    '',
    'Monto',
    '',
    '$62.097',
    '',
    '________________________________',
    '',
    'Método de pago',
    '',
    '*0000',
    '',
    '________________________________',
    '',
    'Comercio',
    '',
    'GOOGLE WORKSPACE',
    '',
    '________________________________',
    '',
    'Fecha de la transacción',
    '',
    '2026-11-01 08:01:10',
    '',
    'Producto de Davivienda S.A.',
  ].join('\n'),
  extractoRappi: [
    'De: RappiCard <noreply@rappicard.co>',
    'Asunto: ¡Llegó el extracto de tu RappiCard!',
    '',
    'Tu extracto ya está disponible. Pago total $621.623. Fecha de pago 10 nov 2026.',
  ].join('\n'),
};

test('correo · Banco de Bogotá da el mismo movimiento (y el mismo ID) que el SMS', () => {
  const { ctx } = cargarScript();
  const aviso = ctx.avisoDeCorreo(CORREO.bdb('2026/10/14 13:19:27', '14,824.00', 'JENAGRO 65 SAS'));
  assert.deepEqual({ ...ctx.parsearSMS(aviso) }, {
    fecha: '14/10/2026', descripcion: 'JENAGRO 65 SAS', monto: 14824, fuente: 'Banco de Bogotá', id: 'BDB-261014131927-14824',
  });
  const sms = 'Banco de Bogota: Tu compra por 14,824 fue aprobada con Tarjeta Crédito 6359 el 14/10/26 13:19:27 en JENAGRO 65 SAS ¿Dudas? Llama a la Servilinea';
  assert.equal(ctx.parsearSMS(sms).id, 'BDB-261014131927-14824');
});

test('correo · Banco de Bogotá con centavos guarda el monto en pesos', () => {
  const { ctx } = cargarScript();
  const r = ctx.parsearSMS(ctx.avisoDeCorreo(CORREO.bdb('2026/10/29 15:26:06', '111,251.03', 'TARGET T-2799')));
  assert.equal(r.monto, 111251);
  assert.equal(r.descripcion, 'TARGET T-2799');
  assert.equal(r.id, 'BDB-261029152606-111251');
});

test('correo · Bancolombia trae la misma frase del SMS', () => {
  const { ctx } = cargarScript();
  const aviso = ctx.avisoDeCorreo(CORREO.bancolombia);
  assert.match(aviso, /^Bancolombia: Transferiste \$110,000\.00/);
  assert.equal(ctx.parsearSMS(aviso).id, 'BCOLTRF-2610312100-110000');
});

test('correo · RappiCard', () => {
  const { ctx } = cargarScript();
  const aviso = ctx.avisoDeCorreo(CORREO.rappi);
  assert.equal(aviso, 'RappiCard: compra por $62.097 en GOOGLE WORKSPACE el 2026-11-01 08:01:10');
  assert.deepEqual({ ...ctx.parsearSMS(aviso) }, {
    fecha: '01/11/2026', descripcion: 'GOOGLE WORKSPACE', monto: 62097, fuente: 'RappiCard', id: 'RAPPI-20261101080110-62097',
  });
});

test('doPost · un correo se registra una vez, aunque la compra ya haya llegado por SMS', () => {
  const { ctx, hoja } = cargarScript();
  const sms = 'Banco de Bogota: Tu compra por 14,824 fue aprobada con Tarjeta Crédito 6359 el 14/10/26 13:19:27 en JENAGRO 65 SAS ¿Dudas? Llama a la Servilinea';
  assert.equal(post(ctx, { texto: sms }).message, 'Movimiento registrado.');
  assert.equal(post(ctx, { correo: CORREO.bdb('2026/10/14 13:19:27', '14,824.00', 'JENAGRO 65 SAS') }).duplicate, true);
  assert.equal(post(ctx, { correo: CORREO.rappi }).message, 'Movimiento registrado.');
  assert.equal(post(ctx, { correo: CORREO.rappi }).duplicate, true);
  assert.equal(hoja.filas.length, 3);
  assert.deepEqual(hoja.filas[2], ['01/11/2026', 'GOOGLE WORKSPACE', 62097, 'RappiCard', 'RAPPI-20261101080110-62097']);
});

test('doPost · un correo que no es aviso (extracto) se ignora sin escribir', () => {
  const { ctx, hoja } = cargarScript();
  const r = post(ctx, { correo: CORREO.extractoRappi });
  assert.equal(r.ok, false);
  assert.equal(r.ignorado, true);
  assert.equal(hoja.filas.length, 1);
});

// ---------- Lector.gs ----------
function cargarLector({ codigos }) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'lector-correos', 'Lector.gs'), 'utf8');
  const etiquetados = [];
  const enviados = [];
  const hilos = codigos.map((codigo, i) => ({
    codigo,
    getMessages: () => [{ getSubject: () => `aviso ${i}`, getPlainBody: () => `cuerpo ${i}` }],
    addLabel() { etiquetados.push(i); },
  }));
  let busqueda;
  const context = {
    console: { log() {} },
    GmailApp: {
      getUserLabelByName: () => null,
      createLabel: nombre => ({ nombre }),
      search: q => { busqueda = q; return hilos; },
    },
    UrlFetchApp: {
      fetch: (url, opciones) => {
        enviados.push(JSON.parse(opciones.payload));
        const i = enviados.length - 1;
        return { getResponseCode: () => hilos[i].codigo, getContentText: () => '{"ok":true}' };
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'Lector.gs' });
  return { ctx: context, etiquetados, enviados, busqueda: () => busqueda };
}

test('lector · manda cada correo al Web App y solo etiqueta lo que se envió bien', () => {
  const { ctx, etiquetados, enviados, busqueda } = cargarLector({ codigos: [200, 500, 200] });
  ctx.revisarCorreos();
  assert.deepEqual(enviados, [{ correo: 'cuerpo 0' }, { correo: 'cuerpo 1' }, { correo: 'cuerpo 2' }]);
  assert.deepEqual(etiquetados, [0, 2], 'el que falló se reintenta en la próxima vuelta');
  assert.match(busqueda(), /-label:GastosMensuales/);
});
