// Carga src/Code.gs (el archivo real que se despliega con `clasp push`)
// dentro de un sandbox de vm y prueba los parsers de SMS contra él
// directamente, para que un cambio de regex que rompa un banco ya
// soportado falle aquí antes de llegar a producción.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadParsers() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'Code.gs'), 'utf8');
  const context = {
    ContentService: { createTextOutput: () => ({ setMimeType: () => {} }), MimeType: { JSON: 'JSON' } },
    SpreadsheetApp: {},
    Logger: { log() {} },
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'Code.gs' });
  return context;
}

const { parsearSMS, parseTransferenciaBreB, parseCompraBancoBogota } = loadParsers();

test('Bancolombia · transferencia Bre-B (ejemplo real)', () => {
  const texto = 'ANA, transferiste $1,020,000.00 a la llave @rueda3611 desde tu cuenta *3335 a GLORIA ELISA RUEDA PINILLA el 16/09/26 a las 18:32. Con Bre-b es de una y gratis.';
  const r = parseTransferenciaBreB(texto);
  assert.ok(r, 'debería reconocer el mensaje de Bancolombia');
  assert.equal(r.fecha, '2026-09-16');
  assert.equal(r.monto, '1020000.00');
  assert.equal(r.descripcion, 'GLORIA ELISA RUEDA PINILLA');
  assert.equal(r.tipo, 'Transferencia');
});

test('Banco de Bogotá · compra con tarjeta (ejemplo real)', () => {
  const texto = 'Banco de Bogota: Tu compra por 18,072 fue aprobada con Tarjeta Crédito 6359 el 20/09/26 02:04:31 en UBER*RIDES ¿Dudas? Llama a la Servilinea';
  const r = parseCompraBancoBogota(texto);
  assert.ok(r, 'debería reconocer el mensaje de Banco de Bogotá');
  assert.equal(r.fecha, '2026-09-20');
  assert.equal(r.monto, '18072');
  assert.equal(r.descripcion, 'UBER*RIDES');
  assert.equal(r.tipo, 'Compra tarjeta');
});

test('parsearSMS despacha correctamente: Bancolombia', () => {
  const texto = 'ANA, transferiste $50,000.00 a la llave @juan123 desde tu cuenta *1111 a JUAN PEREZ el 01/01/26 a las 09:00. Con Bre-b es de una y gratis.';
  const r = parsearSMS(texto);
  assert.equal(r.tipo, 'Transferencia');
  assert.equal(r.descripcion, 'JUAN PEREZ');
});

test('parsearSMS despacha correctamente: Banco de Bogotá', () => {
  const texto = 'Banco de Bogota: Tu compra por 1,000 fue aprobada con Tarjeta Crédito 1234 el 05/05/26 10:00:00 en NETFLIX.COM ¿Dudas? Llama a la Servilinea';
  const r = parsearSMS(texto);
  assert.equal(r.tipo, 'Compra tarjeta');
  assert.equal(r.descripcion, 'NETFLIX.COM');
});

test('SMS no reconocido cae al parser genérico sin perder el monto', () => {
  const texto = 'Tu banco favorito te informa un cargo de $45,500 en un comercio nuevo.';
  const r = parsearSMS(texto);
  assert.equal(r.tipo, 'Desconocido');
  assert.equal(r.monto, '45500');
});

test('SMS totalmente irreconocible no revienta y devuelve monto 0', () => {
  const texto = 'Este mensaje no tiene ningún monto ni fecha reconocible.';
  const r = parsearSMS(texto);
  assert.equal(r.tipo, 'Desconocido');
  assert.equal(r.monto, '0');
});

test('parseTransferenciaBreB devuelve null si el texto no calza', () => {
  assert.equal(parseTransferenciaBreB('mensaje cualquiera sin el patrón esperado'), null);
});

test('parseCompraBancoBogota devuelve null si el texto no calza', () => {
  assert.equal(parseCompraBancoBogota('mensaje cualquiera sin el patrón esperado'), null);
});

// Plantilla para cuando agregues un banco nuevo: duplica este bloque,
// cambia el texto de ejemplo y los valores esperados.
//
// test('Nuevo banco · descripción del mensaje', () => {
//   const texto = '...';
//   const r = parseNuevoBanco(texto);
//   assert.ok(r);
//   assert.equal(r.fecha, 'YYYY-MM-DD');
//   assert.equal(r.monto, '...');
//   assert.equal(r.descripcion, '...');
//   assert.equal(r.tipo, '...');
// });
