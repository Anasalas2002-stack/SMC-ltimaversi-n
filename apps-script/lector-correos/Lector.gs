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
    let todoEnviado = true;
    for (const mensaje of hilo.getMessages()) {
      const respuesta = UrlFetchApp.fetch(WEB_APP_URL, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ correo: mensaje.getPlainBody() }),
        muteHttpExceptions: true,
      });
      // Si el Web App no contestó, el hilo queda sin etiqueta y se reintenta
      // en la próxima vuelta. Los repetidos los descarta el Web App por ID.
      if (respuesta.getResponseCode() !== 200) todoEnviado = false;
      console.log(`${mensaje.getSubject()} → ${respuesta.getContentText()}`);
    }
    if (todoEnviado) hilo.addLabel(etiqueta);
  }
}

// Se corre una sola vez a mano: deja programada la revisión cada 10 minutos
// y procesa de una vez los correos que ya estaban en la bandeja.
function activar() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('revisarCorreos').timeBased().everyMinutes(10).create();
  revisarCorreos();
}
