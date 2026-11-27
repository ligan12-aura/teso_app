/**
 * Modo DEMO: ejecuta la misma lógica del servidor (backend/Core.js)
 * dentro del navegador, guardando todo en localStorage.
 * Sirve para probar la app sin configurar Google.
 */

const DB_KEY = 'teso_demo_db_v8';
try { ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7'].forEach((v) => localStorage.removeItem('teso_demo_db_' + v)); } catch (e) { /* sin almacenamiento */ }
const FILES_KEY = 'teso_demo_files_v1';
const SECRET_KEY = 'teso_demo_secret';

// ---------------- SHA-256 síncrono (solo para la demo) ----------------
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
function sha256Bytes(bytes) {
  const l = bytes.length;
  const withPad = new Uint8Array(((l + 9 + 63) >> 6) << 6);
  withPad.set(bytes);
  withPad[l] = 0x80;
  const bits = l * 8;
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 4, bits >>> 0);
  dv.setUint32(withPad.length - 8, Math.floor(bits / 0x100000000));
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < withPad.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  H.forEach((v, i) => odv.setUint32(i * 4, v));
  return out;
}
const enc = new TextEncoder();
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const sha256Hex = (s) => hex(sha256Bytes(enc.encode(s)));
function hmacHex(msg, key) {
  let k = enc.encode(key);
  if (k.length > 64) k = sha256Bytes(k);
  const kp = new Uint8Array(64); kp.set(k);
  const ipad = kp.map((x) => x ^ 0x36), opad = kp.map((x) => x ^ 0x5c);
  const m = enc.encode(msg);
  const inner = new Uint8Array(64 + m.length); inner.set(ipad); inner.set(m, 64);
  const ih = sha256Bytes(inner);
  const outer = new Uint8Array(96); outer.set(opad); outer.set(ih, 64);
  return hex(sha256Bytes(outer));
}

// ---------------- Almacenamiento local ----------------
function loadJSON(key, def) {
  try { return JSON.parse(localStorage.getItem(key)) || def; } catch { return def; }
}
function saveJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); }
  catch { alert('El almacenamiento del navegador (modo demo) está lleno. Usa "Reiniciar demo" o boletas más livianas.'); throw new Error('Almacenamiento lleno'); }
}

class LocalStore {
  constructor() { this.db = loadJSON(DB_KEY, null); }
  t(name) { this.db[name] ||= []; return this.db[name]; }
  persist() { saveJSON(DB_KEY, this.db); }
  read(name) { return this.t(name).map((r) => ({ ...r })); }
  insert(name, row) { this.t(name).push({ ...row }); this.persist(); }
  update(name, id, row) {
    const arr = this.t(name); const i = arr.findIndex((r) => r.id === id);
    if (i < 0) throw new Error('Registro no encontrado');
    arr[i] = { ...row }; this.persist();
  }
  remove(name, id) { this.db[name] = this.t(name).filter((r) => r.id !== id); this.persist(); }
}

const localFiles = {
  save(o) {
    const all = loadJSON(FILES_KEY, {});
    const id = 'f' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    all[id] = { nombre: o.nombre, mime: o.mime, base64: o.base64 };
    saveJSON(FILES_KEY, all);
    return id;
  },
  get(id) {
    const f = loadJSON(FILES_KEY, {})[id];
    if (f) return f;
    // boletas de ejemplo generadas al vuelo
    if (String(id).startsWith('demo-')) return demoReceipt(id);
    throw new Error('Archivo no encontrado');
  },
  remove(id) { const all = loadJSON(FILES_KEY, {}); delete all[id]; saveJSON(FILES_KEY, all); }
};

const pad = (n) => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export function demoEnv() {
  let secret = localStorage.getItem(SECRET_KEY);
  if (!secret) { secret = crypto.randomUUID(); localStorage.setItem(SECRET_KEY, secret); }
  if (!loadJSON(DB_KEY, null)) seed();
  return {
    store: new LocalStore(),
    files: localFiles,
    crypto: { sha256Hex, hmacHex },
    uuid: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
    today: todayStr,
    secret,
    extra: { demo: true }
  };
}

export function resetDemo() {
  localStorage.removeItem(DB_KEY);
  localStorage.removeItem(FILES_KEY);
  localStorage.removeItem('teso_token_demo');
}

