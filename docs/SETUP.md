# Setup — Finanzas Automático

Esta guía separa dos cosas:

- **Lo que ya quedó resuelto en el código** de este repo (no tienes que
  hacer nada, solo desplegarlo).
- **Lo que tienes que configurar tú a mano** en Google Cloud / Google
  Sheets / GitHub, porque requiere tu cuenta y no se puede automatizar
  desde aquí.

El Atajo de iPhone que envía los SMS al Apps Script **no se tocó** —
sigue funcionando exactamente igual que antes.

---

## 1. Lo que ya está automatizado en código

- `apps-script/` — el proyecto de Apps Script listo para manejarse con
  `clasp` (login una vez, luego `npm run push` / `npm run deploy` en vez
  de copiar y pegar en el editor web).
  - `apps-script/src/Code.gs` — el mismo código que ya tenías (`doPost`,
    los parsers de SMS, `getSheet`), sin cambios de lógica.
  - `apps-script/src/appsscript.json` — manifiesto del Web App.
  - `apps-script/tests/parsers.test.js` — suite de pruebas que carga
    `Code.gs` real y verifica los parsers contra los 2 ejemplos que
    diste (Bancolombia Bre-B y Banco de Bogotá) más casos borde y el
    fallback genérico. Correr con `npm test` dentro de `apps-script/`.
- `index.html` — la app de presupuesto, en la raíz del repo para que
  GitHub Pages la sirva sin configuración adicional. Sigue siendo un
  solo archivo, sin backend propio. Se le agregó una sección
  **"Movimientos del Sheet"** que trae los SMS ya parseados
  directamente desde Google Sheets (Sheets API v4), con un botón
  "Sincronizar desde el Sheet" que reemplaza el copiar y pegar manual.
  El pegado manual se mantiene como respaldo, para extractos en PDF.

## 2. Lo que tienes que hacer tú (una sola vez)

### 2.1. Vincular `clasp` a tu proyecto de Apps Script existente

1. Instala dependencias:
   ```bash
   cd apps-script
   npm install
   ```
2. Inicia sesión (abre el navegador, pide permiso a tu cuenta de
   Google):
   ```bash
   npm run login
   ```
3. Consigue el **Script ID** de tu proyecto actual: abre tu Google
   Sheet → Extensiones → Apps Script → ⚙️ Configuración del proyecto →
   copia el "ID del proyecto de secuencia de comandos".
4. Copia la plantilla y pega ahí el Script ID:
   ```bash
   cp .clasp.json.example .clasp.json
   ```
   y edita `.clasp.json` con el Script ID real. (Este archivo queda
   fuera de git — cada quien lo crea localmente.)
5. Trae lo que hay actualmente en Google para comparar contra lo que
   quedó en `src/Code.gs`:
   ```bash
   npm run pull
   ```
   Si tu proyecto en la nube tiene archivos con otro nombre o contenido
   distinto (por ejemplo, si lo editaste en el navegador después de
   pasarme el código), reconcilia a mano antes de seguir — `src/Code.gs`
   debe quedar como la única fuente de verdad.
6. De ahí en adelante, para desplegar un cambio:
   ```bash
   npm run push          # sube el código al proyecto de Apps Script
   npm run deployments    # lista tus deployments existentes y sus IDs
   npx clasp deploy -i <DEPLOYMENT_ID>   # actualiza ESE deployment sin cambiar su URL
   ```
   Importante: si corres `npm run deploy` sin `-i`, clasp crea un
   deployment **nuevo** con una URL distinta, y tu Atajo de iPhone
   dejaría de apuntar al lugar correcto. Usa siempre `-i` con el ID del
   deployment que ya está conectado al Atajo (ese ID sale de
   `npm run deployments`).

### 2.2. Habilitar la Google Sheets API y crear una API key

La app HTML necesita una API key de Google Cloud para leer el Sheet
directamente (sin backend propio).

