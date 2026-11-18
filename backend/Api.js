/**
 * Tesorería · Iglesia Bautista El Redentor
 * ------------------------------------------------------------------
 * Servidor en Google Apps Script.
 *  - Base de datos: una Google Sheet (se abre/descarga como Excel).
 *  - Boletas y comprobantes: carpeta privada en Google Drive.
 *
 * Instalación (ver README.md):
 *  1. Crear un proyecto en https://script.google.com
 *  2. Pegar Core.js y Api.js como dos archivos del proyecto.
 *  3. Ejecutar la función `setup` una vez (autorizar permisos).
 *  4. Implementar > Nueva implementación > Aplicación web
 *     (Ejecutar como: Yo · Acceso: Cualquier persona).
 *  5. Copiar la URL /exec en js/config.js (API_URL).
 */

var PROP_SHEET = 'SPREADSHEET_ID';
var PROP_FOLDER = 'FOLDER_ID';
var PROP_SECRET = 'TOKEN_SECRET';
var PROP_SCHEMA = 'SCHEMA_VERSION';
// Súbelo cada vez que cambien las columnas (TABLES) o la hoja Resumen:
// el servidor se actualiza solo en la siguiente solicitud, sin ejecutar setup().
var SCHEMA_VERSION = '4';

// =================================================================
// Instalación inicial — ejecutar UNA vez desde el editor
// =================================================================
function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss;
  if (props.getProperty(PROP_SHEET)) {
    ss = SpreadsheetApp.openById(props.getProperty(PROP_SHEET));
  } else {
    ss = SpreadsheetApp.create('Tesorería · Iglesia Bautista El Redentor');
    props.setProperty(PROP_SHEET, ss.getId());
  }

  Object.keys(TesoCore.TABLES).forEach(function (name) { ensureSheet_(ss, name); });
  rellenarGrupos_(ss);
  var hoja1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (hoja1 && ss.getSheets().length > 1) ss.deleteSheet(hoja1);
  ss.getSheetByName('Usuarios').hideSheet();
  ss.getSheetByName('Config').hideSheet();
  crearResumen_(ss);

  if (!props.getProperty(PROP_FOLDER)) {
    var folder = DriveApp.createFolder('Tesorería El Redentor · Boletas');
    props.setProperty(PROP_FOLDER, folder.getId());
  }
  if (!props.getProperty(PROP_SECRET)) {
    props.setProperty(PROP_SECRET, Utilities.getUuid() + Utilities.getUuid());
  }

  var usuarios = new SheetStore_(ss).read('Usuarios');
  if (!usuarios.length) {
    var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 14);
    var pass = 'redentor2026';
    new SheetStore_(ss).insert('Usuarios', {
      id: Utilities.getUuid().replace(/-/g, '').slice(0, 14),
      nombre: 'Tesorero', usuario: 'tesorero', rol: 'tesorero', ministerioId: '', email: '',
      activo: true, debeCambiarPass: true, salt: salt,
      hash: TesoCore.hashPassword(pass, salt, sha256Hex_), creadoEn: new Date().toISOString()
    });
    Logger.log('Usuario inicial → usuario: tesorero · contraseña: ' + pass + ' (se pedirá cambiarla)');
  }
  Logger.log('Planilla: ' + ss.getUrl());
  props.setProperty(PROP_SCHEMA, SCHEMA_VERSION);
  Logger.log('Listo. Ahora: Implementar > Nueva implementación > Aplicación web.');
}

function ensureSheet_(ss, name) {
  var cols = TesoCore.TABLES[name];
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var head = sh.getRange(1, 1, 1, cols.length);
  head.setValues([cols]).setFontWeight('bold').setBackground('#23395d').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  // Todo como texto plano (evita que Sheets convierta fechas), salvo montos
  cols.forEach(function (c, i) {
    var rng = sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1);
    rng.setNumberFormat(TesoCore.NUMERIC[c] ? '#,##0' : '@');
  });
  return sh;
}

// Completa la columna "grupo" (tipo de gasto) en filas antiguas que no la tienen
function rellenarGrupos_(ss) {
  var t = 'MovimientosGenerales';
  var sh = ss.getSheetByName(t);
  var last = sh.getLastRow();
  if (last < 2) return;
  var cols = TesoCore.TABLES[t];
  var iTipo = cols.indexOf('tipo'), iCat = cols.indexOf('categoria'), iGrupo = cols.indexOf('grupo');
  var data = sh.getRange(2, 1, last - 1, cols.length).getValues();
  var cambios = 0;
  var out = data.map(function (r) {
    if (r[0] !== '' && !r[iGrupo]) { cambios++; return [TesoCore.grupoDe(r[iTipo], r[iCat])]; }
    return [r[iGrupo]];
  });
  if (cambios) sh.getRange(2, iGrupo + 1, out.length, 1).setValues(out);
}

