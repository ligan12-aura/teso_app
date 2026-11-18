/**
 * Tesorería · Iglesia Bautista El Redentor
 * ------------------------------------------------------------------
 * Lógica de negocio COMPARTIDA.
 *  - En producción se ejecuta dentro de Google Apps Script (Api.js).
 *  - En el modo demo se ejecuta en el navegador (js/demo.js).
 * Así ambas versiones se comportan exactamente igual.
 *
 * No usa APIs propias de ninguno de los dos entornos: todo lo externo
 * (almacenamiento, archivos, criptografía, fecha) llega en `env`.
 */
var TesoCore = (function () {
  'use strict';

  // ---------------------------------------------------------------
  // Esquema de datos (cada tabla = una hoja del Excel/Google Sheet)
  // ---------------------------------------------------------------
  var TABLES = {
    Usuarios: ['id', 'nombre', 'usuario', 'rol', 'ministerioId', 'email', 'activo', 'debeCambiarPass', 'salt', 'hash', 'creadoEn'],
    Ministerios: ['id', 'nombre', 'color', 'icono', 'itemMensual', 'activo', 'creadoEn', 'presupuestoMensual'],
    MovimientosGenerales: ['id', 'fecha', 'mes', 'tipo', 'categoria', 'descripcion', 'monto', 'medio', 'archivoId', 'ministerioId', 'origen', 'refId', 'creadoPor', 'creadoEn', 'actualizadoEn', 'grupo'],
    MovimientosMinisterios: ['id', 'ministerioId', 'fecha', 'mes', 'tipo', 'categoria', 'descripcion', 'monto', 'archivoId', 'origen', 'refId', 'creadoPor', 'creadoEn', 'actualizadoEn'],
    Rendiciones: ['id', 'ministerioId', 'mes', 'estado', 'comentarioLider', 'fechaEnvio', 'comentarioTesorero', 'fechaRevision', 'revisadoPor'],
    Transferencias: ['id', 'ministerioId', 'mes', 'monto', 'fecha', 'movGeneralId', 'movMinisterioId', 'creadoPor', 'creadoEn'],
    Config: ['id', 'valor']
  };
  var NUMERIC = { monto: 1, itemMensual: 1, presupuestoMensual: 1 };
  var BOOL = { activo: 1, debeCambiarPass: 1 };

  // Tipos de gasto/ingreso de la tesorería general: cada grupo reúne varias categorías
  var GRUPOS = {
    gasto: [
      ['Personal y remuneraciones', ['Sueldo pastoral', 'Imposiciones y previsión', 'Asignación familiar', 'Fondo de indemnización', 'Guardatemplo', 'Aguinaldos y bonos']],
      ['Servicios básicos', ['Luz', 'Agua', 'Gas', 'Internet y teléfono']],
      ['Templo y mantención', ['Arriendo', 'Aseo y limpieza', 'Mantención templo', 'Equipamiento y mobiliario']],
      ['Vehículo', ['Mantención vehículo', 'Combustible', 'Seguro y permisos vehículo']],
      ['Aportes y cooperación', ['Aportes a la denominación', 'Aportes a instituciones']],
      ['Ministerios y educación', ['Asignación ministerios', 'Escuela dominical', 'Misiones']],
      ['Ayuda social', ['Ayuda social', 'Ofrendas solidarias', 'Condolencias']],
      ['Actividades y administración', ['Reuniones y directorio', 'Eventos y celebraciones', 'Gastos bancarios', 'Gastos varios', 'Otros gastos']]
    ],
    ingreso: [
      ['Diezmos y ofrendas', ['Diezmos', 'Ofrendas', 'Ofrenda misionera', 'Ofrenda pro-templo']],
      ['Ofrendas especiales', ['Ofrendas solidarias', 'Donaciones']],
      ['Otros ingresos', ['Actividades', 'Reintegros', 'Otros ingresos']]
    ]
  };
  var SIN_GRUPO = 'Sin clasificar';
  function aplanar(lista) { return lista.reduce(function (a, g) { return a.concat(g[1]); }, []); }
  function grupoDe(tipo, categoria) {
    var lista = GRUPOS[tipo] || [];
    for (var i = 0; i < lista.length; i++) if (lista[i][1].indexOf(categoria) >= 0) return lista[i][0];
    return SIN_GRUPO;
  }

  var CATEGORIAS = {
    ministerio: {
      ingreso: ['Ítem mensual', 'Venta / actividad', 'Ofrenda especial', 'Donación', 'Otro ingreso'],
      gasto: ['Materiales', 'Alimentación', 'Transporte', 'Equipamiento', 'Decoración', 'Impresiones', 'Regalos / premios', 'Ayuda social', 'Actividad / evento', 'Aportes y cuotas', 'Evangelismo y misiones', 'Otro gasto']
    },
    general: { ingreso: aplanar(GRUPOS.ingreso), gasto: aplanar(GRUPOS.gasto) }
  };
  // Categorías que solo se crean automáticamente al transferir un ítem
  var RESERVADAS = { ministerio: 'Ítem mensual', general: 'Asignación ministerios' };
  var MEDIOS = ['Efectivo', 'Transferencia', 'Depósito', 'Cheque', 'Tarjeta'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MAX_ARCHIVO_B64 = 11 * 1024 * 1024; // ~8 MB reales
  var MAX_MONTO = 1000000000;

  // ---------------------------------------------------------------
  // Utilidades puras
  // ---------------------------------------------------------------
  function TesoError(msg, code) {
    var e = new Error(msg);
    e.code = code || 'ERR';
    return e;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toBool(v) { return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true'; }
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s)); }
  function isMonth(s) { return /^\d{4}-\d{2}$/.test(String(s)); }
  function prevMonth(m) {
    var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1;
    if (mo === 0) { y--; mo = 12; }
    return y + '-' + pad(mo);
  }
  function nextMonth(m) {
    var y = +m.slice(0, 4), mo = +m.slice(5, 7) + 1;
    if (mo === 13) { y++; mo = 1; }
    return y + '-' + pad(mo);
  }
  function pesos(n) {
    var v = Math.round(Number(n) || 0), neg = v < 0;
    var t = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-$' : '$') + t;
  }
  function labelMes(m) { return MESES[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4); }
  function normalize(table, row) {
    var out = {};
    TABLES[table].forEach(function (k) {
      var v = row[k];
      if (v === undefined || v === null) v = '';
      if (NUMERIC[k]) v = v === '' ? 0 : Number(v) || 0;
      else if (BOOL[k]) v = toBool(v);
      else v = String(v);
      out[k] = v;
    });
    return out;
  }
  function hashPassword(pass, salt, sha256Hex) {
    var h = salt + '|' + pass;
    for (var i = 0; i < 200; i++) h = sha256Hex(h + salt);
    return h;
  }
  function publicUser(u) {
    return { id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol, ministerioId: u.ministerioId, email: u.email, activo: u.activo, debeCambiarPass: u.debeCambiarPass };
  }

  // ---------------------------------------------------------------
  // Instancia con un entorno concreto
  // env = { store, files, crypto:{sha256Hex,hmacHex}, uuid(), now(), today(), secret, extra }
  // ---------------------------------------------------------------
  function create(env) {
    var store = env.store;
    var files = env.files;

    function all(t) { return store.read(t).map(function (r) { return normalize(t, r); }); }
    function find(t, id) {
      var rows = all(t);
      for (var i = 0; i < rows.length; i++) if (rows[i].id === String(id)) return rows[i];
      return null;
    }
    function insert(t, row) { var r = normalize(t, row); store.insert(t, r); return r; }
    function insertMany(t, rows) {
      var rs = rows.map(function (row) { return normalize(t, row); });
      if (store.insertMany) store.insertMany(t, rs);
      else rs.forEach(function (r) { store.insert(t, r); });
      return rs;
    }
    function update(t, id, patch) {
      var cur = find(t, id);
      if (!cur) throw TesoError('Registro no encontrado');
      var r = normalize(t, Object.assign({}, cur, patch, { id: cur.id }));
      store.update(t, cur.id, r);
      return r;
    }
    function remove(t, id) { store.remove(t, String(id)); }
    function uid() { return String(env.uuid()).replace(/-/g, '').slice(0, 14); }

    // ---------------- Autenticación ----------------
    function signToken(u) {
      var exp = Date.now() + 7 * 24 * 3600 * 1000; // 7 días
      var p = u.id + '.' + exp + '.' + u.hash.slice(0, 10);
      return p + '.' + env.crypto.hmacHex(p, env.secret);
    }
    function verifyToken(tok) {
      var parts = String(tok || '').split('.');
      if (parts.length !== 4) throw TesoError('Debes iniciar sesión', 'AUTH');
      var p = parts.slice(0, 3).join('.');
      if (env.crypto.hmacHex(p, env.secret) !== parts[3]) throw TesoError('Sesión inválida', 'AUTH');
      if (+parts[1] < Date.now()) throw TesoError('Tu sesión expiró, vuelve a ingresar', 'AUTH');
      var u = find('Usuarios', parts[0]);
      if (!u || !u.activo) throw TesoError('Usuario no habilitado', 'AUTH');
      if (u.hash.slice(0, 10) !== parts[2]) throw TesoError('Tu contraseña cambió, vuelve a ingresar', 'AUTH');
      return u;
    }

    function login(_, p) {
      var usuario = String(p.usuario || '').trim().toLowerCase();
      var u = all('Usuarios').filter(function (x) { return x.usuario === usuario; })[0];
      if (!u || !u.activo || hashPassword(String(p.password || ''), u.salt, env.crypto.sha256Hex) !== u.hash) {
        throw TesoError('Usuario o contraseña incorrectos');
      }
      return { token: signToken(u), user: publicUser(u) };
    }

    function me(user) { return { user: publicUser(user) }; }

    function cambiarPassword(user, p) {
      if (hashPassword(String(p.actual || ''), user.salt, env.crypto.sha256Hex) !== user.hash) throw TesoError('La contraseña actual no es correcta');
      var nueva = String(p.nueva || '');
      if (nueva.length < 6) throw TesoError('La nueva contraseña debe tener al menos 6 caracteres');
      var salt = uid();
      var u = update('Usuarios', user.id, { salt: salt, hash: hashPassword(nueva, salt, env.crypto.sha256Hex), debeCambiarPass: false });
      return { token: signToken(u), user: publicUser(u) };
    }

    // ---------------- Lectura ----------------
    function config() {
      var c = { nombreIglesia: 'Iglesia Bautista El Redentor', saldoInicial: 0, fechaSaldoInicial: '', presupuestoGeneral: 0 };
      all('Config').forEach(function (r) {
        if (r.id === 'saldoInicial' || r.id === 'presupuestoGeneral') c[r.id] = Number(r.valor) || 0;
        else if (r.id !== 'presupuesto') c[r.id] = r.valor;
      });
      return c;
    }

    function getData(user) {
      var base = {
        user: publicUser(user),
        config: config(),
        categorias: CATEGORIAS,
        grupos: GRUPOS,
        reservadas: RESERVADAS,
        medios: MEDIOS,
        hoy: env.today(),
        extra: env.extra || {}
      };
      if (user.rol === 'tesorero') {
        base.ministerios = all('Ministerios');
        base.usuarios = all('Usuarios').map(publicUser);
        base.movMinisterios = all('MovimientosMinisterios');
        base.movGenerales = all('MovimientosGenerales');
        base.rendiciones = all('Rendiciones');
        base.transferencias = all('Transferencias');
      } else {
        var mid = user.ministerioId;
        var own = function (r) { return r.ministerioId === mid; };
        base.ministerios = all('Ministerios').filter(function (m) { return m.id === mid; });
        base.usuarios = [publicUser(user)];
        base.movMinisterios = all('MovimientosMinisterios').filter(own);
        base.movGenerales = [];
        base.rendiciones = all('Rendiciones').filter(own);
        base.transferencias = all('Transferencias').filter(own);
        base.extra = {};
      }
      return base;
    }

    // ---------------- Helpers de dominio ----------------
    function getMinisterio(id) {
      var m = find('Ministerios', id);
      if (!m) throw TesoError('Ministerio no encontrado');
      return m;
    }
    function ministerioDe(user, p) {
      if (user.rol === 'tesorero') return getMinisterio(p.ministerioId);
      if (!user.ministerioId) throw TesoError('Tu usuario no tiene un ministerio asignado. Habla con el tesorero.');
      return getMinisterio(user.ministerioId);
    }
    function rendicion(mid, mes) {
      return all('Rendiciones').filter(function (r) { return r.ministerioId === mid && r.mes === mes; })[0] || null;
    }
    function estadoRendicion(mid, mes) { var r = rendicion(mid, mes); return r ? r.estado : 'abierta'; }
    function puedeEditarMes(user, mid, mes) {
      if (user.rol === 'tesorero') return true;
      var e = estadoRendicion(mid, mes);
      return e === 'abierta' || e === 'observada';
    }
    function exigirEditable(user, mid, mes) {
      if (!puedeEditarMes(user, mid, mes)) {
        throw TesoError('La rendición de ' + labelMes(mes) + ' ya fue enviada o aprobada; no se puede modificar.');
      }
    }
    function validarMov(p, ambito, permitirReservada) {
      var tipo = p.tipo;
      if (tipo !== 'ingreso' && tipo !== 'gasto') throw TesoError('Tipo de movimiento inválido');
      if (!isDate(p.fecha)) throw TesoError('Fecha inválida');
      if (p.fecha > env.today()) throw TesoError('La fecha no puede ser futura');
      if (p.fecha < '2000-01-01') throw TesoError('Fecha inválida');
      var monto = Math.round(Number(p.monto));
      if (!(monto > 0)) throw TesoError('El monto debe ser mayor a 0');
      if (monto > MAX_MONTO) throw TesoError('El monto es demasiado grande (máx. $1.000.000.000)');
      var cat = String(p.categoria || '').trim();
      if (!cat) throw TesoError('Selecciona una categoría');
      if (cat === RESERVADAS[ambito] && !permitirReservada) throw TesoError('La categoría "' + cat + '" se registra automáticamente al transferir el ítem.');
      return { fecha: p.fecha, tipo: tipo, categoria: cat, descripcion: String(p.descripcion || '').trim().slice(0, 300), monto: monto };
    }
    // ---------------- Presupuestos ----------------
    // Ministerio: presupuesto mensual fijo que define el tesorero (independiente del ítem).
    // Lo gastado en el mes no puede superarlo. 0 = sin límite.
    function presupuestoMinisterio(m, mes, excluirId) {
      var gastado = 0;
      all('MovimientosMinisterios').forEach(function (x) {
        if (x.ministerioId === m.id && x.mes === mes && x.id !== excluirId && x.tipo === 'gasto') gastado += x.monto;
      });
      var limite = m.presupuestoMensual || 0;
      return { limite: limite, gastado: gastado, disponible: limite - gastado };
    }
    function exigirPresupuestoMinisterio(m, mes, monto, excluirId) {
      var b = presupuestoMinisterio(m, mes, excluirId);
      if (!b.limite) return;
      if (b.gastado + monto > b.limite) {
        throw TesoError('Este gasto supera el presupuesto de ' + m.nombre + ' para ' + labelMes(mes) + '. ' +
          'Presupuesto: ' + pesos(b.limite) + ' · ya gastado: ' + pesos(b.gastado) + ' · disponible: ' + pesos(Math.max(0, b.disponible)) +
          '. Si es necesario, el tesorero puede ajustar el presupuesto del ministerio.', 'PRESUPUESTO');
      }
    }
    // Tesorería general: un presupuesto fijo mensual para TODOS sus gastos
    // (incluye las transferencias de ítems a los ministerios). 0 = sin límite.
    function presupuestoGeneral(mes, excluirId) {
      var limite = config().presupuestoGeneral || 0;
      var gastado = 0;
      all('MovimientosGenerales').forEach(function (x) {
        if (x.mes === mes && x.tipo === 'gasto' && x.id !== excluirId) gastado += x.monto;
      });
      return { limite: limite, gastado: gastado, disponible: limite - gastado };
    }
    function exigirPresupuestoGeneral(mes, monto, excluirId) {
      var b = presupuestoGeneral(mes, excluirId);
      if (!b.limite) return;
      if (b.gastado + monto > b.limite) {
        throw TesoError('Este gasto supera el presupuesto mensual de la tesorería general para ' + labelMes(mes) + '. ' +
          'Presupuesto: ' + pesos(b.limite) + ' · ya gastado: ' + pesos(b.gastado) + ' · disponible: ' + pesos(Math.max(0, b.disponible)) +
          '. Si el gasto es necesario, el tesorero debe ajustar el presupuesto en Configuración → Presupuesto.', 'PRESUPUESTO');
      }
    }

    function guardarArchivo(archivo, carpeta) {
      if (!archivo || !archivo.base64) return '';
      if (archivo.base64.length > MAX_ARCHIVO_B64) throw TesoError('El archivo es demasiado grande (máx. 8 MB)');
      var mime = String(archivo.mime || '');
      if (!/^image\//.test(mime) && mime !== 'application/pdf') throw TesoError('Solo se aceptan imágenes o PDF');
      return files.save({ nombre: String(archivo.nombre || 'boleta'), mime: mime, base64: archivo.base64, carpeta: carpeta });
    }
    function borrarArchivo(id) { if (id) { try { files.remove(id); } catch (e) { /* ignorar */ } } }

    // ---------------- Movimientos de ministerios ----------------
    function addMovMinisterio(user, p) {
      var m = ministerioDe(user, p);
      var d = validarMov(p, 'ministerio');
      var mes = d.fecha.slice(0, 7);
      exigirEditable(user, m.id, mes);
      if (d.tipo === 'gasto') exigirPresupuestoMinisterio(m, mes, d.monto);
      var archivoId = guardarArchivo(p.archivo, ['Boletas ministerios', m.nombre, mes]);
      var now = env.now();
      return insert('MovimientosMinisterios', Object.assign(d, {
        id: uid(), ministerioId: m.id, mes: mes, archivoId: archivoId, origen: 'manual', creadoPor: user.id, creadoEn: now, actualizadoEn: now
      }));
    }
    function movMinisterioPropio(user, id) {
      var mov = find('MovimientosMinisterios', id);
      if (!mov) throw TesoError('Movimiento no encontrado');
      if (user.rol !== 'tesorero' && mov.ministerioId !== user.ministerioId) throw TesoError('No tienes permiso', 'FORBIDDEN');
      if (mov.origen === 'transferencia') throw TesoError('El ítem mensual se registra al transferirlo; si hubo un error, anúlalo desde el panel de rendición del ministerio (botón Anular).');
      return mov;
    }
    function updateMovMinisterio(user, p) {
      var mov = movMinisterioPropio(user, p.id);
      var d = validarMov(p, 'ministerio');
      var mes = d.fecha.slice(0, 7);
      exigirEditable(user, mov.ministerioId, mov.mes);
      exigirEditable(user, mov.ministerioId, mes);
      var m = getMinisterio(mov.ministerioId);
      if (d.tipo === 'gasto') exigirPresupuestoMinisterio(m, mes, d.monto, mov.id);
      var archivoId = mov.archivoId;
      if (p.archivo && p.archivo.base64) {
        var nuevo = guardarArchivo(p.archivo, ['Boletas ministerios', m.nombre, mes]);
        borrarArchivo(archivoId);
        archivoId = nuevo;
      } else if (p.quitarArchivo) {
        borrarArchivo(archivoId);
        archivoId = '';
      }
      return update('MovimientosMinisterios', mov.id, Object.assign(d, { mes: mes, archivoId: archivoId, actualizadoEn: env.now() }));
    }
    function deleteMovMinisterio(user, p) {
      var mov = movMinisterioPropio(user, p.id);
      exigirEditable(user, mov.ministerioId, mov.mes);
      borrarArchivo(mov.archivoId);
      remove('MovimientosMinisterios', mov.id);
      return { id: mov.id };
    }

    // ---------------- Rendiciones ----------------
    function upsertRendicion(mid, mes, patch) {
      var r = rendicion(mid, mes);
      if (r) return update('Rendiciones', r.id, patch);
      return insert('Rendiciones', Object.assign({ id: uid(), ministerioId: mid, mes: mes, estado: 'abierta' }, patch));
    }
    function enviarRendicion(user, p) {
      var m = ministerioDe(user, p);
      if (!isMonth(p.mes)) throw TesoError('Mes inválido');
      var e = estadoRendicion(m.id, p.mes);
      if (e === 'enviada') throw TesoError('Esta rendición ya fue enviada y está en revisión.');
      if (e === 'aprobada') throw TesoError('Esta rendición ya fue aprobada.');
      return upsertRendicion(m.id, p.mes, {
        estado: 'enviada', comentarioLider: String(p.comentario || '').slice(0, 500), fechaEnvio: env.now()
      });
    }
    function retirarRendicion(user, p) {
      var m = ministerioDe(user, p);
      if (estadoRendicion(m.id, p.mes) !== 'enviada') throw TesoError('Solo puedes retirar una rendición que esté en revisión.');
      return upsertRendicion(m.id, p.mes, { estado: 'abierta', fechaEnvio: '' });
    }
    function revisarRendicion(user, p) {
      var m = getMinisterio(p.ministerioId);
      if (!isMonth(p.mes)) throw TesoError('Mes inválido');
      if (p.decision !== 'aprobada' && p.decision !== 'observada') throw TesoError('Decisión inválida');
      var e = estadoRendicion(m.id, p.mes);
      if (p.decision === 'aprobada' && e !== 'enviada' && !p.forzar) {
        throw TesoError('El líder aún no ha confirmado la rendición de ' + labelMes(p.mes) + '.', 'NEEDS_FORCE');
      }
      if (p.decision === 'observada' && !String(p.comentario || '').trim()) throw TesoError('Escribe qué debe corregir el líder.');
      return upsertRendicion(m.id, p.mes, {
        estado: p.decision, comentarioTesorero: String(p.comentario || '').slice(0, 500), fechaRevision: env.now(), revisadoPor: user.id
      });
    }

    // ---------------- Transferencia del ítem ----------------
    function transferirItem(user, p) {
      var m = getMinisterio(p.ministerioId);
      var mes = p.mes;
      if (!isMonth(mes)) throw TesoError('Mes inválido');
      var transf = all('Transferencias');
      if (transf.some(function (t) { return t.ministerioId === m.id && t.mes === mes; })) {
        throw TesoError('El ítem de ' + labelMes(mes) + ' ya fue transferido a ' + m.nombre + '.');
      }
      var monto = Math.round(Number(p.monto !== undefined && p.monto !== '' ? p.monto : m.itemMensual));
      if (!(monto > 0)) throw TesoError('El monto a transferir debe ser mayor a 0');
      if (monto > MAX_MONTO) throw TesoError('El monto es demasiado grande');
      if (!(m.itemMensual > 0)) throw TesoError('Primero define el ítem mensual de ' + m.nombre + ' en Configuración → Ministerios.');
      if (monto > m.itemMensual) throw TesoError('La transferencia no puede superar el ítem mensual de ' + m.nombre + ': ' + pesos(m.itemMensual) + '.', 'PRESUPUESTO');
      var prev = prevMonth(mes);
      if (!p.forzar) {
        var tieneHistoria = transf.some(function (t) { return t.ministerioId === m.id && t.mes < mes; }) ||
          all('MovimientosMinisterios').some(function (x) { return x.ministerioId === m.id && x.mes < mes; });
        if (tieneHistoria && estadoRendicion(m.id, prev) !== 'aprobada') {
          throw TesoError('La rendición de ' + labelMes(prev) + ' de ' + m.nombre + ' aún no está aprobada.', 'NEEDS_FORCE');
        }
      }
      var fecha = isDate(p.fecha) && p.fecha <= env.today() ? p.fecha : env.today();
      exigirPresupuestoGeneral(fecha.slice(0, 7), monto);
      var now = env.now();
      var tid = uid(), gid = uid(), mmid = uid();
      insert('MovimientosGenerales', {
        id: gid, fecha: fecha, mes: fecha.slice(0, 7), tipo: 'gasto', categoria: RESERVADAS.general,
        descripcion: 'Ítem ' + labelMes(mes) + ' · ' + m.nombre, monto: monto, medio: 'Transferencia', grupo: grupoDe('gasto', RESERVADAS.general),
        ministerioId: m.id, origen: 'transferencia', refId: tid, creadoPor: user.id, creadoEn: now, actualizadoEn: now
      });
      insert('MovimientosMinisterios', {
        id: mmid, ministerioId: m.id, fecha: fecha, mes: mes, tipo: 'ingreso', categoria: RESERVADAS.ministerio,
        descripcion: 'Ítem mensual ' + labelMes(mes), monto: monto, origen: 'transferencia', refId: tid,
        creadoPor: user.id, creadoEn: now, actualizadoEn: now
      });
      return insert('Transferencias', {
        id: tid, ministerioId: m.id, mes: mes, monto: monto, fecha: fecha, movGeneralId: gid, movMinisterioId: mmid, creadoPor: user.id, creadoEn: now
      });
    }
    function anularTransferencia(user, p) {
      var t = find('Transferencias', p.id);
      if (!t) throw TesoError('Transferencia no encontrada');
      remove('MovimientosGenerales', t.movGeneralId);
      remove('MovimientosMinisterios', t.movMinisterioId);
      remove('Transferencias', t.id);
      return { id: t.id };
    }

    // ---------------- Tesorería general ----------------
    function datosGeneral(p, permitirReservada) {
      var d = validarMov(p, 'general', permitirReservada);
      d.grupo = grupoDe(d.tipo, d.categoria);
      var medio = String(p.medio || '').trim();
      d.medio = medio;
      d.mes = d.fecha.slice(0, 7);
      d.ministerioId = p.ministerioId ? String(p.ministerioId) : '';
      return d;
    }
    function addMovGeneral(user, p) {
      var d = datosGeneral(p);
      if (d.tipo === 'gasto') exigirPresupuestoGeneral(d.mes, d.monto);
      var now = env.now();
      d.archivoId = guardarArchivo(p.archivo, ['Comprobantes tesorería', d.mes]);
      return insert('MovimientosGenerales', Object.assign(d, { id: uid(), origen: 'manual', creadoPor: user.id, creadoEn: now, actualizadoEn: now }));
    }
    function addMovGeneralLote(user, p) {
      if (!isDate(p.fecha)) throw TesoError('Fecha inválida');
      var items = (p.items || []).filter(function (it) { return Number(it.monto) > 0; });
      if (!items.length) throw TesoError('Ingresa al menos un monto');
      var creados = items.map(function (it) {
        return addMovGeneral(user, { fecha: p.fecha, tipo: 'ingreso', categoria: it.categoria, monto: it.monto, medio: it.medio || p.medio, descripcion: it.descripcion || p.descripcion });
      });
      return { creados: creados.length };
    }
    function movGeneralManual(id) {
      var mov = find('MovimientosGenerales', id);
      if (!mov) throw TesoError('Movimiento no encontrado');
      if (mov.origen === 'transferencia') throw TesoError('Este movimiento es la transferencia de un ítem; anúlalo desde el detalle del ministerio (botón Anular en el panel de rendición).');
      return mov;
    }
    function updateMovGeneral(user, p) {
      var mov = movGeneralManual(p.id);
      var d = datosGeneral(p, mov.origen === 'importado');
      if (mov.origen !== 'importado' && d.tipo === 'gasto') exigirPresupuestoGeneral(d.mes, d.monto, mov.id);
      var archivoId = mov.archivoId;
      if (p.archivo && p.archivo.base64) {
        var nuevo = guardarArchivo(p.archivo, ['Comprobantes tesorería', d.mes]);
        borrarArchivo(archivoId);
        archivoId = nuevo;
      } else if (p.quitarArchivo) {
        borrarArchivo(archivoId);
        archivoId = '';
      }
      return update('MovimientosGenerales', mov.id, Object.assign(d, { archivoId: archivoId, actualizadoEn: env.now() }));
    }
    function deleteMovGeneral(user, p) {
      var mov = movGeneralManual(p.id);
      borrarArchivo(mov.archivoId);
      remove('MovimientosGenerales', mov.id);
      return { id: mov.id };
    }

    // Importación masiva (p. ej. desde el libro Excel histórico).
    // Cada fila trae un refId único: si ya existe, se omite (no duplica).
    function importarMovimientos(user, p) {
      var items = p.items || [];
      if (!items.length) throw TesoError('No hay movimientos para importar');
      if (items.length > 1500) throw TesoError('Importa como máximo 1500 movimientos por vez');
      var existentes = {};
      all('MovimientosGenerales').forEach(function (m) { existentes[m.id] = 1; if (m.refId) existentes[m.refId] = 1; });
      var now = env.now(), nuevos = [], omitidos = 0;
      items.forEach(function (it, i) {
        var ref = String(it.refId || '');
        if (!ref) throw TesoError('Fila ' + (i + 1) + ': falta el identificador de origen');
        if (existentes[ref] || (it.idOriginal && existentes[it.idOriginal])) { omitidos++; return; }
        var d;
        try { d = datosGeneral(it, true); } catch (e) { throw TesoError('Fila ' + (i + 1) + ' (' + (it.descripcion || '') + '): ' + e.message); }
        existentes[ref] = 1;
        nuevos.push(Object.assign(d, { id: uid(), archivoId: '', origen: 'importado', refId: ref, creadoPor: user.id, creadoEn: now, actualizadoEn: now }));
      });
      if (nuevos.length) insertMany('MovimientosGenerales', nuevos);
      if (p.saldoInicial !== undefined && p.saldoInicial !== null && p.saldoInicial !== '') {
        saveConfig(user, { saldoInicial: p.saldoInicial, fechaSaldoInicial: p.fechaSaldoInicial || '' });
      }
      return { importados: nuevos.length, omitidos: omitidos };
    }

    // Importación del historial de un ministerio (planilla tipo).
    // - No duplica: omite filas cuyo refId o id ya existe.
    // - El saldo inicial se registra como ingreso "Saldo inicial" el último día del año anterior.
    // - Las filas "Ítem mensual" quedan marcadas como transferidas (no se pueden transferir de nuevo).
    // - Los meses importados anteriores al actual quedan con la rendición aprobada.
    function importarMovimientosMinisterio(user, p) {
      var m = getMinisterio(p.ministerioId);
      var items = p.items || [];
      if (!items.length && !p.saldoInicial) throw TesoError('No hay movimientos para importar');
      if (items.length > 1500) throw TesoError('Importa como máximo 1500 movimientos por vez');
      var propios = all('MovimientosMinisterios').filter(function (x) { return x.ministerioId === m.id; });
      var existentes = {};
      propios.forEach(function (x) { existentes[x.id] = 1; if (x.refId) existentes[x.refId] = 1; });
      var now = env.now(), nuevos = [], omitidos = 0;
      var agregar = function (it, i) {
        var ref = String(it.refId || '');
        if (!ref) throw TesoError('Fila ' + (i + 1) + ': falta el identificador de origen');
        if (existentes[ref] || (it.idOriginal && existentes[it.idOriginal])) { omitidos++; return; }
        var d;
        try { d = validarMov(it, 'ministerio', true); } catch (e) { throw TesoError('Fila ' + (i + 1) + ' (' + (it.descripcion || '') + '): ' + e.message); }
        existentes[ref] = 1;
        nuevos.push(Object.assign(d, { id: uid(), ministerioId: m.id, mes: d.fecha.slice(0, 7), archivoId: '', origen: 'importado', refId: ref, creadoPor: user.id, creadoEn: now, actualizadoEn: now }));
      };
      var anio = Number(p.anio) || 0;
      var saldo = Math.round(Number(p.saldoInicial) || 0);
      if (saldo > 0 && anio) {
        var antes = propios.some(function (x) { return x.mes < anio + '-01'; });
        if (!antes) agregar({ refId: 'saldo:' + m.id + ':' + anio, fecha: (anio - 1) + '-12-31', tipo: 'ingreso', categoria: 'Saldo inicial', descripcion: 'Saldo al 1 de enero de ' + anio, monto: saldo }, -1);
      }
      items.forEach(agregar);
      if (nuevos.length) insertMany('MovimientosMinisterios', nuevos);
      // ítems como transferidos
      var transf = all('Transferencias').filter(function (t) { return t.ministerioId === m.id; });
      var conItem = {};
      transf.forEach(function (t) { conItem[t.mes] = 1; });
      var nuevasT = [];
      nuevos.forEach(function (x) {
        if (x.categoria === RESERVADAS.ministerio && !conItem[x.mes]) {
          conItem[x.mes] = 1;
          nuevasT.push({ id: uid(), ministerioId: m.id, mes: x.mes, monto: x.monto, fecha: x.fecha, movGeneralId: '', movMinisterioId: x.id, creadoPor: user.id, creadoEn: now });
        }
      });
      if (nuevasT.length) insertMany('Transferencias', nuevasT);
      // rendiciones de meses pasados: aprobadas como historial
      var mesActual = env.today().slice(0, 7);
      var rend = {};
      all('Rendiciones').forEach(function (r) { if (r.ministerioId === m.id) rend[r.mes] = 1; });
      var meses = {};
      nuevos.forEach(function (x) { if (x.mes < mesActual && x.categoria !== 'Saldo inicial') meses[x.mes] = 1; });
      var nuevasR = Object.keys(meses).filter(function (mm) { return !rend[mm]; }).map(function (mm) {
        return { id: uid(), ministerioId: m.id, mes: mm, estado: 'aprobada', comentarioLider: '', fechaEnvio: now, comentarioTesorero: 'Historial importado desde planilla', fechaRevision: now, revisadoPor: user.id };
      });
      if (nuevasR.length) insertMany('Rendiciones', nuevasR);
      if (p.itemMensual !== undefined || p.presupuestoMensual !== undefined) {
        var patch = {};
        if (Number(p.itemMensual) > 0) patch.itemMensual = Math.round(Number(p.itemMensual));
        if (Number(p.presupuestoMensual) > 0) patch.presupuestoMensual = Math.round(Number(p.presupuestoMensual));
        if (Object.keys(patch).length) update('Ministerios', m.id, patch);
      }
      return { importados: nuevos.length, omitidos: omitidos, transferencias: nuevasT.length, rendiciones: nuevasR.length };
    }

    // ---------------- Archivos (boletas) ----------------
    function getArchivo(user, p) {
      var id = String(p.id || '');
      if (!id) throw TesoError('Archivo inválido');
      if (user.rol !== 'tesorero') {
        var ok = all('MovimientosMinisterios').some(function (m) { return m.archivoId === id && m.ministerioId === user.ministerioId; });
        if (!ok) throw TesoError('No tienes permiso para ver este archivo', 'FORBIDDEN');
      }
      return files.get(id);
    }

    // ---------------- Administración ----------------
    function saveMinisterio(user, p) {
      var nombre = String(p.nombre || '').trim();
      if (!nombre) throw TesoError('El ministerio necesita un nombre');
      var actual = p.id ? find('Ministerios', p.id) : null;
      var monto = function (v, previo) {
        if (v === undefined || v === null || v === '') return previo || 0;
        return Math.min(MAX_MONTO, Math.max(0, Math.round(Number(v) || 0)));
      };
      var d = {
        nombre: nombre,
        color: /^#[0-9a-fA-F]{6}$/.test(p.color) ? p.color : (actual ? actual.color : '#3a6ea5'),
        icono: String(p.icono || (actual ? actual.icono : '⛪')).slice(0, 4),
        itemMensual: monto(p.itemMensual, actual && actual.itemMensual),
        presupuestoMensual: monto(p.presupuestoMensual, actual && actual.presupuestoMensual),
        activo: p.activo === undefined ? (actual ? actual.activo : true) : toBool(p.activo)
      };
      if (p.id) return update('Ministerios', p.id, d);
      return insert('Ministerios', Object.assign(d, { id: uid(), creadoEn: env.now() }));
    }
    function saveUsuario(user, p) {
      var usuario = String(p.usuario || '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) throw TesoError('El usuario debe tener 3-30 caracteres (letras, números, punto o guion)');
      var nombre = String(p.nombre || '').trim();
      if (!nombre) throw TesoError('Ingresa el nombre');
      var rol = p.rol === 'tesorero' ? 'tesorero' : 'lider';
      var ministerioId = rol === 'lider' ? String(p.ministerioId || '') : '';
      if (rol === 'lider' && !ministerioId) throw TesoError('Asigna un ministerio al líder');
      var dup = all('Usuarios').some(function (u) { return u.usuario === usuario && u.id !== p.id; });
      if (dup) throw TesoError('Ese nombre de usuario ya existe');
      var d = { nombre: nombre, usuario: usuario, rol: rol, ministerioId: ministerioId, email: String(p.email || '').trim(), activo: p.activo === undefined ? true : toBool(p.activo) };
      if (p.id === user.id && (!d.activo || d.rol !== 'tesorero')) throw TesoError('No puedes quitarte a ti mismo el rol de tesorero ni desactivarte');
      var pass = String(p.password || '');
      if (pass) {
        if (pass.length < 6) throw TesoError('La contraseña debe tener al menos 6 caracteres');
        d.salt = uid();
        d.hash = hashPassword(pass, d.salt, env.crypto.sha256Hex);
        d.debeCambiarPass = true;
      }
      var r;
      if (p.id) r = update('Usuarios', p.id, d);
      else {
        if (!pass) throw TesoError('Define una contraseña inicial');
        r = insert('Usuarios', Object.assign(d, { id: uid(), creadoEn: env.now() }));
      }
      return publicUser(r);
    }
    function saveConfig(user, p) {
      var guardar = function (k, v) {
        if (find('Config', k)) update('Config', k, { valor: v });
        else insert('Config', { id: k, valor: v });
      };
      ['nombreIglesia', 'saldoInicial', 'fechaSaldoInicial'].forEach(function (k) {
        if (p[k] === undefined) return;
        guardar(k, k === 'saldoInicial' ? String(Math.round(Number(p[k]) || 0)) : String(p[k]));
      });
      if (p.presupuestoGeneral !== undefined) {
        var v = Math.round(Number(p.presupuestoGeneral) || 0);
        if (v < 0 || v > MAX_MONTO) throw TesoError('Presupuesto general inválido');
        guardar('presupuestoGeneral', String(v));
      }
      return config();
    }

    // ---------------- Router ----------------
    var T = 'tesorero';
    var ACTIONS = {
      login: { fn: login, pub: true },
      me: { fn: me, pending: true },
      cambiarPassword: { fn: cambiarPassword, pending: true },
      getData: { fn: getData },
      addMovMinisterio: { fn: addMovMinisterio, write: true },
      updateMovMinisterio: { fn: updateMovMinisterio, write: true },
      deleteMovMinisterio: { fn: deleteMovMinisterio, write: true },
      enviarRendicion: { fn: enviarRendicion, write: true },
      retirarRendicion: { fn: retirarRendicion, write: true },
      getArchivo: { fn: getArchivo },
      revisarRendicion: { fn: revisarRendicion, role: T, write: true },
      transferirItem: { fn: transferirItem, role: T, write: true },
      anularTransferencia: { fn: anularTransferencia, role: T, write: true },
      addMovGeneral: { fn: addMovGeneral, role: T, write: true },
      addMovGeneralLote: { fn: addMovGeneralLote, role: T, write: true },
      updateMovGeneral: { fn: updateMovGeneral, role: T, write: true },
      deleteMovGeneral: { fn: deleteMovGeneral, role: T, write: true },
      importarMovimientos: { fn: importarMovimientos, role: T, write: true },
      importarMovimientosMinisterio: { fn: importarMovimientosMinisterio, role: T, write: true },
      saveMinisterio: { fn: saveMinisterio, role: T, write: true },
      saveUsuario: { fn: saveUsuario, role: T, write: true },
      saveConfig: { fn: saveConfig, role: T, write: true }
    };

    function handle(action, payload, token) {
      try {
        var a = ACTIONS[action];
        if (!a) throw TesoError('Acción desconocida: ' + action);
        var user = a.pub ? null : verifyToken(token);
        if (user && user.debeCambiarPass && !a.pending) throw TesoError('Debes cambiar tu contraseña antes de continuar', 'CHANGE_PASS');
        if (a.role && user.rol !== a.role) throw TesoError('No tienes permiso para esta acción', 'FORBIDDEN');
        return { ok: true, data: a.fn(user, payload || {}) };
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e), code: (e && e.code) || 'ERR' };
      }
    }

    return {
      handle: handle,
      isWrite: function (a) { return !!(ACTIONS[a] && ACTIONS[a].write); },
      // Uso interno del servidor (no accesible desde la página)
      interno: {
        resumen: function () {
          var porMes = {};
          all('MovimientosGenerales').forEach(function (m) { var k = m.mes + ' ' + m.origen; porMes[k] = (porMes[k] || 0) + 1; });
          var c = config();
          return { porMes: porMes, saldoInicial: c.saldoInicial, fechaSaldoInicial: c.fechaSaldoInicial, tesoreros: all('Usuarios').filter(function (u) { return u.rol === 'tesorero'; }).length };
        },
        importarComoTesorero: function (p) {
          var u = all('Usuarios').filter(function (x) { return x.rol === 'tesorero' && x.activo; })[0];
          if (!u) throw TesoError('No hay tesorero activo');
          return importarMovimientos(u, p);
        }
      }
    };
  }

  return {
    TABLES: TABLES,
    NUMERIC: NUMERIC,
    CATEGORIAS: CATEGORIAS,
    GRUPOS: GRUPOS,
    SIN_GRUPO: SIN_GRUPO,
    grupoDe: grupoDe,
    RESERVADAS: RESERVADAS,
    MEDIOS: MEDIOS,
    hashPassword: hashPassword,
    prevMonth: prevMonth,
    nextMonth: nextMonth,
    labelMes: labelMes,
    pesos: pesos,
    create: create
  };
})();