1. Ve a [Google Cloud Console](https://console.cloud.google.com/).
2. Crea un proyecto nuevo o usa uno existente (puede ser el mismo que
   ya usa tu cuenta de Google para otras cosas — no tiene que ser el
   mismo proyecto del Apps Script).
3. En **APIs y servicios → Biblioteca**, busca **Google Sheets API** y
   haz clic en **Habilitar**.
4. En **APIs y servicios → Credenciales → Crear credenciales → Clave de
   API**, crea una API key nueva.
5. Restringe la key (muy importante, es de solo lectura pero igual
   conviene limitarla):
   - **Restricciones de la aplicación** → "Referentes HTTP (sitios
     web)" → agrega la URL de tu GitHub Pages, ej.
     `https://tu-usuario.github.io/*`.
   - **Restricciones de API** → "Restringir clave" → selecciona
     únicamente **Google Sheets API**.
6. Copia la key — la vas a pegar dentro de la app (paso 2.4), no en el
   código.

### 2.3. Compartir el Google Sheet para lectura pública

Una API key (sin OAuth) solo puede leer un Sheet que esté compartido
como público de solo lectura:

1. Abre el Google Sheet → botón **Compartir**.
2. En "Acceso general", cambia a **"Cualquiera con el enlace"** con rol
   **Lector**.
3. Copia el **Spreadsheet ID**: es la parte de la URL entre `/d/` y
   `/edit`, ej. en
   `https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrSt/edit`
   el ID es `1AbCdEfGhIjKlMnOpQrSt`.

   **Nota de privacidad:** esto hace que cualquiera con el enlace (no
   indexado, pero no secreto) pueda leer el contenido del Sheet
   completo, incluyendo el texto original de tus SMS. Si te incomoda,
   considera mover el texto original a una pestaña aparte que no
   compartas, o quitar esa columna antes de compartir.

### 2.4. Configurar la app HTML con tus datos

1. Abre `index.html` (localmente o ya publicado en GitHub Pages).
2. En la sección **"Movimientos del Sheet"**, abre
   "Configuración de conexión con Google Sheets".
3. Pega:
   - **Spreadsheet ID** (paso 2.3)
   - **Nombre de la pestaña** (`Movimientos`, ya viene por defecto)
   - **API key** (paso 2.2)
4. Haz clic en **Guardar configuración**. Estos datos se guardan solo
   en tu dispositivo (vía `window.storage`), nunca se suben al
   repositorio.
5. Haz clic en **Sincronizar desde el Sheet** cada vez que quieras
   traer los movimientos nuevos. La app recuerda hasta qué fila del
   Sheet ya importó, así que solo trae lo nuevo cada vez.

### 2.5. Publicar en GitHub Pages

1. En el repo de GitHub: **Settings → Pages**.
2. **Source**: "Deploy from a branch".
3. **Branch**: la rama donde quede este código (ej. `main`) → carpeta
   `/ (root)`.
4. Guarda. GitHub te da la URL pública (algo como
   `https://tu-usuario.github.io/tu-repo/`) — esa es la URL que debes
   usar como referente HTTP al restringir la API key (paso 2.2).

---

## 3. Resumen rápido (checklist)

- [ ] `clasp login` + `.clasp.json` con tu Script ID real
- [ ] `npm run pull` y reconciliar contra `src/Code.gs`
- [ ] Habilitar Google Sheets API en un proyecto de GCP
- [ ] Crear API key, restringida a tu dominio de GitHub Pages y a
      Sheets API
- [ ] Compartir el Sheet como "Cualquiera con el enlace — Lector"
- [ ] Pegar Spreadsheet ID + API key en la app (se guardan localmente)
- [ ] Activar GitHub Pages apuntando a `index.html`
- [ ] Confirmar que el Atajo de iPhone sigue apuntando al mismo
      deployment URL de Apps Script (no cambia con nada de esto)