function colLetter_(table, col) {
  var idx = TesoCore.TABLES[table].indexOf(col);
  var n = idx + 1, s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - m) / 26); }
  return s;
}

function crearResumen_(ss) {
  var sh = ss.getSheetByName('Resumen') || ss.insertSheet('Resumen', 0);
  sh.clear();
  var G = 'MovimientosGenerales', M = 'MovimientosMinisterios';
  var gGrupo = colLetter_(G, 'grupo');
  var gMes = colLetter_(G, 'mes'), gTipo = colLetter_(G, 'tipo'), gMonto = colLetter_(G, 'monto'), gCat = colLetter_(G, 'categoria');
  var mMes = colLetter_(M, 'mes'), mTipo = colLetter_(M, 'tipo'), mMonto = colLetter_(M, 'monto'), mMin = colLetter_(M, 'ministerioId');
  sh.getRange('A1').setValue('Resumen automático · se actualiza solo').setFontWeight('bold').setFontSize(14);
  sh.getRange('A3').setValue('Tesorería general por mes').setFontWeight('bold');
  sh.getRange('A4').setFormula('=IFERROR(QUERY(' + G + '!A:Z,"select ' + gMes + ', sum(' + gMonto + ') where ' + gMes + ' is not null and ' + gMes + ' <> \'mes\' group by ' + gMes + ' pivot ' + gTipo + ' order by ' + gMes + ' desc",1),"Sin datos aún")');
  sh.getRange('F3').setValue('Gastos generales por categoría').setFontWeight('bold');
  sh.getRange('F4').setFormula('=IFERROR(QUERY(' + G + '!A:Z,"select ' + gCat + ', sum(' + gMonto + ') where ' + gTipo + ' = \'gasto\' group by ' + gCat + ' order by sum(' + gMonto + ') desc",1),"Sin datos aún")');
  sh.getRange('A30').setValue('Gastos por tipo y mes').setFontWeight('bold');
  sh.getRange('A31').setFormula('=IFERROR(QUERY(' + G + '!A:Z,"select ' + gGrupo + ', sum(' + gMonto + ') where ' + gTipo + ' = \'gasto\' and ' + gGrupo + ' is not null group by ' + gGrupo + ' pivot ' + gMes + '",1),"Sin datos aún")');
  sh.getRange('J3').setValue('Ministerios (id) por mes').setFontWeight('bold');
  sh.getRange('J4').setFormula('=IFERROR(QUERY(' + M + '!A:Z,"select ' + mMin + ', ' + mMes + ', sum(' + mMonto + ') where ' + mMes + ' is not null and ' + mMes + ' <> \'mes\' group by ' + mMin + ', ' + mMes + ' pivot ' + mTipo + '",1),"Sin datos aún")');
  sh.getRange('A:Z').setNumberFormat('#,##0');
}

// =================================================================
// API HTTP
// =================================================================
function doGet() {
  return json_({ ok: true, data: 'API de Tesorería El Redentor activa' });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Solicitud inválida' });
  }
  migrarSiHaceFalta_();
  var env = buildEnv_();
  var core = TesoCore.create(env);
  var lock = null;
  if (core.isWrite(req.action)) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return json_({ ok: false, error: 'El sistema está ocupado, intenta de nuevo en unos segundos' });
  }
  try {
    return json_(core.handle(req.action, req.payload, req.token));
  } finally {
    if (lock) { SpreadsheetApp.flush(); lock.releaseLock(); }
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Actualiza encabezados, formatos, columna de tipo y hoja Resumen cuando cambia el esquema
function migrarSiHaceFalta_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROP_SCHEMA) === SCHEMA_VERSION || !props.getProperty(PROP_SHEET)) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    if (props.getProperty(PROP_SCHEMA) === SCHEMA_VERSION) return;
    var ss = SpreadsheetApp.openById(props.getProperty(PROP_SHEET));
    Object.keys(TesoCore.TABLES).forEach(function (name) { ensureSheet_(ss, name); });
    rellenarGrupos_(ss);
    crearResumen_(ss);
    SpreadsheetApp.flush();
    props.setProperty(PROP_SCHEMA, SCHEMA_VERSION);
  } finally {
    lock.releaseLock();
  }
}

function buildEnv_() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty(PROP_SHEET);
  if (!sheetId) throw new Error('Falta ejecutar setup()');
  var ss = SpreadsheetApp.openById(sheetId);
  var tz = Session.getScriptTimeZone();
  return {
    store: new SheetStore_(ss),
    files: new DriveFiles_(props.getProperty(PROP_FOLDER)),
    crypto: { sha256Hex: sha256Hex_, hmacHex: hmacHex_ },
    uuid: function () { return Utilities.getUuid(); },
    now: function () { return new Date().toISOString(); },
    today: function () { return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'); },
    secret: props.getProperty(PROP_SECRET),
    extra: { sheetUrl: ss.getUrl() }
  };
}

