# Setup — GastosMensuales

Flujo completo:

```
SMS del banco → Atajo de iPhone (barrido programado) → POST al Apps Script
→ el Apps Script reconoce el SMS y lo guarda en el Google Sheet
→ la app de presupuesto (GitHub Pages) lee el Sheet a través del mismo Apps Script
```

Esta guía separa lo que ya quedó resuelto en el código de lo que tienes
que hacer tú, porque requiere tu cuenta de Google, de GitHub o tu iPhone.

---

## 1. Lo que ya está en el código

- **`apps-script/src/Code.gs`**: el código del Web App.
  - `doPost` recibe el texto crudo del SMS (`{"texto": "..."}`), reconoce
    7 tipos de mensaje (compra con tarjeta de Banco de Bogotá; compra, pago
    desde producto, transferencia enviada, transferencia recibida, pago QR y
    ahorro en bolsillo de Bancolombia) y guarda la fila. Los duplicados se
    descartan por ID, así que el mismo SMS se puede mandar muchas veces.
  - `doGet?accion=movimientos&clave=...` devuelve todas las filas del Sheet
    para la app. Pide una clave de lectura que vive en las propiedades del
    script, no en el código (este repo es público).
  - Fecha e ID se guardan como texto, para que Sheets no convierta
    "05/10/2026" en 10 de mayo.
- **`apps-script/tests/parsers.test.js`**: 16 pruebas con los SMS reales.
  Se corren con `cd apps-script && npm test`. Cuando llegue un formato de
  SMS nuevo, se agrega el ejemplo aquí antes de tocar la regex.
- **`index.html`**: la app de presupuesto (un solo archivo).
  - Botón **Sincronizar desde el Sheet**: trae los movimientos del mes que
    todavía no has agregado y sugiere categoría. El ahorro y los pagos a la
    tarjeta de Banco de Bogotá vienen marcados como "Ignorar" (no son gastos
    nuevos) y las transferencias recibidas como "Ingreso".
  - Guarda los datos en el navegador (localStorage), así que funciona en
    GitHub Pages sin backend propio.

## 2. Lo que tienes que hacer tú

### 2.1. Actualizar el Apps Script

1. Abre tu proyecto de Apps Script, reemplaza todo el contenido de
   `Código.gs` con [`apps-script/src/Code.gs`](../apps-script/src/Code.gs)
   y guarda.
2. **Crea la clave de lectura**: ⚙️ **Configuración del proyecto** →
   **Propiedades del script** → **Agregar propiedad del script**.
   - Propiedad: `CLAVE_LECTURA`
   - Valor: una frase larga que solo tú sepas (no la reutilices de otra cuenta).
3. **Despliega sin cambiar la URL**: **Implementar → Administrar
   implementaciones** → lápiz ✏️ → Versión: **Nueva versión** → **Implementar**.
   No uses "Nueva implementación": eso crea otra URL y tus Atajos dejarían
   de funcionar.

### 2.2. Publicar la app en GitHub Pages

El error 404 se debía a que GitHub Pages publica desde la rama por defecto
del repo (`claude/habit-tracker-app-8ea1fe`), que está vacía.

1. En GitHub: **Settings → Pages**.
2. **Source**: "Deploy from a branch".
3. **Branch**: `claude/personal-finance-integration-q3d50d`, carpeta `/ (root)` → **Save**.
4. Espera 1 o 2 minutos y abre `https://anasalas2002-stack.github.io/SMC-ltimaversi-n/`.

A futuro conviene tener una rama `main` con la versión estable y publicar
desde ahí.

### 2.3. Conectar la app con el Apps Script (una vez por dispositivo)

1. Abre la app → sección **Movimientos del Sheet** → **Conexión con tu Apps Script**.
2. Pega la URL del Web App (la que termina en `/exec`, la misma de tus
   Atajos) y la `CLAVE_LECTURA`.
3. **Guardar conexión** → **Sincronizar desde el Sheet**.

La URL y la clave quedan guardadas solo en ese navegador.

### 2.4. Los Atajos de iPhone (referencia)

Dos Atajos, uno por banco, con la misma estructura:

1. `Find Messages` con los filtros:
   - `Body` **begins with** `Banco de Bogota:` (o `Bancolombia:`). Usa "begins
     with" y no "contains", para que no encuentre mensajes que tú escribes.
   - `Date` **is in the last** `2` days.
   - `Limit` apagado.
2. `Repeat with Each` sobre los mensajes encontrados.
3. Dentro del bloque: `Get Contents of URL`.
   - URL: la del Web App.
   - Method: `POST`.
   - Request Body: `JSON`, con un campo `texto` = `Repeat Item`.

Para que corran solos, crea automatizaciones personales, por ejemplo **a
cierta hora del día** o **al conectar el cargador**, con "Ejecutar
inmediatamente". Cada barrido revisa los últimos 2 días y el Apps Script
descarta lo que ya estaba.

### 2.5. `clasp` (opcional)

Solo si quieres desplegar el Apps Script desde la terminal en vez de pegar
el código en el editor web:

```bash
cd apps-script
npm install
npm run login
cp .clasp.json.example .clasp.json   # ya trae tu Script ID
npm run push                          # sube el código
npm run deployments                   # lista las implementaciones y sus IDs
npx clasp deploy -i <ID_DE_LA_IMPLEMENTACION_ACTUAL>   # misma URL
```
