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
    Ministerios: ['id', 'nombre', 'color', 'icono', 'itemMensual', 'activo', 'creadoEn', 'presupuestoMensual', 'actividades'],
    MovimientosGenerales: ['id', 'fecha', 'mes', 'tipo', 'categoria', 'descripcion', 'monto', 'medio', 'archivoId', 'ministerioId', 'origen', 'refId', 'creadoPor', 'creadoEn', 'actualizadoEn', 'grupo'],
    MovimientosMinisterios: ['id', 'ministerioId', 'fecha', 'mes', 'tipo', 'categoria', 'descripcion', 'monto', 'archivoId', 'origen', 'refId', 'creadoPor', 'creadoEn', 'actualizadoEn', 'actividadId'],
    Rendiciones: ['id', 'ministerioId', 'mes', 'estado', 'comentarioLider', 'fechaEnvio', 'comentarioTesorero', 'fechaRevision', 'revisadoPor'],
    Transferencias: ['id', 'ministerioId', 'mes', 'monto', 'fecha', 'movGeneralId', 'movMinisterioId', 'creadoPor', 'creadoEn'],
    Config: ['id', 'valor'],
    Miembros: ['id', 'nombre', 'estado', 'fechaNacimiento', 'celular', 'email', 'domicilio', 'notas', 'creadoEn', 'actualizadoEn', 'conyugeId', 'fechaBaja', 'habilitadoDiezmo', 'fechaIngreso'],
    Diezmos: ['id', 'miembroId', 'fecha', 'mes', 'monto', 'medio', 'notas', 'creadoPor', 'creadoEn', 'actualizadoEn', 'movGeneralId', 'conyugeId', 'refId', 'archivoId'],
    // Listado propio de un ministerio (p. ej. jóvenes): pueden o no ser miembros de la iglesia
    Integrantes: ['id', 'ministerioId', 'nombre', 'celular', 'email', 'fechaNacimiento', 'miembroId', 'notas', 'activo', 'creadoEn', 'actualizadoEn'],
    // Actividades con cuota de un ministerio y sus inscritos (confirmados y pagos)
    Actividades: ['id', 'ministerioId', 'nombre', 'fecha', 'cuota', 'descripcion', 'estado', 'creadoPor', 'creadoEn', 'actualizadoEn'],
    Inscripciones: ['id', 'actividadId', 'integranteId', 'pagoMonto', 'fechaPago', 'movId', 'creadoEn', 'actualizadoEn'],
    // Asistencia: una fila por reunión (culto, escuela dominical u otra actividad) con los presentes
    // en una sola celda: "m:<miembro>,i:<integrante>,v:<visita>"
    Asistencias: ['id', 'fecha', 'actividad', 'notas', 'presentes', 'creadoPor', 'creadoEn', 'actualizadoEn'],
    // Asistencia de las reuniones de un ministerio (p. ej. Jóvenes) con los integrantes de su listado
    AsistenciasMinisterios: ['id', 'ministerioId', 'fecha', 'actividad', 'notas', 'presentes', 'creadoPor', 'creadoEn', 'actualizadoEn'],
    Visitas: ['id', 'nombre', 'celular', 'notas', 'activo', 'creadoEn', 'actualizadoEn']
  };
  var NUMERIC = { monto: 1, itemMensual: 1, presupuestoMensual: 1, cuota: 1, pagoMonto: 1 };
  var BOOL = { activo: 1, debeCambiarPass: 1 };

  // Tipos de gasto/ingreso de la tesorería general: cada grupo reúne varias categorías
  var GRUPOS = {
    gasto: [
      ['Personal y remuneraciones', ['Sueldo pastoral', 'Imposiciones y previsión', 'Asignación familiar', 'Fondo de indemnización', 'Guardatemplo', 'Aguinaldos y bonos']],
      ['Servicios básicos', ['Luz', 'Agua', 'Gas', 'Internet y teléfono']],
      ['Templo y mantención', ['Arriendo', 'Aseo y limpieza', 'Mantención templo', 'Equipamiento y mobiliario', 'Contribuciones']],
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
  var SALDO_INICIAL = 'Saldo inicial';
  // Las cuotas de actividades se registran solo desde la actividad
  var CUOTA = 'Cuota de actividad';
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
  // Formato AAAA-MM-DD y además una fecha que exista (rechaza 2026-02-30, 2026-11-00, etc.)
  function isDate(s) {
    var t = String(s);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
    var y = +t.slice(0, 4), m = +t.slice(5, 7), d = +t.slice(8, 10);
    var dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
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
  // Roles: administrador, tesorero y pastor = acceso completo; secretaria = solo miembros; lider = su ministerio
  var ROLES = ['admin', 'tesorero', 'pastor', 'secretaria', 'lider'];
  var ADMIN = ['admin', 'tesorero', 'pastor'];
  // Presupuesto general de un mes: el último cambio con "desde" <= mes. Sin historial, el monto único antiguo.
  function presupuestoVigente(hist, legado, mes) {
    var lista = hist && hist.length ? hist : (Number(legado) > 0 ? [{ desde: '2000-01', monto: Number(legado) }] : []);
    var v = 0;
    lista.forEach(function (h) { if (h.desde <= mes) v = Number(h.monto) || 0; });
    return v;
  }
  var MIEMBROS = ['admin', 'tesorero', 'pastor', 'secretaria'];
  var CON_MINISTERIO = ['admin', 'tesorero', 'pastor', 'lider'];
  function esAdmin(u) { return !!u && ADMIN.indexOf(u.rol) >= 0; }
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
      var c = { nombreIglesia: 'Iglesia Bautista El Redentor', saldoInicial: 0, fechaSaldoInicial: '', presupuestoGeneral: 0, presupuestosGenerales: [] };
      all('Config').forEach(function (r) {
        if (r.id === 'saldoInicial' || r.id === 'presupuestoGeneral') c[r.id] = Number(r.valor) || 0;
        else if (r.id === 'presupuestosGenerales') {
          try { c.presupuestosGenerales = JSON.parse(r.valor || '[]') || []; } catch (e) { c.presupuestosGenerales = []; }
        } else if (r.id !== 'presupuesto') c[r.id] = r.valor;
      });
      c.presupuestosGenerales = c.presupuestosGenerales
        .filter(function (h) { return h && /^\d{4}-\d{2}$/.test(h.desde); })
        .map(function (h) { return { desde: h.desde, monto: Math.round(Number(h.monto) || 0) }; })
        .sort(function (a, b) { return a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0; });
      // historial = el monto único antiguo, vigente desde siempre
      if (!c.presupuestosGenerales.length && c.presupuestoGeneral > 0) c.presupuestosGenerales = [{ desde: '2000-01', monto: c.presupuestoGeneral }];
      c.presupuestoGeneral = presupuestoVigente(c.presupuestosGenerales, 0, env.today().slice(0, 7)); // el de este mes
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
      if (user.rol === 'secretaria') {
        base.ministerios = []; base.usuarios = [publicUser(user)];
        base.movMinisterios = []; base.movGenerales = []; base.rendiciones = []; base.transferencias = [];
        base.miembros = all('Miembros');
        base.diezmos = [];
        base.integrantes = []; base.actividades = []; base.inscripciones = []; base.miembrosEnlace = [];
        base.asistencias = all('Asistencias'); base.personasAsistencia = personasAsistencia();
        base.asistenciasMin = [];
        base.extra = {};
        base.config = { nombreIglesia: base.config.nombreIglesia };
        return base;
      }
      if (esAdmin(user)) {
        base.ministerios = all('Ministerios');
        base.usuarios = all('Usuarios').map(publicUser);
        base.movMinisterios = all('MovimientosMinisterios');
        base.movGenerales = all('MovimientosGenerales');
        base.rendiciones = all('Rendiciones');
        base.transferencias = all('Transferencias');
        base.miembros = all('Miembros');
        base.diezmos = all('Diezmos');
        base.integrantes = vistaIntegrantes(all('Integrantes'));
        base.actividades = all('Actividades');
        base.inscripciones = all('Inscripciones');
        base.miembrosEnlace = miembrosEnlace();
        base.asistencias = all('Asistencias');
        base.personasAsistencia = personasAsistencia();
        base.asistenciasMin = all('AsistenciasMinisterios');
      } else {
        var mid = user.ministerioId;
        var own = function (r) { return r.ministerioId === mid; };
        base.ministerios = all('Ministerios').filter(function (m) { return m.id === mid; });
        base.usuarios = [publicUser(user)];
        base.movMinisterios = all('MovimientosMinisterios').filter(own);
        base.movGenerales = [];
        base.rendiciones = all('Rendiciones').filter(own);
        base.transferencias = all('Transferencias').filter(own);
        base.miembros = [];
        base.diezmos = [];
        // Listado propio y actividades: solo si el ministerio lo tiene habilitado
        var conAct = base.ministerios.some(function (m) { return m.actividades === 'si'; });
        // El líder no recibe datos de las fichas de Miembros: solo el nombre del enlazado
        base.integrantes = conAct ? vistaIntegrantes(all('Integrantes').filter(own)) : [];
        base.actividades = conAct ? all('Actividades').filter(own) : [];
        var actIds = {};
        base.actividades.forEach(function (a) { actIds[a.id] = 1; });
        base.inscripciones = conAct ? all('Inscripciones').filter(function (x) { return actIds[x.actividadId]; }) : [];
        // El enlace con la ficha de Miembros lo hace tesorería: el líder no recibe el registro de miembros
        base.miembrosEnlace = [];
        base.asistencias = []; base.personasAsistencia = [];
        base.asistenciasMin = conAct ? all('AsistenciasMinisterios').filter(own) : [];
        base.extra = {};
        // El líder no recibe saldo de caja ni presupuesto de la tesorería general
        base.config = { nombreIglesia: base.config.nombreIglesia };
      }
      return base;
    }

    // ---------------- Asistencia ----------------
    // Personas que se pueden marcar: miembros (todos, con su estado), integrantes de ministerios que no son
    // miembros (sin repetir el mismo nombre en dos ministerios) y visitas
    function personasAsistencia() {
      var mins = {};
      all('Ministerios').forEach(function (m) { mins[m.id] = m.nombre; });
      var miembros = {};
      var integ = all('Integrantes');
      // un integrante enlazado a su ficha es la misma persona: sus asistencias como "i:" cuentan para el miembro
      var alias = {};
      var existe = {};
      all('Miembros').forEach(function (m) { existe[m.id] = true; });
      integ.forEach(function (i) { if (i.miembroId && existe[i.miembroId]) (alias[i.miembroId] = alias[i.miembroId] || []).push('i:' + i.id); });
      var out = all('Miembros').map(function (m) {
        miembros[m.id] = true;
        // sin "Miembro desde", cuenta desde que se registró (si vino antes, la página cuenta desde su primera asistencia)
        return { id: 'm:' + m.id, tipo: 'miembro', nombre: m.nombre, activo: m.estado === 'activo', desde: m.fechaIngreso || String(m.creadoEn || '').slice(0, 10), celular: m.celular || '', ministerios: [], alias: alias[m.id] || [] };
      });
      var porNombre = {};
      integ.forEach(function (i) {
        if (i.miembroId && miembros[i.miembroId]) return; // ya está como miembro
        var k = normalNombre(i.nombre);
        var ya = porNombre[k];
        if (ya) {
          if (mins[i.ministerioId] && ya.ministerios.indexOf(mins[i.ministerioId]) < 0) ya.ministerios.push(mins[i.ministerioId]);
          if (toBool(i.activo)) ya.activo = true;
          return;
        }
        var r = { id: 'i:' + i.id, tipo: 'integrante', nombre: i.nombre, activo: toBool(i.activo), desde: String(i.creadoEn || '').slice(0, 10), celular: i.celular || '', ministerios: mins[i.ministerioId] ? [mins[i.ministerioId]] : [] };
        porNombre[k] = r; out.push(r);
      });
      all('Visitas').forEach(function (v) {
        out.push({ id: 'v:' + v.id, tipo: 'visita', nombre: v.nombre, activo: toBool(v.activo), desde: String(v.creadoEn || '').slice(0, 10), celular: v.celular || '', ministerios: [], notas: v.notas || '' });
      });
      return out;
    }
    function saveAsistencia(user, p) {
      var fecha = String(p.fecha || '').trim();
      if (!isDate(fecha) || fecha > env.today() || fecha < '2000-01-01') throw TesoError('Elige una fecha válida (no futura ni anterior a 2000)');
      var actividad = String(p.actividad || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!actividad) throw TesoError('Elige la actividad (culto, escuela dominical u otra)');
      var actual = p.id ? find('Asistencias', p.id) : null;
      if (p.id && !actual) throw TesoError('Esa asistencia ya no existe');
      var clave = normalNombre(actividad);
      var otra = all('Asistencias').filter(function (a) { return a.fecha === fecha && normalNombre(a.actividad) === clave && a.id !== (actual && actual.id); })[0];
      if (otra) throw TesoError('Ya hay una asistencia de ' + actividad + ' el ' + fecha.split('-').reverse().join('-') + ': ábrela en la lista para editarla');
      // id válido → id de la persona (el de un integrante enlazado se guarda como el del miembro)
      var canon = {};
      personasAsistencia().forEach(function (x) { canon[x.id] = x.id; (x.alias || []).forEach(function (a) { canon[a] = x.id; }); });
      var vistos = {};
      var presentes = [];
      (p.presentes || []).map(String).forEach(function (id) {
        var c = canon[id];
        if (!c || vistos[c]) return;
        vistos[c] = true; presentes.push(c);
      });
      // al corregir una reunión, se conservan los presentes que ya no están en la lista (personas eliminadas)
      if (actual) String(actual.presentes || '').split(',').forEach(function (id) {
        if (id && !canon[id] && !vistos[id]) { vistos[id] = true; presentes.push(id); }
      });
      var now = env.now();
      var d = { fecha: fecha, actividad: actividad, notas: String(p.notas || '').trim().slice(0, 300), presentes: presentes.join(','), actualizadoEn: now };
      return actual ? update('Asistencias', actual.id, d) : insert('Asistencias', Object.assign(d, { id: uid(), creadoPor: user.id, creadoEn: now }));
    }
    function deleteAsistencia(user, p) {
      if (!find('Asistencias', p.id)) throw TesoError('Esa asistencia ya no existe');
      remove('Asistencias', p.id);
      return { id: p.id };
    }
    function saveVisita(user, p) {
      var nombre = String(p.nombre || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!nombre) throw TesoError('Escribe el nombre de la visita');
      var actual = p.id ? find('Visitas', p.id) : null;
      if (p.id && !actual) throw TesoError('Esa visita ya no existe');
      var now = env.now();
      var d = { nombre: nombre, celular: String(p.celular || '').trim().slice(0, 30), notas: String(p.notas || '').trim().slice(0, 300), activo: p.activo === undefined ? true : !!p.activo, actualizadoEn: now };
      var creado = p.fecha && isDate(p.fecha) && p.fecha >= '2000-01-01' && p.fecha <= env.today() ? p.fecha : now;
      return actual ? update('Visitas', actual.id, d) : insert('Visitas', Object.assign(d, { id: uid(), creadoEn: creado }));
    }
    // Solo se elimina una visita que nunca vino (si vino, se marca inactiva y se conserva su historial)
    function deleteVisita(user, p) {
      var v = find('Visitas', p.id);
      if (!v) throw TesoError('Esa visita ya no existe');
      var id = 'v:' + v.id;
      var vino = all('Asistencias').some(function (a) { return String(a.presentes || '').split(',').indexOf(id) >= 0; });
      if (vino) throw TesoError(v.nombre + ' tiene asistencias registradas: márcala como inactiva en vez de eliminarla');
      remove('Visitas', v.id);
      return { id: v.id };
    }

    // Asistencia de un ministerio: la toma su líder (o tesorería) con los integrantes de su listado
    function saveAsistenciaMinisterio(user, p) {
      var actual = p.id ? find('AsistenciasMinisterios', p.id) : null;
      if (p.id && !actual) throw TesoError('Esa asistencia ya no existe');
      var m = ministerioConActividades(user, actual ? actual.ministerioId : p.ministerioId);
      if (actual && actual.ministerioId !== m.id) throw TesoError('No tienes permiso', 'FORBIDDEN');
      var fecha = String(p.fecha || '').trim();
      if (!isDate(fecha) || fecha > env.today() || fecha < '2000-01-01') throw TesoError('Elige una fecha válida (no futura ni anterior a 2000)');
      var actividad = String(p.actividad || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!actividad) throw TesoError('Elige la reunión o actividad');
      var clave = normalNombre(actividad);
      var otra = all('AsistenciasMinisterios').some(function (a) { return a.ministerioId === m.id && a.fecha === fecha && normalNombre(a.actividad) === clave && a.id !== (actual && actual.id); });
      if (otra) throw TesoError('Ya hay una asistencia de ' + actividad + ' el ' + fecha.split('-').reverse().join('-') + ': ábrela en la lista para editarla');
      var integ = {};
      all('Integrantes').forEach(function (i) { if (i.ministerioId === m.id) integ[i.id] = true; });
      var vistos = {};
      var presentes = [];
      (p.presentes || []).map(String).forEach(function (id) {
        if (!integ[id] || vistos[id]) return;
        vistos[id] = true; presentes.push(id);
      });
      // al corregir, se conservan los presentes que ya no están en el listado (integrantes eliminados)
      if (actual) String(actual.presentes || '').split(',').forEach(function (id) {
        if (id && !integ[id] && !vistos[id]) { vistos[id] = true; presentes.push(id); }
      });
      if (!presentes.length) throw TesoError('Marca al menos a una persona presente');
      var now = env.now();
      var d = { fecha: fecha, actividad: actividad, notas: String(p.notas || '').trim().slice(0, 300), presentes: presentes.join(','), actualizadoEn: now };
      return actual ? update('AsistenciasMinisterios', actual.id, d) : insert('AsistenciasMinisterios', Object.assign(d, { id: uid(), ministerioId: m.id, creadoPor: user.id, creadoEn: now }));
    }
    function deleteAsistenciaMinisterio(user, p) {
      var a = find('AsistenciasMinisterios', p.id);
      if (!a) throw TesoError('Esa asistencia ya no existe');
      ministerioConActividades(user, a.ministerioId, true);
      remove('AsistenciasMinisterios', a.id);
      return { id: a.id };
    }

    // ---------------- Helpers de dominio ----------------
    function getMinisterio(id) {
      var m = find('Ministerios', id);
      if (!m) throw TesoError('Ministerio no encontrado');
      return m;
    }
    function ministerioDe(user, p) {
      if (esAdmin(user)) return getMinisterio(p.ministerioId);
      if (!user.ministerioId) throw TesoError('Tu usuario no tiene un ministerio asignado. Habla con el tesorero.');
      return getMinisterio(user.ministerioId);
    }
    function rendicion(mid, mes) {
      return all('Rendiciones').filter(function (r) { return r.ministerioId === mid && r.mes === mes; })[0] || null;
    }
    function estadoRendicion(mid, mes) { var r = rendicion(mid, mes); return r ? r.estado : 'abierta'; }
    function puedeEditarMes(user, mid, mes) {
      if (esAdmin(user)) return true;
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
      if (ambito === 'ministerio' && cat === CUOTA && !permitirReservada) throw TesoError('Las cuotas se registran desde la actividad (Actividades → registrar pago).');
      if (ambito === 'ministerio' && cat === SALDO_INICIAL && !permitirReservada) throw TesoError('La categoría "' + SALDO_INICIAL + '" solo se crea al importar el historial del ministerio.');
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
          'Presupuesto: ' + pesos(b.limite) + ' · ' + (excluirId ? 'otros gastos del mes' : 'ya gastado') + ': ' + pesos(b.gastado) + ' · disponible: ' + pesos(Math.max(0, b.disponible)) +
          '. Si es necesario, el tesorero puede ajustar el presupuesto del ministerio.', 'PRESUPUESTO');
      }
    }
    // Tesorería general: un presupuesto fijo mensual para TODOS sus gastos
    // (incluye las transferencias de ítems a los ministerios). 0 = sin límite.
    function presupuestoGeneral(mes, excluirId) {
      var limite = presupuestoVigente(config().presupuestosGenerales, 0, mes);
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
          'Presupuesto: ' + pesos(b.limite) + ' · ' + (excluirId ? 'otros gastos del mes' : 'ya gastado') + ': ' + pesos(b.gastado) + ' · disponible: ' + pesos(Math.max(0, b.disponible)) +
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
      var actividadId = actividadValida(m.id, p.actividadId);
      var archivoId = guardarArchivo(p.archivo, ['Boletas ministerios', m.nombre, mes]);
      var now = env.now();
      return insert('MovimientosMinisterios', Object.assign(d, {
        id: uid(), ministerioId: m.id, mes: mes, archivoId: archivoId, origen: 'manual', creadoPor: user.id, creadoEn: now, actualizadoEn: now, actividadId: actividadId
      }));
    }
    function movMinisterioPropio(user, id, paraBorrar) {
      var mov = find('MovimientosMinisterios', id);
      if (!mov) throw TesoError('Movimiento no encontrado');
      if (!esAdmin(user) && mov.ministerioId !== user.ministerioId) throw TesoError('No tienes permiso', 'FORBIDDEN');
      // Si el ministerio ya no usa actividades, una cuota se puede quitar desde Finanzas (no editar)
      if (mov.origen === 'cuota' && paraBorrar && getMinisterio(mov.ministerioId).actividades !== 'si') return mov;
      if (mov.origen === 'cuota') throw TesoError('Esta cuota se administra desde su actividad: ahí puedes anular el pago.');
      if (mov.origen === 'transferencia') throw TesoError('El ítem mensual se registra al transferirlo; si hubo un error, anúlalo desde el panel de rendición del ministerio (botón Anular).');
      if (!esAdmin(user) && (mov.categoria === SALDO_INICIAL || transferenciaDeMov(mov.id))) {
        throw TesoError('El saldo inicial y los ítems recibidos solo los puede corregir el tesorero.', 'FORBIDDEN');
      }
      return mov;
    }
    // Transferencia registrada para un movimiento de ministerio (ítems importados como transferidos)
    function transferenciaDeMov(movId) {
      return all('Transferencias').filter(function (t) { return t.movMinisterioId === movId; })[0] || null;
    }
    // El tope de presupuesto se exige solo si la edición aumenta lo gastado del mes
    function aumentaGasto(mov, d, mes) {
      return d.tipo === 'gasto' && (mov.tipo !== 'gasto' || mes !== mov.mes || d.monto > mov.monto);
    }
    function updateMovMinisterio(user, p) {
      var mov = movMinisterioPropio(user, p.id);
      // El tesorero puede corregir el saldo inicial o un ítem importado sin cambiarles la categoría
      var reservadaPropia = esAdmin(user) && String(p.categoria || '').trim() === mov.categoria;
      var d = validarMov(p, 'ministerio', reservadaPropia);
      var mes = d.fecha.slice(0, 7);
      exigirEditable(user, mov.ministerioId, mov.mes);
      exigirEditable(user, mov.ministerioId, mes);
      var m = getMinisterio(mov.ministerioId);
      if (aumentaGasto(mov, d, mes)) exigirPresupuestoMinisterio(m, mes, d.monto, mov.id);
      var t = transferenciaDeMov(mov.id);
      if (t) {
        if (d.tipo !== 'ingreso' || d.categoria !== RESERVADAS.ministerio) throw TesoError('Este movimiento es un ítem recibido: solo se puede corregir su monto o su fecha dentro del mismo mes.');
        if (mes !== mov.mes) throw TesoError('El ítem recibido debe quedar en ' + labelMes(mov.mes) + '.');
        update('Transferencias', t.id, { monto: d.monto, fecha: d.fecha });
      }
      var archivoId = mov.archivoId;
      if (p.archivo && p.archivo.base64) {
        var nuevo = guardarArchivo(p.archivo, ['Boletas ministerios', m.nombre, mes]);
        borrarArchivo(archivoId);
        archivoId = nuevo;
      } else if (p.quitarArchivo) {
        borrarArchivo(archivoId);
        archivoId = '';
      }
      var actividadId = p.actividadId === undefined ? mov.actividadId : actividadValida(mov.ministerioId, p.actividadId);
      return update('MovimientosMinisterios', mov.id, Object.assign(d, { mes: mes, archivoId: archivoId, actualizadoEn: env.now(), actividadId: actividadId }));
    }
    function deleteMovMinisterio(user, p) {
      var mov = movMinisterioPropio(user, p.id, true);
      exigirEditable(user, mov.ministerioId, mov.mes);
      var t = transferenciaDeMov(mov.id);
      borrarArchivo(mov.archivoId);
      remove('MovimientosMinisterios', mov.id);
      // cuota borrada: la inscripción queda pendiente de pago
      if (mov.origen === 'cuota' && mov.refId && find('Inscripciones', mov.refId)) {
        update('Inscripciones', mov.refId, { pagoMonto: 0, fechaPago: '', movId: '', actualizadoEn: env.now() });
      }
      // Un ítem importado borrado deja de contar como transferido (se puede volver a transferir)
      if (t) remove('Transferencias', t.id);
      return { id: mov.id };
    }

    // ---------------- Integrantes y actividades de un ministerio ----------------
    function miembrosEnlace() {
      return all('Miembros').filter(function (m) { return m.estado === 'activo'; })
        .map(function (m) { return { id: m.id, nombre: m.nombre }; });
    }
    // Un integrante enlazado a un miembro toma sus datos de la ficha de Miembros (no se registra dos veces)
    // Integrante enlazado: nombre, contacto y fecha de nacimiento vienen de su ficha de Miembros (también para
    // el líder, solo de los integrantes de su propio listado). soloNombre: solo el nombre.
    function vistaIntegrantes(lista, soloNombre) {
      var mb = {};
      all('Miembros').forEach(function (m) { mb[m.id] = m; });
      return lista.map(function (i) {
        var m = i.miembroId && mb[i.miembroId];
        if (!m) return Object.assign({}, i, { esMiembro: false });
        if (soloNombre) return Object.assign({}, i, { nombre: m.nombre, esMiembro: true });
        return Object.assign({}, i, {
          nombre: m.nombre, celular: m.celular || i.celular, email: m.email || i.email,
          fechaNacimiento: m.fechaNacimiento || i.fechaNacimiento, esMiembro: true,
          // datos que faltan en su ficha de Miembros (el líder puede completarlos)
          faltan: ['celular', 'email', 'fechaNacimiento'].filter(function (k) { return !m[k]; })
        });
      });
    }
    function nombreIntegrante(it) { return vistaIntegrantes([it])[0].nombre; }
    // aunqueDesactivado: para deshacer pagos de un ministerio al que se le quitó el listado (no se crean cosas nuevas)
    function ministerioConActividades(user, mid, aunqueDesactivado) {
      if (!esAdmin(user)) {
        if (!user.ministerioId) throw TesoError('Tu usuario no tiene un ministerio asignado. Habla con el tesorero.');
        if (mid && mid !== user.ministerioId) throw TesoError('No tienes permiso', 'FORBIDDEN');
        mid = user.ministerioId;
      }
      var m = getMinisterio(mid);
      if (m.actividades !== 'si' && !aunqueDesactivado) throw TesoError('Este ministerio no tiene habilitado el listado de integrantes y actividades. Se activa en Configuración → Ministerios.');
      return m;
    }
    function actividadValida(mid, aid) {
      aid = String(aid || '');
      if (!aid) return '';
      var a = find('Actividades', aid);
      if (!a || a.ministerioId !== mid) throw TesoError('Actividad no encontrada');
      return aid;
    }
    function saveIntegrante(user, p) {
      var actual = p.id ? find('Integrantes', p.id) : null;
      if (p.id && !actual) throw TesoError('Integrante no encontrado');
      var m = ministerioConActividades(user, actual ? actual.ministerioId : p.ministerioId);
      // Solo quien ve el registro de Miembros (tesorería) puede enlazar a un integrante con su ficha;
      // el líder conserva el enlace que ya tenía
      var admin = esAdmin(user);
      var miembroId = admin ? String(p.miembroId || '') : (actual ? String(actual.miembroId || '') : '');
      var mb = null;
      if (miembroId) {
        mb = find('Miembros', miembroId);
        // ficha eliminada: el integrante queda sin enlace en vez de bloquearse
        if (!mb && actual && miembroId === actual.miembroId) miembroId = '';
        else if (!mb) throw TesoError('Ese miembro no está en el registro de la iglesia');
      }
      if (mb) {
        var dup = all('Integrantes').some(function (i) { return i.ministerioId === m.id && i.miembroId === miembroId && (!actual || i.id !== actual.id); });
        if (dup) throw TesoError(mb.nombre + ' ya está en el listado');
      }
      var nombre = String(p.nombre || '').replace(/\s+/g, ' ').trim();
      if (!nombre && mb) nombre = mb.nombre;
      if (!nombre && actual) nombre = actual.nombre;
      if (!nombre) throw TesoError('Escribe el nombre');
      if (nombre.length > 80) throw TesoError('El nombre es demasiado largo');
      var fn = String(p.fechaNacimiento || '').trim();
      if (fn && (!isDate(fn) || fn > env.today() || fn < '1900-01-01')) throw TesoError('Fecha de nacimiento inválida');
      var email = String(p.email || '').trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw TesoError('El correo no parece válido');
      var now = env.now();
      var celular = String(p.celular || '').trim().slice(0, 30);
      // enlazado a su ficha: los datos propios que no vengan se conservan como respaldo
      if (mb && actual) {
        if (!celular) celular = actual.celular || '';
        if (!email) email = actual.email || '';
        if (!fn) fn = actual.fechaNacimiento || '';
        if (!String(p.nombre || '').trim()) nombre = actual.nombre || nombre;
      }
      var d = {
        ministerioId: m.id, nombre: nombre, celular: celular, email: email.slice(0, 120),
        fechaNacimiento: fn, miembroId: miembroId, notas: String(p.notas || '').trim().slice(0, 300),
        activo: p.activo === undefined ? (actual ? actual.activo : true) : toBool(p.activo), actualizadoEn: now
      };
      if (mb && p.completar && typeof p.completar === 'object') {
        var cm = String(p.completar.email || '').trim(), cf = String(p.completar.fechaNacimiento || '').trim();
        if (cm && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cm)) throw TesoError('El correo no parece válido');
        if (cf && (!isDate(cf) || cf > env.today() || cf < '1900-01-01')) throw TesoError('Fecha de nacimiento inválida');
      }
      var r = actual ? update('Integrantes', actual.id, d) : insert('Integrantes', Object.assign(d, { id: uid(), creadoEn: now }));
      // Completar la ficha de Miembros: solo los datos que estén vacíos (los que ya tiene no se cambian)
      if (mb && p.completar && typeof p.completar === 'object') {
        var c = p.completar, patch = {};
        var cCel = String(c.celular || '').trim().slice(0, 30);
        var cMail = String(c.email || '').trim();
        var cFn = String(c.fechaNacimiento || '').trim();
        if (cCel && !mb.celular) patch.celular = cCel;
        if (cMail && !mb.email) patch.email = cMail.slice(0, 120);
        if (cFn && !mb.fechaNacimiento) patch.fechaNacimiento = cFn;
        if (Object.keys(patch).length) { patch.actualizadoEn = now; update('Miembros', mb.id, patch); }
      }
      return vistaIntegrantes([r])[0];
    }
    // Agrega de una vez al listado del ministerio a varios miembros de la iglesia (quedan enlazados a su ficha).
    // Si ya hay en el listado una persona sin enlazar con el mismo nombre (única), se enlaza en vez de duplicarla.
    function agregarMiembrosIntegrantes(user, p) {
      var m = ministerioConActividades(user, p.ministerioId);
      var ids = (p.miembroIds || []).map(String);
      if (!ids.length) throw TesoError('Elige al menos un miembro');
      if (ids.length > 300) throw TesoError('Demasiados a la vez');
      var lista = all('Integrantes').filter(function (i) { return i.ministerioId === m.id; });
      var enlazado = {};
      lista.forEach(function (i) { if (i.miembroId) enlazado[i.miembroId] = true; });
      var now = env.now(), agregados = 0, enlazados = 0, omitidos = 0, vistos = {};
      ids.forEach(function (mid) {
        if (vistos[mid]) return;
        vistos[mid] = true;
        var mb = find('Miembros', mid);
        if (!mb || enlazado[mid]) { omitidos++; return; }
        var clave = normalNombre(mb.nombre);
        var mismos = lista.filter(function (i) { return normalNombre(i.nombre) === clave && !(i.miembroId && find('Miembros', i.miembroId)); });
        if (mismos.length === 1) {
          var it = mismos[0];
          update('Integrantes', it.id, { miembroId: mid, activo: true, actualizadoEn: now });
          it.miembroId = mid;
          enlazados++;
        } else {
          var nuevo = insert('Integrantes', { id: uid(), ministerioId: m.id, nombre: mb.nombre, celular: '', email: '', fechaNacimiento: '', miembroId: mid, notas: '', activo: true, creadoEn: now, actualizadoEn: now });
          lista.push(nuevo);
          agregados++;
        }
        enlazado[mid] = true;
      });
      return { agregados: agregados, enlazados: enlazados, omitidos: omitidos };
    }
    function deleteIntegrante(user, p) {
      var it = find('Integrantes', p.id);
      if (!it) throw TesoError('Integrante no encontrado');
      ministerioConActividades(user, it.ministerioId);
      var ins = all('Inscripciones').filter(function (x) { return x.integranteId === it.id; });
      if (ins.some(function (x) { return x.movId; })) throw TesoError('Tiene cuotas pagadas en actividades: márcalo como inactivo en vez de eliminarlo.');
      var vino = all('AsistenciasMinisterios').some(function (a) { return a.ministerioId === it.ministerioId && String(a.presentes || '').split(',').indexOf(it.id) >= 0; });
      if (vino) throw TesoError('Tiene asistencias registradas: márcalo como inactivo en vez de eliminarlo.');
      ins.forEach(function (x) { remove('Inscripciones', x.id); });
      remove('Integrantes', it.id);
      return { id: it.id };
    }
    function actividadDe(user, id, aunqueDesactivado) {
      var a = find('Actividades', id);
      if (!a) throw TesoError('Actividad no encontrada');
      ministerioConActividades(user, a.ministerioId, aunqueDesactivado);
      return a;
    }
    function saveActividad(user, p) {
      var actual = p.id ? find('Actividades', p.id) : null;
      if (p.id && !actual) throw TesoError('Actividad no encontrada');
      var m = ministerioConActividades(user, actual ? actual.ministerioId : p.ministerioId);
      var nombre = String(p.nombre || '').replace(/\s+/g, ' ').trim();
      if (!nombre) throw TesoError('Escribe el nombre de la actividad');
      if (nombre.length > 80) throw TesoError('El nombre es demasiado largo');
      if (!isDate(p.fecha) || p.fecha < '2000-01-01') throw TesoError('Fecha de la actividad inválida');
      // hasta dos años hacia adelante (evita fechas como el año 9999)
      var tope = (Number(env.today().slice(0, 4)) + 2) + env.today().slice(4);
      if (p.fecha > tope) throw TesoError('La fecha de la actividad es demasiado lejana (máximo dos años hacia adelante)');
      var cuota = Math.round(Number(p.cuota) || 0);
      if (cuota < 0 || cuota > MAX_MONTO) throw TesoError('Cuota inválida');
      var now = env.now();
      var d = {
        ministerioId: m.id, nombre: nombre, fecha: p.fecha, cuota: cuota, descripcion: String(p.descripcion || '').trim().slice(0, 300),
        estado: p.estado === 'cerrada' ? 'cerrada' : 'abierta', actualizadoEn: now
      };
      if (actual) return update('Actividades', actual.id, d);
      return insert('Actividades', Object.assign(d, { id: uid(), creadoPor: user.id, creadoEn: now }));
    }
    function deleteActividad(user, p) {
      var a = actividadDe(user, p.id);
      var movs = all('MovimientosMinisterios').filter(function (x) { return x.actividadId === a.id; });
      if (movs.length) throw TesoError('La actividad tiene pagos o gastos registrados. Anula los pagos y elimina los gastos antes de borrarla.');
      all('Inscripciones').forEach(function (x) { if (x.actividadId === a.id) remove('Inscripciones', x.id); });
      remove('Actividades', a.id);
      return { id: a.id };
    }
    // Deja como confirmados exactamente a los integrantes indicados (no se puede quitar a quien ya pagó)
    function setConfirmados(user, p) {
      var a = actividadDe(user, p.actividadId);
      var ids = {};
      (p.integranteIds || []).forEach(function (id) { ids[String(id)] = 1; });
      var integ = {};
      all('Integrantes').forEach(function (i) { if (i.ministerioId === a.ministerioId) integ[i.id] = i; });
      Object.keys(ids).forEach(function (id) { if (!integ[id]) throw TesoError('Integrante no encontrado en el listado'); });
      var existentes = all('Inscripciones').filter(function (x) { return x.actividadId === a.id; });
      // Primero se valida todo: si alguien que ya pagó quedaría fuera, no se cambia nada
      var pagadoFuera = existentes.filter(function (x) { return !ids[x.integranteId] && x.movId; })[0];
      if (pagadoFuera) throw TesoError(nombreIntegrante(integ[pagadoFuera.integranteId] || { nombre: 'Un integrante' }) + ' ya pagó su cuota: anula el pago antes de quitarlo de la actividad.');
      var ya = {};
      existentes.forEach(function (x) {
        ya[x.integranteId] = 1;
        if (!ids[x.integranteId]) remove('Inscripciones', x.id);
      });
      var now = env.now();
      var nuevos = Object.keys(ids).filter(function (id) { return !ya[id]; }).map(function (id) {
        return { id: uid(), actividadId: a.id, integranteId: id, pagoMonto: 0, fechaPago: '', movId: '', creadoEn: now, actualizadoEn: now };
      });
      if (nuevos.length) insertMany('Inscripciones', nuevos);
      return { confirmados: Object.keys(ids).length };
    }
    // El pago de la cuota entra como ingreso del ministerio en la fecha en que se recibió
    function registrarPagoCuota(user, p) {
      var ins = find('Inscripciones', p.inscripcionId);
      if (!ins) throw TesoError('Inscripción no encontrada');
      var a = actividadDe(user, ins.actividadId);
      if (ins.movId) throw TesoError('Ya tiene su cuota pagada. Si hubo un error, anula el pago y regístralo de nuevo.');
      var it = find('Integrantes', ins.integranteId);
      var nombre = it ? nombreIntegrante(it) : '';
      var monto = p.monto === undefined || p.monto === '' ? a.cuota : p.monto;
      var d = validarMov({ tipo: 'ingreso', fecha: p.fecha, monto: monto, categoria: CUOTA, descripcion: 'Cuota ' + a.nombre + (nombre ? ' · ' + nombre : '') }, 'ministerio', true);
      var mes = d.fecha.slice(0, 7);
      exigirEditable(user, a.ministerioId, mes);
      var now = env.now();
      var mov = insert('MovimientosMinisterios', Object.assign(d, {
        id: uid(), ministerioId: a.ministerioId, mes: mes, archivoId: '', origen: 'cuota', refId: ins.id, creadoPor: user.id, creadoEn: now, actualizadoEn: now, actividadId: a.id
      }));
      return update('Inscripciones', ins.id, { pagoMonto: d.monto, fechaPago: d.fecha, movId: mov.id, actualizadoEn: now });
    }
    function anularPagoCuota(user, p) {
      var ins = find('Inscripciones', p.inscripcionId);
      if (!ins) throw TesoError('Inscripción no encontrada');
      var a = actividadDe(user, ins.actividadId, true);
      if (!ins.movId) throw TesoError('Esta inscripción no tiene un pago registrado');
      var mov = find('MovimientosMinisterios', ins.movId);
      if (mov) {
        exigirEditable(user, a.ministerioId, mov.mes);
        remove('MovimientosMinisterios', mov.id);
      }
      return update('Inscripciones', ins.id, { pagoMonto: 0, fechaPago: '', movId: '', actualizadoEn: env.now() });
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
      // Validar el detalle por hermano antes de guardar nada
      items.forEach(function (it) {
        if (!it.detalle || !it.detalle.length) return;
        var suma = 0;
        it.detalle.forEach(function (x) {
          if (!find('Miembros', x.miembroId)) throw TesoError('Hay un hermano que ya no está en el registro de miembros');
          suma += Math.round(Number(x.monto) || 0);
        });
        if (suma > Math.round(Number(it.monto))) throw TesoError('El detalle por hermano suma más que el total de ' + it.categoria);
      });
      var now = env.now(), identificados = 0;
      // Todo se valida antes de guardar: si algo falla, no queda un culto a medias
      var preparados = items.map(function (it) {
        var mp = { fecha: p.fecha, tipo: 'ingreso', categoria: it.categoria, monto: it.monto, medio: it.medio || p.medio, descripcion: it.descripcion || p.descripcion };
        datosGeneral(mp);
        var det = (it.detalle || []).filter(function (x) { return Number(x.monto) > 0; }).map(function (x) {
          return datosDiezmo({ miembroId: x.miembroId, conyugeId: x.conyugeId, fecha: p.fecha, monto: x.monto, medio: it.medio || p.medio, notas: 'Culto · ' + (p.descripcion || '') });
        });
        return { mp: mp, det: det };
      });
      var creados = preparados.map(function (x) {
        var mov = addMovGeneral(user, x.mp);
        if (x.det.length) {
          insertMany('Diezmos', x.det.map(function (d) {
            return Object.assign(d, { id: uid(), creadoPor: user.id, creadoEn: now, actualizadoEn: now, movGeneralId: mov.id });
          }));
          identificados += x.det.length;
        }
        return mov;
      });
      return { creados: creados.length, diezmosIdentificados: identificados };
    }
    function movGeneralManual(id) {
      var mov = find('MovimientosGenerales', id);
      if (!mov) throw TesoError('Movimiento no encontrado');
      if (mov.origen === 'transferencia') throw TesoError('Este movimiento es la transferencia de un ítem; anúlalo desde el detalle del ministerio (botón Anular en el panel de rendición).');
      if (mov.origen === 'diezmo') throw TesoError('Este ingreso corresponde a un diezmo registrado por hermano; corrígelo o elimínalo en el apartado Diezmos.');
      return mov;
    }
    function diezmosDeMov(movId) {
      return all('Diezmos').filter(function (x) { return x.movGeneralId === movId; });
    }
    function updateMovGeneral(user, p) {
      var mov = movGeneralManual(p.id);
      var d = datosGeneral(p, mov.origen === 'importado');
      // Un culto con diezmos por hermano: sigue siendo un ingreso de la misma categoría
      // y no puede quedar por debajo de lo identificado; si cambia la fecha, los diezmos la siguen
      var vinculados = diezmosDeMov(mov.id);
      if (vinculados.length) {
        var identificado = vinculados.reduce(function (a, x) { return a + (Number(x.monto) || 0); }, 0);
        if (d.tipo !== 'ingreso' || d.categoria !== mov.categoria) {
          throw TesoError('Este ingreso tiene diezmos registrados por hermano: debe seguir siendo un ingreso de "' + mov.categoria + '". Para cambiarlo, primero elimina esos diezmos en el apartado Diezmos.');
        }
        if (d.monto < identificado) {
          throw TesoError('El monto no puede ser menor que lo identificado por hermano (' + pesos(identificado) + '). Corrige primero los diezmos en el apartado Diezmos.');
        }
        if (d.fecha !== mov.fecha) {
          vinculados.forEach(function (x) { update('Diezmos', x.id, { fecha: d.fecha, mes: d.mes, actualizadoEn: env.now() }); });
        }
      }
      if (mov.origen !== 'importado' && aumentaGasto(mov, d, d.mes)) exigirPresupuestoGeneral(d.mes, d.monto, mov.id);
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
      // los diezmos por hermano de ese culto se conservan, sin vínculo
      all('Diezmos').forEach(function (x) { if (x.movGeneralId === mov.id) update('Diezmos', x.id, { movGeneralId: '' }); });
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
        if (!antes) agregar({ refId: 'saldo:' + m.id + ':' + anio, fecha: (anio - 1) + '-12-31', tipo: 'ingreso', categoria: SALDO_INICIAL, descripcion: 'Saldo al 1 de enero de ' + anio, monto: saldo }, -1);
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
      nuevos.forEach(function (x) { if (x.mes < mesActual) meses[x.mes] = 1; });
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

    // ---------------- Miembros (solo tesorero) ----------------
    function normalNombre(t) {
      return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    }
    function datosMiembro(p) {
      var nombre = String(p.nombre || '').replace(/\s+/g, ' ').trim();
      if (!nombre) throw TesoError('Escribe el nombre del miembro');
      if (nombre.length > 80) throw TesoError('El nombre es demasiado largo');
      var estado = p.estado === 'inactivo' ? 'inactivo' : 'activo';
      var fn = String(p.fechaNacimiento || '').trim();
      if (fn && (!isDate(fn) || fn > env.today() || fn < '1900-01-01')) throw TesoError('Fecha de nacimiento inválida');
      var email = String(p.email || '').trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw TesoError('El correo no parece válido');
      // Fecha de baja: desde cuándo dejó de asistir (solo para inactivos)
      var baja = estado === 'inactivo' ? String(p.fechaBaja || '').trim() : '';
      if (baja && (!isDate(baja) || baja > env.today() || baja < '2000-01-01')) throw TesoError('Fecha de baja inválida');
      // Fecha de ingreso: desde cuándo es miembro (vacía = siempre contó). No cuenta en meses anteriores.
      var ingreso = String(p.fechaIngreso || '').trim();
      if (ingreso && (!isDate(ingreso) || ingreso > env.today() || ingreso < '1900-01-01')) throw TesoError('Fecha de ingreso inválida');
      if (ingreso && baja && baja < ingreso) throw TesoError('La fecha de baja no puede ser anterior a la de ingreso');
      return {
        fechaBaja: baja,
        fechaIngreso: ingreso,
        // Habilitado para diezmar: 'no' = estudiante o sin ingresos (no cuenta en la estadística de diezmos)
        habilitadoDiezmo: p.habilitadoDiezmo === 'no' ? 'no' : 'si',
        nombre: nombre, estado: estado, fechaNacimiento: fn,
        celular: String(p.celular || '').trim().slice(0, 30), email: email.slice(0, 120),
        domicilio: String(p.domicilio || '').trim().slice(0, 200), notas: String(p.notas || '').trim().slice(0, 300)
      };
    }
    // Une a dos miembros como matrimonio (vínculo en ambos sentidos). cid vacío = deshacer.
    function vincularConyuge(mid, cid) {
      cid = String(cid || '');
      if (cid === mid) throw TesoError('Un miembro no puede ser su propio cónyuge');
      var yo = find('Miembros', mid);
      if (!yo) throw TesoError('Miembro no encontrado');
      if (yo.conyugeId && yo.conyugeId !== cid) {
        var antes = find('Miembros', yo.conyugeId);
        if (antes && antes.conyugeId === mid) update('Miembros', antes.id, { conyugeId: '' });
      }
      if (cid) {
        var otro = find('Miembros', cid);
        if (!otro) throw TesoError('El cónyuge elegido no está en el registro');
        if (otro.conyugeId && otro.conyugeId !== mid) {
          var exOtro = find('Miembros', otro.conyugeId);
          if (exOtro && exOtro.conyugeId === cid) update('Miembros', exOtro.id, { conyugeId: '' });
        }
        update('Miembros', cid, { conyugeId: mid });
      }
      return update('Miembros', mid, { conyugeId: cid });
    }
    function saveMiembro(user, p) {
      var d = datosMiembro(p);
      var now = env.now();
      var r;
      if (p.id) {
        if (!find('Miembros', p.id)) throw TesoError('Miembro no encontrado');
        r = update('Miembros', p.id, Object.assign(d, { actualizadoEn: now }));
      } else {
        r = insert('Miembros', Object.assign(d, { id: uid(), creadoEn: now, actualizadoEn: now, conyugeId: '' }));
      }
      if (p.conyugeId !== undefined) r = vincularConyuge(r.id, p.conyugeId);
      var enl = enlazarIntegrantes(user, r, p.integranteId, !p.id);
      if (enl.completar) r = update('Miembros', r.id, enl.completar);
      return Object.assign({}, r, { enlazados: enl.nombres });
    }
    // Al registrar a alguien como miembro, queda enlazado solo a su ficha en los listados de los
    // ministerios (p. ej. Jóvenes): el elegido en el formulario, o el que tenga exactamente su mismo
    // nombre (solo si es el único con ese nombre en ese ministerio). Los datos que falten en la ficha
    // de Miembros se completan con los del listado.
    function enlazarIntegrantes(user, mb, integranteId, esNuevo) {
      var integ = all('Integrantes');
      var ya = {};
      integ.forEach(function (i) { if (i.miembroId === mb.id) ya[i.ministerioId] = true; });
      var elegidos = [];
      integranteId = esAdmin(user) ? String(integranteId || '') : '';
      if (integranteId) {
        var it = find('Integrantes', integranteId);
        if (!it) throw TesoError('Esa persona ya no está en el listado del ministerio');
        if (it.miembroId && it.miembroId !== mb.id && find('Miembros', it.miembroId)) throw TesoError(it.nombre + ' ya está enlazado a otra ficha de Miembros');
        if (it.miembroId !== mb.id) {
          if (ya[it.ministerioId]) throw TesoError(mb.nombre + ' ya está enlazado en ese listado');
          elegidos.push(it);
        }
      } else if (esNuevo) {
        var clave = normalNombre(mb.nombre);
        var porMin = {};
        integ.forEach(function (i) {
          if (normalNombre(i.nombre) !== clave) return;
          if (i.miembroId && find('Miembros', i.miembroId)) return;
          (porMin[i.ministerioId] = porMin[i.ministerioId] || []).push(i);
        });
        Object.keys(porMin).forEach(function (mid) { if (porMin[mid].length === 1 && !ya[mid]) elegidos.push(porMin[mid][0]); });
      }
      var completar = {};
      elegidos.forEach(function (i) {
        update('Integrantes', i.id, { miembroId: mb.id, actualizadoEn: env.now() });
        ['celular', 'email', 'fechaNacimiento'].forEach(function (k) { if (!mb[k] && !completar[k] && i[k]) completar[k] = i[k]; });
      });
      if (Object.keys(completar).length) completar.actualizadoEn = env.now();
      return { nombres: elegidos.map(function (i) { return i.nombre; }), completar: Object.keys(completar).length ? completar : null };
    }
    function deleteMiembro(user, p) {
      var mb = find('Miembros', p.id);
      if (!mb) throw TesoError('Miembro no encontrado');
      if (all('Diezmos').some(function (x) { return x.miembroId === mb.id || x.conyugeId === mb.id; })) {
        throw TesoError(esAdmin(user) ? 'Este miembro tiene diezmos registrados. Márcalo como inactivo en vez de eliminarlo.' : 'Este miembro no se puede eliminar. Márcalo como inactivo.');
      }
      if (mb.conyugeId) { var c = find('Miembros', mb.conyugeId); if (c && c.conyugeId === mb.id) update('Miembros', c.id, { conyugeId: '' }); }
      // Los integrantes de ministerios enlazados a esta ficha quedan como no miembros con sus datos
      all('Integrantes').forEach(function (i) {
        if (i.miembroId === mb.id) update('Integrantes', i.id, { miembroId: '', nombre: mb.nombre, celular: mb.celular || i.celular, email: mb.email || i.email, fechaNacimiento: mb.fechaNacimiento || i.fechaNacimiento, actualizadoEn: env.now() });
      });
      remove('Miembros', mb.id);
      return { id: mb.id };
    }
    function importarMiembros(user, p) {
      var items = p.items || [];
      if (!items.length) throw TesoError('No hay miembros para importar');
      if (items.length > 2000) throw TesoError('Demasiadas filas');
      var existentes = {};
      all('Miembros').forEach(function (m) { existentes[normalNombre(m.nombre)] = 1; });
      var now = env.now(), nuevos = [], omitidos = 0;
      items.forEach(function (it, i) {
        var d;
        try { d = datosMiembro(it); } catch (e) { throw TesoError('Fila ' + (i + 1) + ': ' + e.message); }
        var k = normalNombre(d.nombre);
        if (existentes[k] && !it.permitirRepetido) { omitidos++; return; }
        existentes[k] = 1;
        nuevos.push(Object.assign(d, { id: uid(), creadoEn: now, actualizadoEn: now }));
      });
      if (nuevos.length) insertMany('Miembros', nuevos);
      return { importados: nuevos.length, omitidos: omitidos };
    }

    // ---------------- Diezmos por hermano (solo tesorero) ----------------
    // Registro de control: no mueve la caja (los diezmos ya entran a la tesorería
    // general al registrar el culto). La página compara ambos totales por mes.
    function datosDiezmo(p) {
      var mb = find('Miembros', p.miembroId);
      if (!mb) throw TesoError('Miembro no encontrado');
      if (!isDate(p.fecha)) throw TesoError('Fecha inválida');
      if (p.fecha > env.today()) throw TesoError('La fecha no puede ser futura');
      if (p.fecha < '2000-01-01') throw TesoError('Fecha inválida');
      var monto = Math.round(Number(p.monto));
      if (!(monto > 0)) throw TesoError('El monto debe ser mayor a 0');
      if (monto > MAX_MONTO) throw TesoError('El monto es demasiado grande');
      var conyugeId = String(p.conyugeId || '');
      if (conyugeId) {
        if (conyugeId === mb.id) throw TesoError('El cónyuge no puede ser el mismo hermano');
        if (!find('Miembros', conyugeId)) throw TesoError('El cónyuge no está en el registro de miembros');
      }
      return { miembroId: mb.id, conyugeId: conyugeId, fecha: p.fecha, mes: p.fecha.slice(0, 7), monto: monto, medio: String(p.medio || '').trim().slice(0, 30), notas: String(p.notas || '').trim().slice(0, 200) };
    }
    // Ingreso en la tesorería general vinculado a un diezmo registrado fuera del culto
    function ingresoDeDiezmo(user, d, diezmoId) {
      var now = env.now();
      return insert('MovimientosGenerales', {
        id: uid(), fecha: d.fecha, mes: d.mes, tipo: 'ingreso', categoria: 'Diezmos', grupo: grupoDe('ingreso', 'Diezmos'),
        descripcion: 'Diezmo' + (d.medio ? ' · ' + d.medio.toLowerCase() : ''), monto: d.monto, medio: d.medio, archivoId: '', ministerioId: '',
        origen: 'diezmo', refId: diezmoId, creadoPor: user.id, creadoEn: now, actualizadoEn: now
      });
    }
    function movDeDiezmo(x) {
      var g = x.movGeneralId ? find('MovimientosGenerales', x.movGeneralId) : null;
      return g && g.origen === 'diezmo' ? g : null; // solo los creados 1:1 (no el total de un culto)
    }
    function saveDiezmo(user, p) {
      var d = datosDiezmo(p);
      var now = env.now();
      // comprobante (foto o PDF de la transferencia), opcional
      var archivoNuevo = guardarArchivo(p.archivo, ['Comprobantes diezmos', d.mes]);
      if (p.id) {
        var actual = find('Diezmos', p.id);
        if (!actual) throw TesoError('Registro no encontrado');
        // Diezmo que es parte de un culto: queda en la fecha del culto y lo identificado no puede superar su total
        var culto = actual.movGeneralId ? find('MovimientosGenerales', actual.movGeneralId) : null;
        if (culto && culto.origen !== 'diezmo') {
          if (d.fecha !== culto.fecha) throw TesoError('Este diezmo es parte del culto del ' + culto.fecha.split('-').reverse().join('-') + ': su fecha no se puede cambiar.');
          var otros = all('Diezmos').reduce(function (a, x) { return a + (x.movGeneralId === culto.id && x.id !== actual.id ? (Number(x.monto) || 0) : 0); }, 0);
          if (otros + d.monto > culto.monto) throw TesoError('Lo identificado por hermano superaría el total del culto (' + pesos(culto.monto) + '). Corrige primero el ingreso del culto en Tesorería.');
        }
        if (archivoNuevo) { borrarArchivo(actual.archivoId); d.archivoId = archivoNuevo; }
        else if (p.quitarArchivo) { borrarArchivo(actual.archivoId); d.archivoId = ''; }
        var g = movDeDiezmo(actual);
        if (g) update('MovimientosGenerales', g.id, { fecha: d.fecha, mes: d.mes, monto: d.monto, medio: d.medio, descripcion: 'Diezmo' + (d.medio ? ' · ' + d.medio.toLowerCase() : ''), actualizadoEn: now });
        return update('Diezmos', p.id, Object.assign(d, { actualizadoEn: now }));
      }
      var id = uid();
      var movId = p.sumarACaja ? ingresoDeDiezmo(user, d, id).id : '';
      return insert('Diezmos', Object.assign(d, { id: id, creadoPor: user.id, creadoEn: now, actualizadoEn: now, movGeneralId: movId, archivoId: archivoNuevo }));
    }
    function saveDiezmosLote(user, p) {
      var items = (p.items || []).filter(function (it) { return Number(it.monto) > 0; });
      if (!items.length) throw TesoError('Ingresa al menos un monto');
      var now = env.now();
      var filas = items.map(function (it, i) {
        try {
          return Object.assign(datosDiezmo({ miembroId: it.miembroId, conyugeId: it.conyugeId, fecha: p.fecha, monto: it.monto, medio: p.medio, notas: it.notas }), { id: uid(), creadoPor: user.id, creadoEn: now, actualizadoEn: now, movGeneralId: '' });
        } catch (e) { throw TesoError('Fila ' + (i + 1) + ': ' + e.message); }
      });
      if (p.sumarACaja) {
        var movs = filas.map(function (f) {
          var g = { id: uid(), fecha: f.fecha, mes: f.mes, tipo: 'ingreso', categoria: 'Diezmos', grupo: grupoDe('ingreso', 'Diezmos'), descripcion: 'Diezmo' + (f.medio ? ' · ' + f.medio.toLowerCase() : ''), monto: f.monto, medio: f.medio, archivoId: '', ministerioId: '', origen: 'diezmo', refId: f.id, creadoPor: user.id, creadoEn: now, actualizadoEn: now };
          f.movGeneralId = g.id;
          return g;
        });
        insertMany('MovimientosGenerales', movs);
      }
      insertMany('Diezmos', filas);
      return { creados: filas.length, enCaja: !!p.sumarACaja };
    }
    // Historial (p. ej. el cuaderno de la tesorera anterior). No suma a la caja:
    // esos meses ya están en la tesorería general. No duplica por refId.
    function importarDiezmos(user, p) {
      var items = p.items || [];
      if (!items.length) throw TesoError('No hay diezmos para importar');
      if (items.length > 3000) throw TesoError('Demasiadas filas');
      var existentes = {};
      all('Diezmos').forEach(function (x) { if (x.refId) existentes[x.refId] = 1; });
      var now = env.now(), nuevos = [], omitidos = 0;
      items.forEach(function (it, i) {
        var ref = String(it.refId || '');
        if (!ref) throw TesoError('Fila ' + (i + 1) + ': falta el identificador de origen');
        if (existentes[ref]) { omitidos++; return; }
        var d;
        try { d = datosDiezmo(it); } catch (e) { throw TesoError('Fila ' + (i + 1) + ': ' + e.message); }
        existentes[ref] = 1;
        nuevos.push(Object.assign(d, { id: uid(), creadoPor: user.id, creadoEn: now, actualizadoEn: now, movGeneralId: '', refId: ref }));
      });
      if (nuevos.length) insertMany('Diezmos', nuevos);
      var vinculados = 0;
      if (p.vincularMatrimonios) {
        nuevos.forEach(function (x) {
          if (!x.conyugeId) return;
          var a = find('Miembros', x.miembroId), b = find('Miembros', x.conyugeId);
          if (!a || !b) return;
          if (a.conyugeId === b.id && b.conyugeId === a.id) return;
          if (a.conyugeId || b.conyugeId) return; // ya tienen otro cónyuge: no se cambia
          vincularConyuge(a.id, b.id);
          vinculados++;
        });
      }
      return { importados: nuevos.length, omitidos: omitidos, matrimonios: vinculados };
    }
    function deleteDiezmo(user, p) {
      var x = find('Diezmos', p.id);
      if (!x) throw TesoError('Registro no encontrado');
      var g = movDeDiezmo(x);
      if (g) remove('MovimientosGenerales', g.id);
      borrarArchivo(x.archivoId);
      remove('Diezmos', String(p.id));
      return { id: p.id };
    }

    // ---------------- Archivos (boletas) ----------------
    function getArchivo(user, p) {
      var id = String(p.id || '');
      if (!id) throw TesoError('Archivo inválido');
      if (!esAdmin(user)) {
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
        activo: p.activo === undefined ? (actual ? actual.activo : true) : toBool(p.activo),
        // Listado de integrantes y actividades con cuota: 'si' / 'no'
        actividades: p.actividades === undefined ? (actual ? actual.actividades : '') : (p.actividades === 'si' || p.actividades === true ? 'si' : 'no')
      };
      if (p.id) return update('Ministerios', p.id, d);
      return insert('Ministerios', Object.assign(d, { id: uid(), creadoEn: env.now() }));
    }
    // Solo el administrador agrega, modifica o desactiva usuarios. Mientras no exista ningún administrador
    // activo, tesorero y pastor pueden hacerlo (para crear el primero).
    function hayAdminActivo() { return all('Usuarios').some(function (u) { return u.rol === 'admin' && toBool(u.activo); }); }
    function puedeGestionarUsuarios(user) { return user.rol === 'admin' || (ADMIN.indexOf(user.rol) >= 0 && !hayAdminActivo()); }
    function saveUsuario(user, p) {
      if (!puedeGestionarUsuarios(user)) throw TesoError('Solo el administrador puede agregar, modificar o desactivar usuarios', 'FORBIDDEN');
      var usuario = String(p.usuario || '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) throw TesoError('El usuario debe tener 3-30 caracteres (letras, números, punto o guion)');
      var nombre = String(p.nombre || '').trim();
      if (!nombre) throw TesoError('Ingresa el nombre');
      var rol = ROLES.indexOf(p.rol) >= 0 ? p.rol : 'lider';
      var ministerioId = rol === 'lider' ? String(p.ministerioId || '') : '';
      if (rol === 'lider' && !ministerioId) throw TesoError('Asigna un ministerio al líder');
      var dup = all('Usuarios').some(function (u) { return u.usuario === usuario && u.id !== p.id; });
      if (dup) throw TesoError('Ese nombre de usuario ya existe');
      var d = { nombre: nombre, usuario: usuario, rol: rol, ministerioId: ministerioId, email: String(p.email || '').trim(), activo: p.activo === undefined ? true : toBool(p.activo) };
      if (p.id === user.id && (!d.activo || ADMIN.indexOf(d.rol) < 0)) throw TesoError('No puedes quitarte a ti mismo el acceso completo ni desactivarte');
      if (p.id === user.id && user.rol === 'admin' && d.rol !== 'admin') throw TesoError('No puedes quitarte a ti mismo el rol de administrador: pídeselo a otro administrador');
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
      // Presupuesto general: cada cambio rige desde un mes en adelante; los meses anteriores conservan el suyo
      if (p.presupuestoGeneral !== undefined || p.quitarPresupuestoDesde) {
        var hist = config().presupuestosGenerales.slice();
        if (p.quitarPresupuestoDesde) {
          if (String(p.quitarPresupuestoDesde) <= env.today().slice(0, 7)) throw TesoError('Solo se puede quitar un cambio programado (de un mes futuro). Para corregir el presupuesto vigente, guarda un monto nuevo desde el mes que corresponda.');
          hist = hist.filter(function (h) { return h.desde !== String(p.quitarPresupuestoDesde); });
        } else {
          var v = Math.round(Number(p.presupuestoGeneral) || 0);
          if (v < 0 || v > MAX_MONTO) throw TesoError('Presupuesto general inválido');
          var desde = String(p.presupuestoDesde || env.today().slice(0, 7));
          if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(desde)) throw TesoError('Elige desde qué mes rige el presupuesto');
          // el nuevo monto rige desde ese mes en adelante: reemplaza los cambios de ese mes o posteriores
          hist = hist.filter(function (h) { return h.desde < desde; });
          if (!hist.length && desde > '2000-01') hist.push({ desde: '2000-01', monto: 0 }); // antes: sin límite
          hist.push({ desde: desde, monto: v });
        }
        // sin cambios útiles (todo en 0) = sin presupuesto
        if (!hist.some(function (h) { return h.monto > 0; })) hist = [];
        guardar('presupuestosGenerales', JSON.stringify(hist));
        guardar('presupuestoGeneral', String(presupuestoVigente(hist, 0, env.today().slice(0, 7))));
      }
      return config();
    }

    // ---------------- Router ----------------
    var T = ADMIN;
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
      saveMiembro: { fn: saveMiembro, role: MIEMBROS, write: true },
      deleteMiembro: { fn: deleteMiembro, role: ADMIN, write: true },
      importarMiembros: { fn: importarMiembros, role: MIEMBROS, write: true },
      saveDiezmo: { fn: saveDiezmo, role: T, write: true },
      saveDiezmosLote: { fn: saveDiezmosLote, role: T, write: true },
      importarDiezmos: { fn: importarDiezmos, role: T, write: true },
      deleteDiezmo: { fn: deleteDiezmo, role: T, write: true },
      saveIntegrante: { fn: saveIntegrante, role: CON_MINISTERIO, write: true },
      deleteIntegrante: { fn: deleteIntegrante, role: CON_MINISTERIO, write: true },
      agregarMiembrosIntegrantes: { fn: agregarMiembrosIntegrantes, role: ADMIN, write: true },
      saveAsistencia: { fn: saveAsistencia, role: MIEMBROS, write: true },
      deleteAsistencia: { fn: deleteAsistencia, role: MIEMBROS, write: true },
      saveAsistenciaMinisterio: { fn: saveAsistenciaMinisterio, role: CON_MINISTERIO, write: true },
      deleteAsistenciaMinisterio: { fn: deleteAsistenciaMinisterio, role: CON_MINISTERIO, write: true },
      saveVisita: { fn: saveVisita, role: MIEMBROS, write: true },
      deleteVisita: { fn: deleteVisita, role: MIEMBROS, write: true },
      saveActividad: { fn: saveActividad, role: CON_MINISTERIO, write: true },
      deleteActividad: { fn: deleteActividad, role: CON_MINISTERIO, write: true },
      setConfirmados: { fn: setConfirmados, role: CON_MINISTERIO, write: true },
      registrarPagoCuota: { fn: registrarPagoCuota, role: CON_MINISTERIO, write: true },
      anularPagoCuota: { fn: anularPagoCuota, role: CON_MINISTERIO, write: true },
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
        if (a.role && a.role.indexOf(user.rol) < 0) throw TesoError('No tienes permiso para esta acción', 'FORBIDDEN');
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
          var u = all('Usuarios').filter(function (x) { return ADMIN.indexOf(x.rol) >= 0 && x.activo; })[0];
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
    CUOTA: CUOTA,
    MEDIOS: MEDIOS,
    hashPassword: hashPassword,
    prevMonth: prevMonth,
    nextMonth: nextMonth,
    labelMes: labelMes,
    presupuestoVigente: presupuestoVigente,
    ROLES: ROLES,
    ADMIN: ADMIN,
    pesos: pesos,
    create: create
  };
})();
