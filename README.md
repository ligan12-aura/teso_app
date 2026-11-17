# Tesorería · Iglesia Bautista El Redentor

Aplicación web para llevar el control de la **tesorería general** de la iglesia y de los **fondos de cada ministerio** (Alabanza, Infantil, Jóvenes, Misiones, etc.), con rendición mensual de gastos, fotos de boletas y respaldo automático en una planilla.

> **Modo demo:** agrega `?demo` al final de la dirección (ej: `https://ligan12-aura.github.io/teso_app/?demo`) para practicar con datos de ejemplo guardados solo en tu navegador, sin tocar los datos reales. Contraseña para todos los usuarios demo: `demo`. Útil para capacitar a los líderes.
>
> **Guía integrada:** el botón **Ayuda** explica cada función según el rol (tesorero o líder) y se abre en el tema de la pantalla actual. Se muestra automáticamente la primera vez que alguien entra.

---

## ¿Qué hace?

### Para cada líder de ministerio (celular o computador)
- Ve **solo su ministerio**: saldo disponible, ítem recibido, gastos e ingresos del mes.
- **Rinde gastos** con foto de la boleta (se toma con la cámara del celular y se comprime sola).
- Registra **ingresos adicionales** (ventas, ofrendas especiales, donaciones).
- A fin de mes **confirma la rendición**. El mes queda bloqueado mientras tesorería revisa.
- Si tesorería la **observa**, ve el comentario, corrige y la reenvía.

### Para el tesorero
- **Inicio**: saldo de caja, ingresos/gastos del mes, flujo de 12 meses, de dónde viene y a dónde va el dinero, uso de fondos por ministerio y estado de rendiciones.
- **Tesorería general**: libro de movimientos con saldo acumulado, filtros, búsqueda, comprobantes y el botón **“Registrar culto”** (diezmos + ofrendas de una vez).
- **Ministerios**: tarjeta por ministerio con saldo, % usado, tendencia de gastos y estados.
- **Rendiciones**: revisa, **aprueba u observa**, y **transfiere el ítem del mes siguiente** (individual o todos los aprobados de una vez). La transferencia crea automáticamente el egreso en tesorería general y el ingreso en el ministerio.
- **Configuración**: ministerios, ítems mensuales, usuarios y saldo inicial de caja.
- **Descargar Excel** (.xlsx) con todo en cualquier momento.

### Flujo mensual
```
Líder registra gastos + boletas → Líder confirma rendición → Tesorero aprueba (u observa) → Tesorero transfiere el ítem del mes siguiente
```
El sistema no permite transferir el ítem si la rendición del mes anterior no está aprobada (el tesorero puede forzarlo si es necesario).

---

## Arquitectura (gratis, todo en Google)

| Parte | Tecnología | Costo |
|---|---|---|
| Página web | HTML/CSS/JS sin compilación, publicada en **GitHub Pages** | Gratis |
| Servidor / API | **Google Apps Script** (`backend/Api.js` + `backend/Core.js`) | Gratis |
| Base de datos | **Google Sheets** (se abre o descarga como Excel, se actualiza sola) | Gratis |
| Boletas | Carpeta **privada** de Google Drive (solo la API las entrega) | Gratis |

La lógica de negocio (`backend/Core.js`) es la **misma** en el servidor y en el modo demo, así que lo que pruebas en la demo es exactamente lo que ocurrirá en producción. Los permisos se validan en el servidor: un líder no puede ver ni modificar datos de otros ministerios ni de la tesorería general.

### Hojas de la planilla
`Resumen` (fórmulas automáticas) · `MovimientosGenerales` · `MovimientosMinisterios` · `Rendiciones` · `Transferencias` · `Ministerios` · `Usuarios` (oculta) · `Config` (oculta)

> ⚠️ No edites a mano las hojas salvo que sepas lo que haces: la app usa la columna `id` para encontrar cada registro.

---

## Instalación (≈ 15 minutos)

Hazlo con la **cuenta de Google de la iglesia / tesorería** (será la dueña de la planilla y las boletas).

