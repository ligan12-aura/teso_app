/**
 * Traslado a Supabase y respaldo diario (se ejecuta desde el editor de Apps Script, no desde la página).
 *
 * Antes de usarlo, en Apps Script → Configuración del proyecto → Propiedades del script, agrega:
 *   SUPABASE_URL          https://<proyecto>.supabase.co
 *   SUPABASE_SERVICE_KEY  la clave "service_role" del proyecto (Supabase → Project Settings → API keys).
 *                         Es una clave de administración: va solo aquí, nunca en la página ni en el código.
 *
 * Orden del traslado:
 *   1. cerrarEscrituraEnGoogle()     → la página antigua deja de aceptar cambios (para que nada quede atrás)
 *   2. trasladarDatosASupabase()     → copia todas las hojas a Supabase (se puede repetir: deja Supabase igual a la planilla)
 *   3. trasladarComprobantesASupabase() → copia las boletas de Drive; repítelo hasta que diga "listo"
 *   4. instalarRespaldoDiario()      → cada noche se copia Supabase a esta planilla (solo para mirar)
 */

function supabaseConfig_() {
  var props = PropertiesService.getScriptProperties();
  var url = String(props.getProperty('SUPABASE_URL') || '').replace(/\/+$/, '');
  var key = props.getProperty('SUPABASE_SERVICE_KEY');
  if (!url || !key) throw new Error('Faltan las propiedades SUPABASE_URL y SUPABASE_SERVICE_KEY (Configuración del proyecto → Propiedades del script).');
  return { url: url, key: key };
}
function supaFetch_(ruta, opciones) {
  var c = supabaseConfig_();
  var o = opciones || {};
  var headers = Object.assign({ apikey: c.key, Authorization: 'Bearer ' + c.key }, o.headers || {});
  var r = UrlFetchApp.fetch(c.url + ruta, { method: o.method || 'get', headers: headers, payload: o.payload, contentType: o.contentType, muteHttpExceptions: true });
  var code = r.getResponseCode();
  if (code >= 300) throw new Error('Supabase respondió ' + code + ': ' + r.getContentText().slice(0, 300));
  return r;
}

// 1. La página antigua (esta Apps Script) deja de aceptar cambios
function cerrarEscrituraEnGoogle() {
  PropertiesService.getScriptProperties().setProperty('MIGRADO_SUPABASE', 'si');
  Logger.log('Listo: desde ahora la página antigua no acepta cambios. Para deshacerlo, ejecuta abrirEscrituraEnGoogle().');
}
function abrirEscrituraEnGoogle() {
  PropertiesService.getScriptProperties().deleteProperty('MIGRADO_SUPABASE');
  Logger.log('La página antigua vuelve a aceptar cambios.');
}

// 2. Todas las hojas → tabla "filas" de Supabase (en el mismo orden; repetirlo no duplica)
function trasladarDatosASupabase() {
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty(PROP_SHEET));
  var st = new SheetStore_(ss);
  var total = 0, resumen = [];
  // Supabase queda igual a la planilla: se reemplazan las tablas de la app (no los comprobantes ya copiados)
  supaFetch_('/rest/v1/filas?tabla=in.(' + Object.keys(TesoCore.TABLES).join(',') + ')', { method: 'delete', headers: { Prefer: 'return=minimal' } });
  Object.keys(TesoCore.TABLES).forEach(function (t) {
    var filas = st.read(t).filter(function (r) { return r.id !== '' && r.id !== null && r.id !== undefined; }).map(function (r) {
      var datos = {};
      TesoCore.TABLES[t].forEach(function (c) { datos[c] = r[c] === undefined || r[c] === null ? '' : r[c]; });
      datos.id = String(r.id);
      return { tabla: t, id: datos.id, datos: datos };
    });
    for (var i = 0; i < filas.length; i += 400) {
      supaFetch_('/rest/v1/filas?on_conflict=tabla,id', {
        method: 'post', contentType: 'application/json',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        payload: JSON.stringify(filas.slice(i, i + 400))
      });
    }
    total += filas.length;
    resumen.push(t + ': ' + filas.length);
  });
  Logger.log('Traslado de datos listo (' + total + ' filas). ' + resumen.join(' · '));
}

