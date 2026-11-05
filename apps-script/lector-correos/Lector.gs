// Lector de correos de GastosMensuales.
//
// Va en un proyecto de Apps Script aparte, creado con la cuenta de Gmail
// que recibe (reenviados desde Outlook) los avisos de los bancos. Cada 10
// minutos busca los avisos nuevos, se los manda al Web App de
// GastosMensuales (que los reconoce y los guarda en el Sheet) y les pone una
// etiqueta para no volver a mandarlos.
//
// Este archivo no reconoce montos ni fechas: eso vive en Code.gs, así que
// cuando un banco cambie el formato solo hay que actualizar Code.gs.

// La URL del Web App (la misma de los Atajos). No va en el repo, que es
// público: quien la tenga puede escribir en el Sheet.
const WEB_APP_URL = 'PEGA_AQUI_LA_URL_DEL_WEB_APP';
const ETIQUETA = 'GastosMensuales';
const BUSQUEDA = 'subject:("Alertas y Notificaciones" OR "Notificación de compra" OR "Resumen de transacción") ' +
  `-label:${ETIQUETA} newer_than:60d`;

function revisarCorreos() {
  const etiqueta = GmailApp.getUserLabelByName(ETIQUETA) || GmailApp.createLabel(ETIQUETA);
  const hilos = GmailApp.search(BUSQUEDA, 0, 30);
  for (const hilo of hilos) {
    let todoProcesado = true;
    for (const mensaje of hilo.getMessages()) {
      const respuesta = UrlFetchApp.fetch(WEB_APP_URL, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ correo: mensaje.getPlainBody() }),
        muteHttpExceptions: true,
      });
      const texto = respuesta.getContentText();
      console.log(`${mensaje.getSubject()} → ${texto}`);
      // Solo se etiqueta lo que el Web App guardó, ya tenía o descartó por
      // no ser un aviso. Cualquier otra respuesta (sin conexión, un error,
      // un formato que todavía no reconoce) deja el hilo para reintentarlo
      // en la próxima vuelta; los repetidos los descarta el Web App por ID.
      let r = {};
      try { r = JSON.parse(texto); } catch (e) { /* no era JSON */ }
      if (respuesta.getResponseCode() !== 200 || !(r.ok || r.ignorado)) todoProcesado = false;
    }
    if (todoProcesado) hilo.addLabel(etiqueta);
  }
}

// Se corre una sola vez a mano: deja programada la revisión cada 10 minutos
// y procesa de una vez los correos que ya estaban en la bandeja.
function activar() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('revisarCorreos').timeBased().everyMinutes(10).create();
  revisarCorreos();
}
