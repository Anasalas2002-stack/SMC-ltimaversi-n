# GastosMensuales

Control de gastos personal alimentado por los SMS del banco.

```
SMS del banco → Atajo de iPhone → Apps Script → Google Sheet → app de presupuesto
```

- **`apps-script/`**: Web App de Google Apps Script.
  - Recibe el texto crudo de los SMS (Banco de Bogotá y Bancolombia), los
    reconoce, descarta duplicados por ID y los guarda en el Sheet.
  - También entrega los movimientos a la app, protegido por una clave de lectura.
  - Se puede desplegar con [`clasp`](https://github.com/google/clasp) o pegando `src/Code.gs` en el editor.
- **`index.html`**: app de presupuesto de un solo archivo (Chart.js), publicada en GitHub Pages.
  - Sincroniza los movimientos del Sheet y sugiere la categoría de cada uno.
  - Separa ingresos, ahorro y pagos de tarjeta para no contarlos como gasto.

## Estructura

```
apps-script/
  src/Code.gs          Web App (doPost: SMS → Sheet, doGet: Sheet → app)
  src/appsscript.json  manifiesto
  tests/               pruebas con SMS reales (node --test)
index.html             app de presupuesto (GitHub Pages)
docs/SETUP.md          configuración manual paso a paso
```

## Pruebas

```bash
cd apps-script && npm test
```

Configuración completa (Apps Script, GitHub Pages, Atajos): [`docs/SETUP.md`](docs/SETUP.md).
