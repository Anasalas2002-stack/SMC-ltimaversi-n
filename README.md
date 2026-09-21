# Finanzas Automático + Presupuesto

Sistema de finanzas personales con dos piezas conectadas:

1. **`apps-script/`** — Web App de Google Apps Script que recibe SMS
   bancarios (enviados desde un Atajo de iPhone), los parsea con regex
   y los guarda en un Google Sheet. Gestionado con
   [`clasp`](https://github.com/google/clasp) para desplegar desde la
   terminal en vez de copiar y pegar en el editor web.
2. **`index.html`** — app de presupuesto de un solo archivo (Chart.js +
   `window.storage`), desplegable en GitHub Pages sin backend propio.
   Lee los movimientos directamente del Google Sheet vía Sheets API,
   con el pegado manual como respaldo.

El Atajo de iPhone (SMS → Apps Script) no forma parte de este repo y no
se modificó.

## Estructura

```
apps-script/          proyecto Apps Script gestionado con clasp
  src/Code.gs          código del Web App (doPost, parsers, getSheet)
  src/appsscript.json  manifiesto
  tests/               suite de pruebas de los parsers (node --test)
index.html             app de presupuesto (GitHub Pages)
docs/SETUP.md          qué configurar manualmente en Google Cloud/Sheets
```

## Empezar

```bash
# Pruebas de los parsers de SMS
cd apps-script && npm install && npm test

# Desplegar cambios del Apps Script (requiere clasp login previo)
npm run push
```

Ver [`docs/SETUP.md`](docs/SETUP.md) para la configuración manual
completa (clasp, API key de Google Sheets, permisos, GitHub Pages).