// =================================================================
// Almacenamiento en Google Sheets
// =================================================================
function SheetStore_(ss) {
  this.ss = ss;
  this.cache = {};
}
SheetStore_.prototype.sheet_ = function (t) {
  var sh = this.ss.getSheetByName(t);
  if (!sh) sh = ensureSheet_(this.ss, t);
  return sh;
};
SheetStore_.prototype.read = function (t) {
  if (this.cache[t]) return this.cache[t].rows;
  var sh = this.sheet_(t);
  var cols = TesoCore.TABLES[t];
  var last = sh.getLastRow();
  var rows = [];
  if (last >= 2) {
    var tz = this.ss.getSpreadsheetTimeZone();
    var values = sh.getRange(2, 1, last - 1, cols.length).getValues();
    values.forEach(function (v, i) {
      if (v[0] === '' || v[0] === null) return;
      var o = { _row: i + 2 };
      cols.forEach(function (c, j) {
        var x = v[j];
        if (x instanceof Date) x = Utilities.formatDate(x, tz, c === 'mes' ? 'yyyy-MM' : 'yyyy-MM-dd');
        o[c] = x;
      });
      rows.push(o);
    });
  }
  this.cache[t] = { rows: rows };
  return rows;
};
SheetStore_.prototype.rowValues_ = function (t, row) {
  return TesoCore.TABLES[t].map(function (c) {
    var v = row[c];
    if (v === undefined || v === null) return '';
    if (TesoCore.NUMERIC[c]) return Number(v) || 0;
    return typeof v === 'boolean' ? String(v) : String(v);
  });
};
SheetStore_.prototype.insert = function (t, row) {
  this.insertMany(t, [row]);
};
SheetStore_.prototype.insertMany = function (t, rows) {
  if (!rows.length) return;
  var self = this;
  var sh = this.sheet_(t);
  var vals = rows.map(function (r) { return self.rowValues_(t, r); });
  var start = sh.getLastRow() + 1;
  // Asegura filas suficientes (las hojas nuevas traen 1000)
  var falta = start + vals.length - 1 - sh.getMaxRows();
  if (falta > 0) sh.insertRowsAfter(sh.getMaxRows(), falta + 200);
  // Formato antes de escribir: texto plano (evita que Sheets convierta fechas) y miles en montos
  formatoFilas_(sh, t, start, vals.length);
  sh.getRange(start, 1, vals.length, vals[0].length).setValues(vals);
  delete this.cache[t];
};

function formatoFilas_(sh, t, start, n) {
  TesoCore.TABLES[t].forEach(function (c, i) {
    sh.getRange(start, i + 1, n, 1).setNumberFormat(TesoCore.NUMERIC[c] ? '#,##0' : '@');
  });
}
SheetStore_.prototype.findRow_ = function (t, id) {
  var rows = this.read(t);
  for (var i = 0; i < rows.length; i++) if (String(rows[i].id) === String(id)) return rows[i]._row;
  return -1;
};
SheetStore_.prototype.update = function (t, id, row) {
  var r = this.findRow_(t, id);
  if (r < 0) throw new Error('Registro no encontrado');
  var vals = this.rowValues_(t, row);
  this.sheet_(t).getRange(r, 1, 1, vals.length).setValues([vals]);
  delete this.cache[t];
};
SheetStore_.prototype.remove = function (t, id) {
  var r = this.findRow_(t, id);
  if (r < 0) return;
  this.sheet_(t).deleteRow(r);
  delete this.cache[t];
};

// =================================================================
// Archivos en Google Drive (privados: solo los entrega la API)
// =================================================================
function DriveFiles_(rootId) {
  this.rootId = rootId;
}
DriveFiles_.prototype.folder_ = function (path) {
  var f = DriveApp.getFolderById(this.rootId);
  (path || []).forEach(function (name) {
    var it = f.getFoldersByName(name);
    f = it.hasNext() ? it.next() : f.createFolder(name);
  });
  return f;
};
DriveFiles_.prototype.save = function (o) {
  var blob = Utilities.newBlob(Utilities.base64Decode(o.base64), o.mime, o.nombre);
  return this.folder_(o.carpeta).createFile(blob).getId();
};
DriveFiles_.prototype.get = function (id) {
  var file = DriveApp.getFileById(id);
  var blob = file.getBlob();
  return { nombre: file.getName(), mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
};
DriveFiles_.prototype.remove = function (id) {
  DriveApp.getFileById(id).setTrashed(true);
};

// =================================================================
// Criptografía
// =================================================================
function bytesToHex_(bytes) {
  return bytes.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}
function sha256Hex_(s) {
  return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8));
}
function hmacHex_(s, key) {
  return bytesToHex_(Utilities.computeHmacSha256Signature(s, key, Utilities.Charset.UTF_8));
}