### 1. Crear el servidor
1. Entra a <https://script.google.com> → **Nuevo proyecto**. Ponle de nombre `Tesorería El Redentor`.
2. Renombra el archivo `Código.gs` a `Core` y pega el contenido de [`backend/Core.js`](backend/Core.js).
3. Crea otro archivo (**+ → Secuencia de comandos**) llamado `Api` y pega [`backend/Api.js`](backend/Api.js).
4. En ⚙️ **Configuración del proyecto** elige la zona horaria `America/Santiago`.
5. Arriba selecciona la función **`setup`** y presiona **Ejecutar**. Acepta los permisos (Google avisará que la app no está verificada: *Configuración avanzada → Ir a Tesorería El Redentor*).
6. En el **Registro de ejecución** verás el enlace de la planilla y el usuario inicial:
   - usuario: `tesorero` · contraseña: `redentor2026` (te pedirá cambiarla al entrar).

### 2. Publicar la API
1. **Implementar → Nueva implementación → ⚙️ Aplicación web**.
2. *Ejecutar como:* **Yo** · *Quién tiene acceso:* **Cualquier persona**.
3. Copia la **URL** que termina en `/exec`.

> “Cualquier persona” solo significa que la URL responde; **sin usuario y contraseña no se entrega ningún dato**.

### 3. Conectar la página
1. En `js/config.js` pega la URL: `API_URL: 'https://script.google.com/macros/s/XXXX/exec'`.
2. Guarda y sube el cambio a GitHub.

### 4. Publicar la página en GitHub Pages
1. En GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
2. En un minuto la app estará en `https://<tu-usuario>.github.io/teso_app/`.
3. Comparte ese enlace con los líderes (en el celular pueden usar *“Agregar a pantalla de inicio”*).

### 5. Primeros pasos
1. Entra como `tesorero` y crea tu contraseña.
2. **Configuración → General**: saldo inicial de caja y fecha.
3. **Configuración → Ministerios**: crea cada ministerio con su ítem mensual.
4. **Configuración → Usuarios**: crea un usuario por líder con una contraseña temporal y envíasela.

### Importar el libro Excel histórico
**Configuración → Importar Excel**: elige el libro “Entradas y salidas” (una hoja por mes, ej. “Enero 2026”). La app clasifica cada línea por tipo de gasto, compara los totales con los del libro y no duplica lo ya importado. El archivo se lee en el navegador y no se sube a GitHub (la carpeta `EXCELS/` está excluida).

### Tipos de gasto
Personal y remuneraciones · Servicios básicos · Templo y mantención · Vehículo · Aportes y cooperación · Ministerios y educación · Ayuda social · Actividades y administración. Se definen en `GRUPOS` dentro de `backend/Core.js`.

### Actualizar el servidor después de un cambio
Con [clasp](https://github.com/google/clasp) (`npm i -g @google/clasp`, `clasp login`, y la API de Apps Script activada en https://script.google.com/home/usersettings). El archivo `.clasp.json` (no se sube a GitHub) apunta al proyecto y usa `backend/` como carpeta:
```bash
clasp push --force
```
```bash
clasp deploy -i <ID_DE_LA_IMPLEMENTACIÓN> -d "descripción del cambio"
```
Así se publica una nueva versión con la **misma URL**. No hace falta ejecutar `setup`: si cambian las columnas, sube `SCHEMA_VERSION` en `backend/Api.js` y la planilla se actualiza sola en la siguiente solicitud.

---

## Desarrollo local
```bash
python .claude/serve.py
```
y abre <http://localhost:5520>. (Cualquier servidor estático sirve; los módulos JS no funcionan abriendo el archivo directamente.)

## Estructura
```
index.html            Página única
css/styles.css        Estilos (responsive: celular, tablet, escritorio)
js/config.js          URL de la API y datos de la iglesia
js/app.js             Login, menú y navegación
js/api.js             Conexión con el servidor (o modo demo)
js/demo.js            Modo demo + datos de ejemplo
js/calc.js            Cálculos (saldos, resúmenes)
js/export.js          Descarga a Excel
js/views/*.js         Pantallas
backend/Core.js       Lógica de negocio compartida
backend/Api.js        Servidor Google Apps Script (Sheets + Drive)
```