// ---------------- Boleta de ejemplo (SVG) ----------------
function demoReceipt(id) {
  const [, monto = '0', ...rest] = String(id).split('-');
  const desc = decodeURIComponent(rest.join('-') || 'Compra');
  const m = Number(monto).toLocaleString('es-CL');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="620" viewBox="0 0 420 620">
<rect width="420" height="620" fill="#fbfaf6"/><rect x="20" y="20" width="380" height="580" fill="#fff" stroke="#ddd"/>
<text x="210" y="80" font-family="monospace" font-size="22" text-anchor="middle" font-weight="bold">BOLETA ELECTRÓNICA</text>
<text x="210" y="110" font-family="monospace" font-size="15" text-anchor="middle">Comercial Ejemplo SpA</text>
<text x="210" y="132" font-family="monospace" font-size="13" text-anchor="middle">RUT 76.123.456-7 · N° ${Math.abs(hashCode(id)) % 900000 + 100000}</text>
<line x1="40" y1="160" x2="380" y2="160" stroke="#999" stroke-dasharray="6 4"/>
<text x="40" y="200" font-family="monospace" font-size="15">${escapeXml(desc).slice(0, 34)}</text>
<text x="380" y="230" font-family="monospace" font-size="15" text-anchor="end">$${m}</text>
<line x1="40" y1="270" x2="380" y2="270" stroke="#999" stroke-dasharray="6 4"/>
<text x="40" y="310" font-family="monospace" font-size="20" font-weight="bold">TOTAL</text>
<text x="380" y="310" font-family="monospace" font-size="20" text-anchor="end" font-weight="bold">$${m}</text>
<text x="210" y="560" font-family="monospace" font-size="12" text-anchor="middle" fill="#888">(boleta de ejemplo · modo demo)</text></svg>`;
  return { nombre: 'boleta.svg', mime: 'image/svg+xml', base64: btoa(unescape(encodeURIComponent(svg))) };
}
function hashCode(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }
function escapeXml(s) { return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }

// ---------------- Datos de ejemplo ----------------
function seed() {
  let n = 0;
  const id = () => 'd' + (++n).toString(36) + Math.random().toString(36).slice(2, 8);
  const now = new Date().toISOString();
  const db = { Usuarios: [], Ministerios: [], MovimientosGenerales: [], MovimientosMinisterios: [], Rendiciones: [], Transferencias: [], Config: [], Miembros: [], Diezmos: [], Integrantes: [], Actividades: [], Inscripciones: [], Asistencias: [], Visitas: [], AsistenciasMinisterios: [], GruposHogar: [], PersonasHogar: [], AsistenciasHogar: [] };
  let rnd = 7;
  const rand = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
  const between = (a, b) => Math.round((a + rand() * (b - a)) / 500) * 500;

  const user = (nombre, usuario, rol, ministerioId = '') => {
    const salt = id();
    db.Usuarios.push({ id: id(), nombre, usuario, rol, ministerioId, email: '', activo: true, debeCambiarPass: false, salt, hash: TesoCore.hashPassword('demo', salt, sha256Hex), creadoEn: now });
  };
  const tesoreroId = (user('Daniel Muñoz', 'tesorero', 'tesorero'), db.Usuarios[0].id);
  user('Pastor Samuel Ríos', 'pastor', 'pastor');
  user('Marta Lagos', 'secretaria', 'secretaria');
  user('Rodrigo Fuentes', 'admin', 'admin');

  const mins = [
    ['Alabanza', '#7c5cbf', '🎵', 120000, 'Camila Rojas', 'alabanza'],
    ['Infantil', '#e9883a', '🧸', 90000, 'Paula Soto', 'infantil'],
    ['Jóvenes', '#2f9e8f', '🔥', 110000, 'Matías Fuentes', 'jovenes'],
    ['Misiones', '#3a6ea5', '🌎', 150000, 'Andrés Pérez', 'misiones'],
    ['Mujeres', '#c2577a', '🌷', 60000, 'Ruth Contreras', 'mujeres'],
    ['Diaconía', '#7a8b3a', '🤝', 80000, 'Jorge Silva', 'diaconia']
  ].map(([nombre, color, icono, itemMensual, lider, usuario]) => {
    const m = { id: id(), nombre, color, icono, itemMensual, presupuestoMensual: Math.round(itemMensual * 1.35 / 10000) * 10000, activo: true, creadoEn: now };
    db.Ministerios.push(m);
    user(lider, usuario, 'lider', m.id);
    return m;
  });

  const today = todayStr();
  const curMonth = today.slice(0, 7);
  const months = [];
  let m = curMonth;
  for (let i = 0; i < 12; i++) { months.unshift(m); m = TesoCore.prevMonth(m); }
  const lastDay = (mm) => new Date(+mm.slice(0, 4), +mm.slice(5, 7), 0).getDate();
  const dateIn = (mm, d) => `${mm}-${pad(Math.min(d, lastDay(mm)))}`;
  const notFuture = (f) => f <= today;

  db.Config.push({ id: 'nombreIglesia', valor: 'Iglesia Bautista El Redentor' });
  db.Config.push({ id: 'saldoInicial', valor: '1250000' });
  db.Config.push({ id: 'fechaSaldoInicial', valor: months[0] + '-01' });
  db.Config.push({ id: 'presupuestoGeneral', valor: '2600000' });

  const gen = (fecha, tipo, categoria, monto, descripcion, medio = 'Transferencia', extra = {}) => {
    if (!notFuture(fecha)) return null;
    const r = { id: id(), fecha, mes: fecha.slice(0, 7), tipo, categoria, descripcion, monto, medio, archivoId: '', ministerioId: '', origen: 'manual', refId: '', creadoPor: tesoreroId, creadoEn: now, actualizadoEn: now, grupo: TesoCore.grupoDe(tipo, categoria), ...extra };
    db.MovimientosGenerales.push(r);
    return r;
  };

  // Tesorería general: cultos dominicales y gastos fijos
  months.forEach((mm, mi) => {
    const growth = 1 + mi * 0.012;
    for (let d = 1; d <= lastDay(mm); d++) {
      const dow = new Date(+mm.slice(0, 4), +mm.slice(5, 7) - 1, d).getDay();
      if (dow !== 0) continue;
      const f = dateIn(mm, d);
      gen(f, 'ingreso', 'Diezmos', Math.round(between(260000, 420000) * growth), 'Culto dominical', 'Efectivo');
      gen(f, 'ingreso', 'Ofrendas', Math.round(between(60000, 120000) * growth), 'Culto dominical', 'Efectivo');
      if (d <= 7) gen(f, 'ingreso', 'Ofrenda misionera', between(60000, 120000), 'Primer domingo', 'Efectivo');
    }
    gen(dateIn(mm, 5), 'ingreso', 'Diezmos', between(150000, 300000), 'Diezmos por transferencia');
    gen(dateIn(mm, 3), 'gasto', 'Sueldo pastoral', 950000, 'Sueldo pastor');
    gen(dateIn(mm, 10), 'gasto', 'Luz', between(55000, 95000), 'Cuenta de luz');
    gen(dateIn(mm, 12), 'gasto', 'Agua', between(18000, 32000), 'Cuenta de agua');
    gen(dateIn(mm, 14), 'gasto', 'Internet y teléfono', 32990, 'Plan internet templo');
    gen(dateIn(mm, 18), 'gasto', 'Aseo y limpieza', between(25000, 60000), 'Artículos de aseo', 'Efectivo');
    if (mi % 3 === 1) gen(dateIn(mm, 22), 'gasto', 'Mantención templo', between(120000, 380000), 'Reparaciones y mantención');
    if (mi % 2 === 0) gen(dateIn(mm, 20), 'gasto', 'Ayuda social', between(40000, 120000), 'Canastas familiares');
    gen(dateIn(mm, 26), 'gasto', 'Misiones', between(80000, 150000), 'Apoyo misionero mensual');
    gen(dateIn(mm, 28), 'gasto', 'Gastos bancarios', 4990, 'Mantención cuenta');
    if (mi === 9) gen(dateIn(mm, 15), 'ingreso', 'Actividades', 420000, 'Bingo solidario', 'Efectivo');
    if (mi === 6) gen(dateIn(mm, 9), 'ingreso', 'Donaciones', 500000, 'Donación familia hermana');
  });

  // Ministerios: ítems, gastos y rendiciones
  const gastosTipo = {
    Alabanza: [['Equipamiento', 'Cuerdas de guitarra'], ['Equipamiento', 'Baquetas y parches'], ['Materiales', 'Pilas micrófonos'], ['Impresiones', 'Cancioneros'], ['Alimentación', 'Colación ensayo general']],
    Infantil: [['Materiales', 'Lápices y cartulinas'], ['Alimentación', 'Colaciones escuela dominical'], ['Regalos / premios', 'Premios memorización'], ['Decoración', 'Decoración sala'], ['Impresiones', 'Guías de estudio']],
    Jóvenes: [['Alimentación', 'Once reunión de jóvenes'], ['Actividad / evento', 'Arriendo cancha'], ['Transporte', 'Pasajes retiro'], ['Materiales', 'Material devocional'], ['Impresiones', 'Afiches campamento']],
    Misiones: [['Transporte', 'Viaje misionero'], ['Ayuda social', 'Ayuda familia misionera'], ['Alimentación', 'Alimentos operativo'], ['Materiales', 'Biblias y tratados']],
    Mujeres: [['Alimentación', 'Desayuno de mujeres'], ['Decoración', 'Flores y decoración'], ['Materiales', 'Material estudio bíblico'], ['Regalos / premios', 'Detalles día de la madre']],
    Diaconía: [['Ayuda social', 'Canasta familiar'], ['Ayuda social', 'Ayuda en medicamentos'], ['Transporte', 'Traslado hermanos'], ['Materiales', 'Insumos santa cena']]
  };
  const lastIdx = months.length - 1;
  mins.forEach((min, k) => {
    const lider = db.Usuarios.find((u) => u.ministerioId === min.id);
    months.forEach((mm, mi) => {
      // Ítem del mes (se transfiere a fin del mes anterior / inicio del mes)
      const prevApproved = mi === 0 || mi < lastIdx || [0, 1, 3].includes(k);
      if (prevApproved) {
        const fecha = mi === 0 ? dateIn(mm, 2) : dateIn(TesoCore.prevMonth(mm), 30);
        const tid = id();
        const g = gen(fecha, 'gasto', 'Asignación ministerios', min.itemMensual, `Ítem ${TesoCore.labelMes(mm)} · ${min.nombre}`, 'Transferencia', { ministerioId: min.id, origen: 'transferencia', refId: tid });
        const mmv = { id: id(), ministerioId: min.id, fecha, mes: mm, tipo: 'ingreso', categoria: 'Ítem mensual', descripcion: `Ítem mensual ${TesoCore.labelMes(mm)}`, monto: min.itemMensual, archivoId: '', origen: 'transferencia', refId: tid, creadoPor: tesoreroId, creadoEn: now, actualizadoEn: now };
        db.MovimientosMinisterios.push(mmv);
        db.Transferencias.push({ id: tid, ministerioId: min.id, mes: mm, monto: min.itemMensual, fecha, movGeneralId: g ? g.id : '', movMinisterioId: mmv.id, creadoPor: tesoreroId, creadoEn: now });
      }
      // Gastos del mes
      const lista = gastosTipo[min.nombre];
      const nG = 3 + Math.floor(rand() * 2);
      const isCur = mm === curMonth;
      let gastadoMes = 0;
      for (let j = 0; j < nG; j++) {
        const [categoria, descripcion] = lista[Math.floor(rand() * lista.length)];
        const d = 3 + Math.floor(rand() * 25);
        const fecha = dateIn(mm, d);
        if (!notFuture(fecha)) continue;
        const monto = Math.max(3000, Math.round(min.itemMensual * (0.16 + rand() * 0.26) / 100) * 100);
        const conBoleta = rand() > 0.15;
        // Datos de ejemplo coherentes: ningún mes supera el presupuesto del ministerio
        if (gastadoMes + monto > min.presupuestoMensual) continue;
        gastadoMes += monto;
        db.MovimientosMinisterios.push({ id: id(), ministerioId: min.id, fecha, mes: mm, tipo: 'gasto', categoria, descripcion, monto, archivoId: conBoleta ? `demo-${monto}-${encodeURIComponent(descripcion)}` : '', origen: 'manual', refId: '', creadoPor: lider.id, creadoEn: now, actualizadoEn: now });
      }
      if (rand() > 0.75) {
        const fecha = dateIn(mm, 15 + Math.floor(rand() * 10));
        if (notFuture(fecha)) db.MovimientosMinisterios.push({ id: id(), ministerioId: min.id, fecha, mes: mm, tipo: 'ingreso', categoria: 'Venta / actividad', descripcion: 'Venta de queques', monto: between(15000, 45000), archivoId: '', origen: 'manual', refId: '', creadoPor: lider.id, creadoEn: now, actualizadoEn: now });
      }
      // Rendición
      if (isCur) return;
      let estado = 'aprobada';
      let comentarioTesorero = '';
      if (mi === lastIdx - 1) {
        estado = ['aprobada', 'aprobada', 'enviada', 'aprobada', 'observada', 'abierta'][k];
        if (estado === 'observada') comentarioTesorero = 'Falta la boleta del desayuno del día 12. Por favor súbela.';
      }
      if (estado === 'abierta') return;
      db.Rendiciones.push({
        id: id(), ministerioId: min.id, mes: mm, estado, comentarioLider: estado !== 'abierta' ? 'Rendición completa.' : '',
        fechaEnvio: `${TesoCore.nextMonth(mm)}-02T15:00:00.000Z`, comentarioTesorero,
        fechaRevision: estado === 'aprobada' || estado === 'observada' ? `${TesoCore.nextMonth(mm)}-03T20:00:00.000Z` : '', revisadoPor: estado === 'enviada' ? '' : tesoreroId
      });
    });
  });

  // Miembros y diezmos de ejemplo (nombres ficticios)
  const nombres = ['Ana Castillo', 'Benjamín Rojas', 'Carolina Muñoz', 'Daniel Fuentes', 'Elena Vargas', 'Felipe Soto', 'Gabriela Torres', 'Héctor Díaz', 'Isabel Contreras', 'Joaquín Reyes',
    'Karina Morales', 'Luis Espinoza', 'Marcela Pino', 'Nicolás Herrera', 'Olga Navarro', 'Pablo Sepúlveda', 'Rebeca Lagos', 'Samuel Ortiz', 'Teresa Gómez', 'Vicente Bravo',
    'Ximena Salinas', 'Yolanda Cárcamo', 'Andrés Valdés', 'Beatriz Leiva', 'Cristian Paredes', 'Daniela Riquelme', 'Esteban Moya', 'Francisca Aguilar'];
  const perfiles = ['constante', 'constante', 'constante', 'irregular', 'irregular', 'sin', 'constante', 'irregular'];
  nombres.forEach((nombre, i) => {
    const inactivo = i % 9 === 8;
    const mid = id();
    const anioNac = 1950 + Math.floor(rand() * 55);
    const conDatos = rand() > 0.35;
    db.Miembros.push({ id: mid, nombre, estado: inactivo ? 'inactivo' : 'activo', fechaNacimiento: conDatos ? `${anioNac}-${pad(1 + Math.floor(rand() * 12))}-${pad(1 + Math.floor(rand() * 27))}` : '',
      celular: conDatos ? `+56 9 ${5000 + Math.floor(rand() * 4999)} ${1000 + Math.floor(rand() * 8999)}` : '', email: conDatos && rand() > 0.3 ? `${nombre.split(' ')[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}@correo.cl` : '',
      domicilio: conDatos ? `Pasaje ${1 + Math.floor(rand() * 40)}, Temuco` : '', notas: inactivo ? 'Alejado' : '', creadoEn: now, actualizadoEn: now });
    const perfil = inactivo ? 'sin' : perfiles[i % perfiles.length];
    const base = between(15000, 90000);
    months.filter((mm) => mm.startsWith(curMonth.slice(0, 4))).forEach((mm) => {
      const da = perfil === 'constante' ? rand() > 0.05 : perfil === 'irregular' ? rand() > 0.55 : false;
      // la mayoría entrega el diezmo de un mes a fin de ese mes o a principios del siguiente; algunos se atrasan
      const r = rand(), sig = TesoCore.nextMonth(mm), sig2 = TesoCore.nextMonth(sig);
      const f = r < 0.2 ? dateIn(mm, 20 + Math.floor(rand() * 9)) : r < (perfil === 'constante' ? 0.85 : 0.6) ? dateIn(sig, 1 + Math.floor(rand() * 10)) : r < 0.93 ? dateIn(sig, 11 + Math.floor(rand() * 17)) : dateIn(sig2, 1 + Math.floor(rand() * 20));
      if (da && notFuture(f)) db.Diezmos.push({ id: id(), miembroId: mid, fecha: f, mes: mm, monto: base, medio: rand() > 0.5 ? 'Efectivo' : 'Transferencia', notas: '', creadoPor: tesoreroId, creadoEn: now, actualizadoEn: now });
    });
  });

  // Jóvenes: listado propio (algunos son miembros) y una actividad con cuota
  const jov = mins.find((x) => x.nombre === 'Jóvenes');
  jov.actividades = 'si';
  const liderJov = db.Usuarios.find((u) => u.ministerioId === jov.id);
  const jovenes = ['Tomás Riquelme', 'Valentina Cáceres', 'Martín Ulloa', 'Josefa Inostroza', 'Diego Carrasco', 'Catalina Bustos', 'Sebastián Poblete', 'Fernanda Arriagada', 'Ignacio Vera', 'Antonia Sandoval'];
  const integ = jovenes.map((nombre, i) => ({
    id: id(), ministerioId: jov.id, nombre, celular: `+56 9 ${6000 + i * 137} ${2000 + i * 311}`, email: i % 3 ? '' : `${nombre.split(' ')[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}@correo.cl`,
    fechaNacimiento: `${2003 + (i % 7)}-${pad(1 + ((i * 5) % 12))}-${pad(3 + i * 2)}`, miembroId: '', notas: i === 4 ? 'Asiste con su hermano' : '', activo: i !== 9, creadoEn: now, actualizadoEn: now
  }));
  // dos jóvenes que ya son miembros de la iglesia (enlazados a su ficha)
  [db.Miembros[1], db.Miembros[9]].forEach((mb) => integ.push({ id: id(), ministerioId: jov.id, nombre: mb.nombre, celular: '', email: '', fechaNacimiento: '', miembroId: mb.id, notas: '', activo: true, creadoEn: now, actualizadoEn: now }));
  db.Integrantes.push(...integ);

  // Asistencia de ejemplo: 10 domingos de culto y escuela dominical, con algunos hermanos que dejaron de venir
  const visitas = ['Tomás Aguilar', 'Rebeca Pinto', 'Luis Carrasco'].map((nombre, k) => ({ id: id(), nombre, celular: '', notas: k === 0 ? 'Invitado por un hermano' : '', activo: true, creadoEn: now, actualizadoEn: now }));
  db.Visitas.push(...visitas);
  const activosM = db.Miembros.filter((m) => m.estado === 'activo');
  const noMiembros = db.Integrantes.filter((i) => !i.miembroId);
  const hoyD = new Date(now.slice(0, 10) + 'T12:00:00');
  hoyD.setDate(hoyD.getDate() - hoyD.getDay());
  const domingos = Array.from({ length: 10 }, (_, k) => { const d = new Date(hoyD); d.setDate(d.getDate() - 7 * (9 - k)); return d.toISOString().slice(0, 10); });
  const ausentes = new Set(activosM.slice(2, 5).map((m) => m.id)); // dejan de venir las últimas semanas
  domingos.forEach((f, k) => {
    ['Culto dominical', 'Escuela dominical'].forEach((act, j) => {
      const pres = [];
      activosM.forEach((m, n) => {
        if (ausentes.has(m.id) && k >= 6) return;
        const p = j === 0 ? (n % 7 === 0 ? 0.45 : 0.85) : (n % 3 === 0 ? 0.7 : 0.35);
        if (rand() < p) pres.push('m:' + m.id);
      });
      noMiembros.forEach((i) => { if (rand() < (j === 0 ? 0.6 : 0.4)) pres.push('i:' + i.id); });
      if (j === 0 && k >= 7) pres.push('v:' + visitas[0].id);
      if (j === 0 && k === 9) pres.push('v:' + visitas[1].id);
      db.Asistencias.push({ id: id(), fecha: f, actividad: act, notas: '', presentes: pres.join(','), creadoPor: '', creadoEn: now, actualizadoEn: now });
    });
  });
  // Jóvenes: 8 sábados de reunión; dos dejaron de venir las últimas semanas
  const jovActivos = integ.filter((x) => x.activo);
  const faltan = new Set(jovActivos.slice(3, 5).map((x) => x.id));
  domingos.slice(-8).forEach((dom, k) => {
    const d = new Date(dom + 'T12:00:00'); d.setDate(d.getDate() - 1);
    const pres = jovActivos.filter((x, n) => !(faltan.has(x.id) && k >= 5) && rand() < (n % 4 === 0 ? 0.5 : 0.85)).map((x) => x.id);
    db.AsistenciasMinisterios.push({ id: id(), ministerioId: jov.id, fecha: d.toISOString().slice(0, 10), actividad: 'Reunión de jóvenes', notas: '', presentes: pres.join(','), creadoPor: liderJov.id, creadoEn: now, actualizadoEn: now });
  });
  // Discipulados en hogares: dos grupos por sector, los jueves; uno con una visita
  [['Discipulado Norte', 'Norte', 'Jueves 19:30', 0], ['Discipulado Centro', 'Centro', 'Miércoles 20:00', 1]].forEach(([nombre, sector, dia, k]) => {
    const lid = activosM[k * 6];
    const g = { id: id(), nombre, sector, lideres: lid ? lid.id : '', encargado: lid?.nombre || '', dia, notas: '', activo: true, creadoEn: now, actualizadoEn: now };
    db.GruposHogar.push(g);
    // líder de discipulado del grupo Norte (usuario "discipulado")
    if (!k) {
      const salt = id();
      db.Usuarios.push({ id: id(), nombre: 'Héctor Díaz', usuario: 'discipulado', rol: 'discipulado', ministerioId: '', grupoId: g.id, email: '', activo: true, debeCambiarPass: false, salt, hash: TesoCore.hashPassword('demo', salt, sha256Hex), creadoEn: now });
    }
    const gente = activosM.slice(k * 6, k * 6 + 6).map((m) => ({ id: id(), grupoId: g.id, tipo: 'integrante', miembroId: m.id, nombre: '', celular: '', notas: '', activo: true, creadoEn: now, actualizadoEn: now }));
    gente.push({ id: id(), grupoId: g.id, tipo: 'integrante', miembroId: '', nombre: k ? 'Elena Fuentes' : 'Pablo Rivas', celular: '', notas: 'Vecino del sector', activo: true, creadoEn: now, actualizadoEn: now });
    if (!k) gente.push({ id: id(), grupoId: g.id, tipo: 'visita', miembroId: '', nombre: 'Javiera Ortiz', celular: '+56 9 5555 1234', notas: 'Invitada por una vecina', activo: true, creadoEn: now, actualizadoEn: now });
    db.PersonasHogar.push(...gente);
    domingos.slice(-6).forEach((dom, j) => {
      const d = new Date(dom + 'T12:00:00'); d.setDate(d.getDate() - (k ? 4 : 3));
      const pres = gente.filter((x, n) => (x.tipo === 'visita' ? j >= 4 : !(n === 2 && j >= 3) && rand() < 0.8)).map((x) => x.id);
      if (pres.length) db.AsistenciasHogar.push({ id: id(), grupoId: g.id, fecha: d.toISOString().slice(0, 10), actividad: 'Discipulado', notas: '', presentes: pres.join(','), creadoPor: '', creadoEn: now, actualizadoEn: now });
    });
  });
  const diaHoy = +today.slice(8, 10);
  const act = { id: id(), ministerioId: jov.id, nombre: 'Campamento de verano', fecha: `${TesoCore.nextMonth(curMonth)}-15`, cuota: 25000, descripcion: 'Tres días en Pucón', estado: 'abierta', creadoPor: liderJov.id, creadoEn: now, actualizadoEn: now };
  db.Actividades.push(act);
  integ.filter((x) => x.activo).slice(0, 8).forEach((x, k) => {
    const ins = { id: id(), actividadId: act.id, integranteId: x.id, pagoMonto: 0, fechaPago: '', movId: '', creadoEn: now, actualizadoEn: now };
    if (k < 5) {
      const f = dateIn(curMonth, Math.max(1, Math.min(diaHoy, 1 + k * 3)));
      const mv = { id: id(), ministerioId: jov.id, fecha: f, mes: curMonth, tipo: 'ingreso', categoria: TesoCore.CUOTA, descripcion: `Cuota ${act.nombre} · ${x.nombre}`, monto: act.cuota, archivoId: '', origen: 'cuota', refId: ins.id, creadoPor: liderJov.id, creadoEn: now, actualizadoEn: now, actividadId: act.id };
      db.MovimientosMinisterios.push(mv);
      Object.assign(ins, { pagoMonto: act.cuota, fechaPago: f, movId: mv.id });
    }
    db.Inscripciones.push(ins);
  });
  db.MovimientosMinisterios.push({ id: id(), ministerioId: jov.id, fecha: dateIn(curMonth, Math.max(1, diaHoy - 1)), mes: curMonth, tipo: 'gasto', categoria: 'Actividad / evento', descripcion: 'Reserva de cabañas', monto: 40000, archivoId: 'demo-40000-Reserva%20de%20caba%C3%B1as', origen: 'manual', refId: '', creadoPor: liderJov.id, creadoEn: now, actualizadoEn: now, actividadId: act.id });

  saveJSON(DB_KEY, db);
}