// 3. Comprobantes de Drive → Supabase Storage (bucket "comprobantes"). Para por tiempo: repítelo hasta "listo".
function trasladarComprobantesASupabase() {
  var inicio = Date.now();
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty(PROP_SHEET));
  var st = new SheetStore_(ss);
  var ids = {};
  ['MovimientosMinisterios', 'MovimientosGenerales', 'Diezmos'].forEach(function (t) {
    st.read(t).forEach(function (r) { if (r.archivoId) ids[String(r.archivoId)] = true; });
  });
  var ya = {};
  JSON.parse(supaFetch_('/rest/v1/filas?select=id&tabla=eq._archivos&limit=100000').getContentText()).forEach(function (r) { ya[r.id] = true; });
  var pendientes = Object.keys(ids).filter(function (id) { return !ya[id]; });
  var hechos = 0, errores = [];
  for (var i = 0; i < pendientes.length; i++) {
    if (Date.now() - inicio > 4.5 * 60 * 1000) break; // Apps Script corta a los 6 minutos
    var id = pendientes[i];
    try {
      var f = DriveApp.getFileById(id);
      var blob = f.getBlob();
      var ruta = 'drive/' + id;
      supaFetch_('/storage/v1/object/comprobantes/' + ruta, { method: 'post', contentType: blob.getContentType(), headers: { 'x-upsert': 'true' }, payload: blob.getBytes() });
      supaFetch_('/rest/v1/filas?on_conflict=tabla,id', {
        method: 'post', contentType: 'application/json',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        payload: JSON.stringify([{ tabla: '_archivos', id: id, datos: { id: id, nombre: f.getName(), mime: blob.getContentType(), ruta: ruta } }])
      });
      hechos++;
    } catch (e) { errores.push(id + ': ' + e.message); }
  }
  var faltan = pendientes.length - hechos;
  Logger.log((faltan - errores.length > 0 ? 'Faltan ' + (faltan - errores.length) + ': vuelve a ejecutar trasladarComprobantesASupabase().' : 'Comprobantes: listo.') +
    ' Copiados ahora: ' + hechos + '. Total en Supabase: ' + (Object.keys(ya).length + hechos) + ' de ' + Object.keys(ids).length + '.' +
    (errores.length ? ' No se pudieron copiar ' + errores.length + ': ' + errores.slice(0, 5).join(' | ') : ''));
}

// 4. Respaldo: cada noche Supabase → esta planilla (las hojas se reemplazan; quedan solo para mirar)
function respaldoDiarioDesdeSupabase() {
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty(PROP_SHEET));
  var porTabla = {};
  for (var desde = 0; ; desde += 1000) {
    var lote = JSON.parse(supaFetch_('/rest/v1/filas?select=tabla,datos&order=n.asc&offset=' + desde + '&limit=1000').getContentText());
    lote.forEach(function (f) { (porTabla[f.tabla] = porTabla[f.tabla] || []).push(f.datos); });
    if (lote.length < 1000) break;
  }
  var st = new SheetStore_(ss);
  Object.keys(TesoCore.TABLES).forEach(function (t) {
    var sh = ensureSheet_(ss, t);
    var cols = TesoCore.TABLES[t].length;
    var ultima = sh.getLastRow();
    if (ultima >= 2) sh.getRange(2, 1, ultima - 1, cols).clearContent();
    var filas = (porTabla[t] || []).map(function (r) { return st.rowValues_(t, r); });
    if (!filas.length) return;
    var falta = filas.length + 1 - sh.getMaxRows();
    if (falta > 0) sh.insertRowsAfter(sh.getMaxRows(), falta + 50);
    formatoFilas_(sh, t, 2, filas.length);
    sh.getRange(2, 1, filas.length, cols).setValues(filas);
  });
  PropertiesService.getScriptProperties().setProperty('ULTIMO_RESPALDO', new Date().toISOString());
}
function instalarRespaldoDiario() {
  ScriptApp.getProjectTriggers().forEach(function (tr) { if (tr.getHandlerFunction() === 'respaldoDiarioDesdeSupabase') ScriptApp.deleteTrigger(tr); });
  ScriptApp.newTrigger('respaldoDiarioDesdeSupabase').timeBased().everyDays(1).atHour(3).create();
  respaldoDiarioDesdeSupabase();
  Logger.log('Respaldo diario instalado (cada noche, cerca de las 3:00) y ejecutado una vez ahora.');
}
