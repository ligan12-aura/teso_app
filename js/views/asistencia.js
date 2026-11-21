// Control de asistencia: cultos dominicales, escuela dominical u otras actividades, discipulados en
// hogares y reuniones de los ministerios con listado (p. ej. Jóvenes).
// Se marca a los presentes y la app avisa quién lleva varias reuniones seguidas sin venir.
// El mismo control se usa dentro de un ministerio (p. ej. Jóvenes) con los integrantes de su listado.
import { icon, esc, modal, toast, confirmar, emptyState, fecha } from '../ui.js';
import { call } from '../api.js';

const BASE = ['Culto dominical', 'Escuela dominical'];
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const leer = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
const VENTANA = 8; // reuniones recientes para medir regularidad
const vistas = {}; // estado de pantalla por ámbito (general, cada grupo o cada ministerio)
const vistaDe = (clave, base) => (vistas[clave] ||= { actividad: leer(clave + '_actividad', base[0]), umbral: +leer('asist_umbral', 3) || 3, filtro: 'todos' });
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// último domingo (hoy si es domingo)
const ultimoDomingo = (hoy) => { const d = new Date(hoy + 'T12:00:00'); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10); };
// el último día de hoy hacia atrás que cae en el mismo día de la semana que la última reunión (o hoy)
const mismoDiaQueUltima = (hoy, sesiones) => {
  const ult = sesiones[sesiones.length - 1];
  if (!ult) return hoy;
  const d = new Date(hoy + 'T12:00:00');
  const dia = new Date(ult.fecha + 'T12:00:00').getDay();
  d.setDate(d.getDate() - ((d.getDay() - dia + 7) % 7));
  return d.toISOString().slice(0, 10);
};
// el día de la semana del grupo (si se indicó) o el de su última reunión
const diaDelGrupo = (g) => (hoy, sesiones) => {
  const k = DIAS.findIndex((d) => norm(g.dia).startsWith(norm(d)));
  if (k < 0) return mismoDiaQueUltima(hoy, sesiones);
  const objetivo = (k + 1) % 7; // getDay: domingo = 0
  const d = new Date(hoy + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() - objetivo + 7) % 7));
  return d.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------
// Ámbitos: general (cultos), un grupo de discipulado y un ministerio
// ---------------------------------------------------------------
function ambitoGeneral(data) {
  const TIPO = { miembro: 'Miembro', integrante: 'Ministerio', visita: 'Visita' };
  return {
    clave: 'asist',
    sesiones: data.asistencias,
    personas: data.personasAsistencia,
    base: BASE,
    acciones: { save: 'saveAsistencia', del: 'deleteAsistencia' },
    extra: {},
    visitas: true,
    nuevoLbl: 'visita',
    grupos: [['miembro', 'Miembros'], ['integrante', 'Ministerios'], ['visita', 'Visitas']],
    filtroTipos: [['miembro', 'Miembros'], ['integrante', 'De ministerios (no miembros)'], ['visita', 'Visitas']],
    etiqueta: (p) => (p.tipo === 'integrante' && p.ministerios.length ? p.ministerios.join(', ') : TIPO[p.tipo]),
    fechaPropuesta: (hoy) => ultimoDomingo(hoy),
    textoLista: 'en la lista',
    vacio: 'Carga a los hermanos en Miembros para llevar la asistencia.',
    notasEj: 'Ej.: culto de Santa Cena, día de lluvia',
    otraEj: 'Ej.: Reunión de oración, Vigilia, Campamento',
    async agregarRapido(ctx, nombre, f) {
      const v = await call('saveVisita', { nombre, fecha: f });
      const p = { id: 'v:' + v.id, tipo: 'visita', nombre: v.nombre, activo: true, desde: f, celular: '', ministerios: [] };
      ctx.data.personasAsistencia.push(p);
      return p;
    },
    editarVisita: (ctx, p, total) => editarVisita(ctx, p ? { id: p.id.slice(2), nombre: p.nombre, celular: p.celular, notas: p.notas, activo: p.activo, total } : null)
  };
}

export function ambitoMinisterio(data, m, etiquetaLista = 'Integrantes') {
  const jov = /j[oó]ven/i.test(m.nombre);
  const integ = data.integrantesAsistencia || data.integrantes || [];
  const personas = integ.filter((i) => i.ministerioId === m.id).map((i) => ({
    id: i.id, tipo: i.esMiembro ? 'miembro' : 'integrante', nombre: i.nombre, activo: !!i.activo,
    desde: String(i.creadoEn || '').slice(0, 10), celular: i.celular || ''
  }));
  return {
    clave: 'asist_min_' + m.id,
    sesiones: (data.asistenciasMin || []).filter((s) => s.ministerioId === m.id),
    personas,
    base: [jov ? 'Reunión de jóvenes' : 'Reunión del ministerio'],
    acciones: { save: 'saveAsistenciaMinisterio', del: 'deleteAsistenciaMinisterio' },
    extra: { ministerioId: m.id },
    visitas: false,
    nuevoLbl: jov ? 'joven' : 'integrante',
    notaNuevo: 'Quien agregues aquí queda en el listado del ministerio como no miembro.',
    grupos: [['miembro', 'Miembros'], ['integrante', 'No miembros']],
    filtroTipos: [['miembro', 'Miembros de la iglesia'], ['integrante', 'No miembros']],
    etiqueta: (p) => (p.tipo === 'miembro' ? 'Miembro' : 'No miembro'),
    fechaPropuesta: (hoy, sesiones) => mismoDiaQueUltima(hoy, sesiones),
    textoLista: `en el listado de ${etiquetaLista.toLowerCase()}`,
    vacio: `Agrega ${etiquetaLista.toLowerCase()} al listado para llevar la asistencia.`,
    notasEj: 'Ej.: tema de la reunión, salida, día de lluvia',
    otraEj: 'Ej.: Vigilia, Campamento, Retiro',
    async agregarRapido(ctx, nombre, f) {
      const it = await call('saveIntegrante', { ministerioId: m.id, nombre, miembroId: '' });
      (ctx.data.integrantes ||= []).push({ ...it, esMiembro: false });
      return { id: it.id, tipo: 'integrante', nombre: it.nombre, activo: true, desde: f, celular: '' };
    }
  };
}

const tipoHogar = (x) => (x.tipo === 'visita' ? 'visita' : x.esMiembro ? 'miembro' : 'integrante');
function ambitoHogar(data, g) {
  const personas = (data.personasHogar || []).filter((x) => x.grupoId === g.id).map((x) => ({
    id: x.id, tipo: tipoHogar(x), nombre: x.nombre, activo: !!x.activo, desde: String(x.creadoEn || '').slice(0, 10),
    celular: x.celular || '', notas: x.notas || '', miembroId: x.miembroId || ''
  }));
  return {
    clave: 'asist_hogar_' + g.id,
    sesiones: (data.asistenciasHogar || []).filter((s) => s.grupoId === g.id),
    personas,
    base: ['Discipulado'],
    acciones: { save: 'saveAsistenciaHogar', del: 'deleteAsistenciaHogar' },
    extra: { grupoId: g.id },
    visitas: true,
    nuevoLbl: 'visita',
    notaNuevo: 'Quien agregues aquí queda como visita del grupo; tócala después en “Personas del grupo” para anotar su contacto.',
    grupos: [['miembro', 'Miembros'], ['integrante', 'No miembros'], ['visita', 'Visitas']],
    filtroTipos: [['miembro', 'Miembros'], ['integrante', 'No miembros'], ['visita', 'Visitas']],
    etiqueta: (p) => ({ miembro: 'Miembro', integrante: 'No miembro', visita: 'Visita' }[p.tipo]),
    fechaPropuesta: diaDelGrupo(g),
    textoLista: 'en el grupo',
    vacio: 'Agrega a las personas del grupo (miembros o no miembros) en “Personas del grupo”.',
    notasEj: 'Ej.: tema estudiado, casa donde se reunieron',
    otraEj: 'Ej.: Reunión especial, Convivencia',
    async agregarRapido(ctx, nombre, f) {
      const r = await call('savePersonaHogar', { grupoId: g.id, tipo: 'visita', nombre, fecha: f });
      (ctx.data.personasHogar ||= []).push(r);
      return { id: r.id, tipo: 'visita', nombre: r.nombre, activo: true, desde: f, celular: '' };
    },
    editarVisita: (ctx, p) => editarPersonaHogar(ctx, g, p ? ctx.data.personasHogar.find((x) => x.id === p.id) : null, 'visita')
  };
}

function actividadesDe(cfg) {
  const v = new Map(cfg.base.map((a) => [norm(a), a]));
  cfg.sesiones.forEach((s) => { if (!v.has(norm(s.actividad))) v.set(norm(s.actividad), s.actividad); });
  return [...v.values()];
}

// id → id de la persona (el "i:" de un integrante que luego se hizo miembro cuenta como el miembro)
const canonDe = (cfg) => {
  const c = {};
  cfg.personas.forEach((p) => { c[p.id] = p.id; (p.alias || []).forEach((a) => { c[a] = p.id; }); });
  return c;
};
const presentesDe = (s, canon) => new Set(String(s.presentes || '').split(',').filter(Boolean).map((id) => canon[id] || id));

// Regularidad de cada persona en una actividad
function analizar(cfg, actividad) {
  const canon = canonDe(cfg);
  const sesiones = cfg.sesiones.filter((s) => norm(s.actividad) === norm(actividad)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pres = sesiones.map((s) => presentesDe(s, canon));
  const personas = cfg.personas.map((p) => {
    const idx = sesiones.map((_, i) => i);
    // cuenta desde que es miembro / está en el listado; una visita, desde la primera vez que vino
    // (si vino antes de esa fecha, cuenta desde la primera vez que vino)
    const primera = pres.findIndex((s) => s.has(p.id));
    let desde = p.desde || '';
    if (p.tipo === 'visita') desde = primera >= 0 ? sesiones[primera].fecha : '9999';
    else if (desde && primera >= 0 && sesiones[primera].fecha < desde) desde = sesiones[primera].fecha;
    const elig = idx.filter((i) => !desde || sesiones[i].fecha >= desde);
    const vino = elig.filter((i) => pres[i].has(p.id));
    let racha = 0;
    for (let k = elig.length - 1; k >= 0 && !pres[elig[k]].has(p.id); k--) racha++;
    const recientes = elig.slice(-VENTANA);
    const vinoRec = recientes.filter((i) => pres[i].has(p.id)).length;
    const pct = recientes.length ? vinoRec / recientes.length : 0;
    const ultima = vino.length ? sesiones[vino[vino.length - 1]].fecha : '';
    const estado = recientes.length < 3 ? 'nuevo' : pct >= 0.75 ? 'regular' : 'irregular';
    return { ...p, racha, pct, vinoRec, recientes: recientes.length, total: vino.length, ultima, estado };
  });
  return { sesiones, pres, personas };
}

// ---------------------------------------------------------------
// Página Asistencia: Cultos · Discipulados · un apartado por ministerio con reuniones
// ---------------------------------------------------------------
export function render(root, ctx) {
  const { data } = ctx;
  // Líder de discipulado: solo su grupo, sin las demás secciones
  if (ctx.user?.rol === 'discipulado') {
    const cab = (titulo, extra = '') => (acciones) => `
  <section class="page-head">
    <div><span class="eyebrow">Discipulado</span><h1>Mi grupo</h1></div>
    <div class="head-actions">${acciones}</div>
  </section>${extra}`;
    return renderHogar(root, ctx, (data.gruposHogar || [])[0]?.id, cab, () => render(root, ctx), true);
  }
  const mins = data.ministeriosAsistencia || [];
  const [sec, sub] = ctx.params || [];
  const seccion = sec === 'discipulados' ? 'hogar' : sec === 'min' && mins.some((m) => m.id === sub) ? 'min' : 'cultos';
  const tabs = [['', 'Cultos', 'church'], ['discipulados', 'Discipulados', 'users'], ...mins.map((m) => [`min/${m.id}`, `${m.icono || ''} ${m.nombre}`, ''])];
  const activo = seccion === 'cultos' ? '' : seccion === 'hogar' ? 'discipulados' : `min/${sub}`;
  const nav = `<nav class="min-tabs asist-secciones" aria-label="Secciones de asistencia">${tabs.map(([k, l, ic]) => `<a href="#/asistencia${k ? '/' + k : ''}" class="${activo === k ? 'active' : ''}">${ic ? icon(ic, 16) + ' ' : ''}${esc(l.trim())}</a>`).join('')}</nav>`;
  const cabecera = (titulo, extra = '') => (acciones) => `
  <section class="page-head">
    <div><span class="eyebrow">Iglesia</span><h1>${titulo}</h1></div>
    <div class="head-actions">${acciones}</div>
  </section>
  ${nav}${extra}`;
  const redibujar = () => render(root, ctx);
  if (seccion === 'hogar') return renderHogar(root, ctx, sub, cabecera, redibujar);
  if (seccion === 'min') {
    const m = mins.find((x) => x.id === sub);
    const cfg = ambitoMinisterio(data, m, /j[oó]ven/i.test(m.nombre) ? 'Jóvenes' : 'Integrantes');
    // la secretaría solo ve; el líder la toma dentro de su ministerio
    if (ctx.user.rol === 'secretaria') cfg.soloLectura = true;
    return renderAmbito(root, ctx, cfg, cabecera('Asistencia', `<p class="muted small asist-ayuda">${icon('users', 13)} La asistencia de ${esc(m.nombre)} la toma su líder dentro del ministerio.${cfg.soloLectura ? ' Aquí puedes revisarla.' : ''}</p>`), redibujar);
  }
  renderAmbito(root, ctx, ambitoGeneral(data), cabecera('Asistencia'), redibujar);
}

// Pestaña Asistencia de un ministerio. cabecera(acciones) devuelve el encabezado con las pestañas del ministerio.
export function renderMinisterio(root, ctx, m, cabecera, etiquetaLista) {
  renderAmbito(root, ctx, ambitoMinisterio(ctx.data, m, etiquetaLista), cabecera, () => renderMinisterio(root, ctx, m, cabecera, etiquetaLista));
}

function renderAmbito(root, ctx, cfg, cabecera, redibujar) {
  const vista = vistaDe(cfg.clave, cfg.base);
  const actividades = actividadesDe(cfg);
  if (!actividades.some((a) => norm(a) === norm(vista.actividad))) vista.actividad = actividades[0];
  const { sesiones, pres, personas } = analizar(cfg, vista.actividad);
  const ro = !!cfg.soloLectura;
  // en la lista: activos (miembros e integrantes) y visitas que ya vinieron a esta actividad
  const lista = personas.filter((p) => (p.tipo === 'visita' ? p.activo || p.total > 0 : p.activo)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const alertas = lista.filter((p) => p.tipo !== 'visita' && sesiones.length && p.racha >= vista.umbral)
    .sort((a, b) => b.racha - a.racha || a.nombre.localeCompare(b.nombre, 'es'));
  const ult = sesiones[sesiones.length - 1];
  const recientes = sesiones.slice(-VENTANA);
  const promedio = recientes.length ? Math.round(recientes.reduce((a, s, i) => a + pres[sesiones.length - recientes.length + i].size, 0) / recientes.length) : 0;
  const tipoDe = {};
  cfg.personas.forEach((p) => { tipoDe[p.id] = p.tipo; });
  const cuenta = (i) => { const c = {}; pres[i].forEach((id) => { const t = tipoDe[id]; if (t) c[t] = (c[t] || 0) + 1; }); return c; };
  const regulares = lista.filter((p) => p.tipo !== 'visita' && p.estado === 'regular').length;
  const irregulares = lista.filter((p) => p.tipo !== 'visita' && p.estado === 'irregular').length;
  const filtrosPersona = [['todos', 'Todos'], ['regular', 'Regulares'], ['irregular', 'Irregulares'], ...(cfg.visitas ? [['visita', 'Visitas']] : [])];
  if (!filtrosPersona.some(([k]) => k === vista.filtro)) vista.filtro = 'todos';
  const ultCol = cfg.grupos.length - 1;
  const colCls = (k) => (k < ultCol || !cfg.visitas ? ' hide-sm' : '');

  root.innerHTML = `
  ${cabecera(ro ? '' : `${cfg.visitas && cfg.editarVisita ? `<button class="btn btn-ghost" data-visita>${icon('user', 16)} Agregar visita</button>` : ''}
      <button class="btn btn-primary" data-tomar>${icon('check', 16)} Tomar asistencia</button>`)}

  ${actividades.length > 1 ? `<div class="tabs asist-tabs">${actividades.map((a) => `<button class="tab ${norm(a) === norm(vista.actividad) ? 'active' : ''}" data-act="${esc(a)}">${esc(a)}</button>`).join('')}</div>` : ''}

  <section class="kpis kpis-4">
    <article class="kpi"><span class="kpi-label">${icon('calendar', 15)} Última reunión</span><strong class="kpi-value">${ult ? pres[sesiones.length - 1].size : '—'}</strong><span class="kpi-sub">${ult ? `presentes el ${fecha(ult.fecha)}` : 'aún no se registra asistencia'}</span></article>
    <article class="kpi"><span class="kpi-label">${icon('users', 15)} Promedio</span><strong class="kpi-value">${recientes.length ? promedio : '—'}</strong><span class="kpi-sub">presentes por reunión (últimas ${recientes.length || VENTANA})</span></article>
    <article class="kpi"><span class="kpi-label">${icon('checkCircle', 15)} Regulares / irregulares</span><strong class="kpi-value">${regulares} <small class="kpi-pct">/ ${irregulares}</small></strong><span class="kpi-sub">regular = vino a 3 de cada 4 reuniones o más</span></article>
    <article class="kpi"><span class="kpi-label">${icon('alert', 15)} Requieren atención</span><strong class="kpi-value">${alertas.length}</strong><span class="kpi-sub">${vista.umbral} o más reuniones seguidas sin venir</span></article>
  </section>

  <div class="grid-1-1">
    <article class="card">
      <header class="card-head wrap"><div><h3>${icon('alert', 16)} Faltaron ${vista.umbral} o más veces seguidas</h3><p class="muted">${esc(vista.actividad)} · para llamarlos o visitarlos</p></div>
        <label class="field asist-umbral"><span>Avisar desde</span><select data-umbral>${[2, 3, 4, 5, 6, 8].map((n) => `<option value="${n}" ${n === vista.umbral ? 'selected' : ''}>${n} faltas seguidas</option>`).join('')}</select></label></header>
      ${!sesiones.length ? emptyState('Cuando registres la asistencia de algunas reuniones, aquí aparecerán quienes llevan varias faltas seguidas.', 'calendar')
        : alertas.length ? `<ul class="asist-alertas">${alertas.map((p) => `<li>
          <div><b>${esc(p.nombre)}</b><small class="muted">${esc(cfg.etiqueta(p))}${p.ultima ? ` · vino por última vez el ${fecha(p.ultima)}` : ' · no ha venido desde que se lleva el registro'}${p.celular ? ` · ${esc(p.celular)}` : ''}</small></div>
          <span class="chip-warn">${p.racha} seguidas</span></li>`).join('')}</ul>`
        : `<div class="note">${icon('checkCircle', 16)}<span>Nadie lleva ${vista.umbral} reuniones seguidas sin venir. 🙌</span></div>`}
    </article>
    <article class="card">
      <header class="card-head"><div><h3>Reuniones registradas</h3><p class="muted">${esc(vista.actividad)} · ${ro ? 'toca una para ver quiénes vinieron' : 'toca una para corregirla'}</p></div></header>
      ${sesiones.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Fecha</th><th class="num">Presentes</th>${cfg.grupos.map(([, l], k) => `<th class="num${colCls(k)}">${l}</th>`).join('')}${ro ? '' : '<th></th>'}</tr></thead>
        <tbody>${sesiones.map((s, i) => [s, i]).reverse().slice(0, 15).map(([s, i]) => { const c = cuenta(i); return `<tr class="asist-fila" data-sesion="${s.id}" tabindex="0" title="${ro ? 'Ver quiénes vinieron' : 'Corregir esta reunión'}">
          <td class="nowrap"><b>${fecha(s.fecha)}</b>${s.notas ? `<br><small class="muted">${esc(s.notas)}</small>` : ''}</td>
          <td class="num strong">${pres[i].size}</td>${cfg.grupos.map(([t], k) => `<td class="num${colCls(k)}">${c[t] || 0}</td>`).join('')}
          ${ro ? '' : `<td class="row-actions"><button class="icon-btn sm" data-editar-sesion title="Corregir (fecha, presentes…)">${icon('edit', 15)}</button><button class="icon-btn sm" data-borrar="${s.id}" title="Eliminar">${icon('trash', 15)}</button></td>`}</tr>`; }).join('')}</tbody>
      </table></div>${sesiones.length > 15 ? `<p class="muted small">Se muestran las últimas 15 de ${sesiones.length}.</p>` : ''}`
        : emptyState(`Aún no hay reuniones de ${esc(vista.actividad)}.${ro ? '' : ' Presiona “Tomar asistencia”.'}`, 'calendar')}
    </article>
  </div>

  <article class="card">
    <header class="card-head wrap"><div><h3>Asistencia por persona</h3><p class="muted">${esc(vista.actividad)} · en las últimas ${VENTANA} reuniones (o desde que está ${esc(cfg.textoLista)})</p></div></header>
    <div class="filters">
      <div class="search">${icon('search', 16)}<input type="search" placeholder="Buscar…" data-q></div>
      <div class="seg seg-sm">${filtrosPersona.map(([k, l]) => `<label><input type="radio" name="fasist" value="${k}" ${vista.filtro === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
    </div>
    ${lista.length ? `<div class="table-wrap"><table class="table asist-tabla">
      <thead><tr><th>Nombre</th><th class="hide-sm">Grupo</th><th class="num">Vino</th><th class="num">Faltas seguidas</th><th class="hide-sm">Última vez</th><th>Estado</th></tr></thead>
      <tbody>${lista.map((p) => { const editable = p.tipo === 'visita' && cfg.editarVisita && !ro; return `<tr data-nombre="${esc(norm(p.nombre))}" data-grupo="${p.tipo === 'visita' ? 'visita' : p.estado}"${editable ? ` class="asist-fila" data-visita-id="${esc(p.id)}" tabindex="0" title="Editar visita"` : ''}>
        <td><b>${esc(p.nombre)}</b>${editable ? ` ${icon('edit', 13)}` : ''}${p.tipo === 'visita' && !p.activo ? ' <small class="muted">(inactiva)</small>' : ''}${p.tipo === 'visita' && p.celular ? `<br><small class="muted">${esc(p.celular)}</small>` : ''}</td>
        <td class="hide-sm"><small class="muted">${esc(cfg.etiqueta(p))}</small></td>
        <td class="num">${p.recientes ? `${p.vinoRec}/${p.recientes}` : '—'}</td>
        <td class="num">${p.recientes ? (p.racha >= vista.umbral && p.tipo !== 'visita' ? `<span class="chip-warn">${p.racha}</span>` : p.racha) : '—'}</td>
        <td class="nowrap hide-sm">${p.ultima ? fecha(p.ultima) : '<span class="muted">—</span>'}</td>
        <td>${p.tipo === 'visita' ? `<span class="badge st-open">Visita · ${p.total ? `${p.total} ${p.total === 1 ? 'vez' : 'veces'}` : 'aún no viene'}</span>` : p.estado === 'nuevo' ? '<span class="badge st-open">Pocos datos</span>' : p.estado === 'regular' ? '<span class="badge st-ok">Regular</span>' : '<span class="badge st-obs">Irregular</span>'}</td></tr>`; }).join('')}</tbody>
    </table></div>` : emptyState(cfg.vacio, 'users')}
  </article>`;

  root.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => { vista.actividad = b.dataset.act; guardar(cfg.clave + '_actividad', vista.actividad); redibujar(); }));
  root.querySelector('[data-umbral]')?.addEventListener('change', (e) => { vista.umbral = +e.target.value; guardar('asist_umbral', String(vista.umbral)); redibujar(); });
  root.querySelector('[data-tomar]')?.addEventListener('click', () => tomarAsistencia(ctx, cfg, vista));
  root.querySelector('[data-visita]')?.addEventListener('click', () => cfg.editarVisita(ctx, null));
  // Las filas que se abren responden a Enter y Espacio como un botón
  root.querySelectorAll('.asist-fila').forEach((tr) => tr.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === tr) { e.preventDefault(); tr.click(); }
  }));
  root.querySelectorAll('[data-sesion]').forEach((tr) => tr.addEventListener('click', (e) => {
    if (e.target.closest('[data-borrar]')) return;
    const s = cfg.sesiones.find((x) => x.id === tr.dataset.sesion);
    if (ro) verSesion(cfg, s); else tomarAsistencia(ctx, cfg, vista, s);
  }));
  root.querySelectorAll('[data-visita-id]').forEach((tr) => tr.addEventListener('click', () => {
    const p = cfg.personas.find((x) => x.id === tr.dataset.visitaId);
    if (p) cfg.editarVisita(ctx, p, personas.find((x) => x.id === p.id)?.total || 0);
  }));
  root.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
    const s = cfg.sesiones.find((x) => x.id === b.dataset.borrar);
    if (!(await confirmar(`¿Eliminar la asistencia de ${esc(s.actividad)} del ${fecha(s.fecha)}?`, { boton: 'Eliminar', danger: true }))) return;
    try { await call(cfg.acciones.del, { id: s.id }); toast('Asistencia eliminada'); await ctx.refresh(); } catch (er) { toast(er.message, 'err'); }
  }));
  // filtros sin volver a dibujar (no se pierde el foco de la búsqueda)
  const filtrar = () => {
    const q = norm(root.querySelector('[data-q]').value);
    root.querySelectorAll('.asist-tabla tbody tr').forEach((tr) => {
      const g = tr.dataset.grupo;
      const okF = vista.filtro === 'todos' || (vista.filtro === 'visita' ? g === 'visita' : g === vista.filtro);
      tr.hidden = !okF || (q && !tr.dataset.nombre.includes(q));
    });
  };
  root.querySelector('[data-q]').addEventListener('input', filtrar);
  root.querySelectorAll('[name=fasist]').forEach((r) => r.addEventListener('change', () => { vista.filtro = r.value; filtrar(); }));
  filtrar();
}

// Solo lectura: quiénes vinieron a una reunión
function verSesion(cfg, s) {
  const canon = canonDe(cfg);
  const pres = presentesDe(s, canon);
  const nombres = cfg.personas.filter((p) => pres.has(p.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const otros = pres.size - nombres.length;
  return modal({
    title: `${esc(s.actividad)} · ${fecha(s.fecha)}`,
    hideFooter: true,
    body: `<p class="muted">${pres.size} presente${pres.size === 1 ? '' : 's'}${s.notas ? ` · ${esc(s.notas)}` : ''}</p>
      <ul class="pick-list">${nombres.map((p) => `<li>${esc(p.nombre)} <small class="muted">· ${esc(cfg.etiqueta(p))}</small></li>`).join('')}${otros ? `<li class="muted">${otros} persona(s) que ya no están en el listado</li>` : ''}</ul>`
  });
}

// Pasar lista: fecha, actividad y presentes (con buscador y alta rápida de visitas o de integrantes)
function tomarAsistencia(ctx, cfg, vista, sesion = null) {
  const { data } = ctx;
  const actividades = actividadesDe(cfg);
  const canon = canonDe(cfg);
  const buscar = (f, act) => cfg.sesiones.find((s) => s.fecha === f && norm(s.actividad) === norm(act));
  const deActividad = (act) => cfg.sesiones.filter((s) => norm(s.actividad) === norm(act)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const propuesta = cfg.fechaPropuesta(data.hoy, deActividad(vista.actividad));
  // corregir una reunión elegida en la lista: se puede cambiar su fecha y actividad (se mueve esa misma reunión)
  const editar = !!sesion;
  // al abrir "Tomar asistencia": si ya existe la reunión de la fecha propuesta, se corrige esa
  if (!sesion) sesion = buscar(propuesta, vista.actividad) || null;
  const marcados = sesion ? presentesDe(sesion, canon) : new Set();
  // personas disponibles: activos + visitas activas + quien ya estaba marcado en esta reunión
  let personas = cfg.personas.filter((p) => p.activo || marcados.has(p.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  if (!personas.length && !cfg.visitas) return toast(cfg.vacio, 'err');
  const actInicial = sesion?.actividad || vista.actividad;
  const fila = (p) => `<li data-nombre="${esc(norm(p.nombre))}" data-tipo="${p.tipo}"><label class="check"><input type="checkbox" name="p" value="${esc(p.id)}" ${marcados.has(p.id) ? 'checked' : ''}> ${esc(p.nombre)} <small class="muted">· ${esc(cfg.etiqueta(p))}</small></label></li>`;
  return modal({
    title: editar ? `Corregir asistencia · ${esc(sesion.actividad)} del ${fecha(sesion.fecha)}` : 'Asistencia',
    wide: true,
    body: `
      <div class="form-row">
        <label class="field"><span>Fecha</span><input type="date" name="fecha" value="${esc(sesion?.fecha || propuesta)}" max="${data.hoy}" required></label>
        <label class="field"><span>Actividad</span><select name="actividad">${actividades.map((a) => `<option ${norm(a) === norm(actInicial) ? 'selected' : ''}>${esc(a)}</option>`).join('')}<option value="__otra">Otra actividad…</option></select></label>
      </div>
      ${editar ? `<div class="note">${icon('edit', 16)}<span>Estás corrigiendo esta reunión: puedes cambiar la <b>fecha</b>, la actividad, los presentes o las notas. Se guarda sobre la misma reunión.</span></div>
      <div class="note warn" data-choque hidden>${icon('alert', 16)}<span data-choque-txt></span></div>`
      : `<div class="note" data-existente ${sesion ? '' : 'hidden'}>${icon('edit', 16)}<span>Esta reunión ya estaba registrada: estás corrigiéndola.</span></div>`}
      <label class="field" data-otra hidden><span>Nombre de la actividad</span><input name="otra" maxlength="60" placeholder="${esc(cfg.otraEj)}"></label>
      <div class="pick-tools">
        <div class="search">${icon('search', 16)}<input type="search" placeholder="Buscar nombre…" data-buscar></div>
        <select data-tipo><option value="">Todos</option>${cfg.filtroTipos.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
        <button type="button" class="link-btn" data-todos>Marcar visibles</button>
        <button type="button" class="link-btn" data-solo-marcados>Ver marcados</button>
      </div>
      <ul class="pick-list" data-lista>${personas.map(fila).join('')}</ul>
      <div class="asist-nueva"><input name="nuevaVisita" placeholder="¿Vino alguien nuevo? Escribe su nombre" maxlength="80"><button type="button" class="btn btn-ghost btn-sm" data-add-visita>${icon('plus', 15)} Agregar ${cfg.nuevoLbl}</button></div>
      ${cfg.notaNuevo ? `<p class="muted small">${esc(cfg.notaNuevo)}</p>` : ''}
      <label class="field"><span>Notas <small class="muted">(opcional)</small></span><input name="notas" maxlength="300" value="${esc(sesion?.notas || '')}" placeholder="${esc(cfg.notasEj)}"></label>
      <p class="muted small" data-cuenta></p>
      ${editar ? `<p><button type="button" class="link-btn danger-link" data-eliminar-sesion>${icon('trash', 14)} Eliminar esta reunión</button></p>` : ''}`,
    submitLabel: editar ? 'Guardar cambios' : 'Guardar asistencia',
    onOpen(f, { close } = {}) {
      const contar = () => {
        const c = [...f.querySelectorAll('[name=p]')].filter((x) => x.checked);
        const tipo = Object.fromEntries(personas.map((p) => [p.id, p.tipo]));
        const v = c.filter((x) => tipo[x.value] === 'visita').length;
        f.querySelector('[data-cuenta]').textContent = `${c.length} presente${c.length === 1 ? '' : 's'}${cfg.visitas && v ? ` (${v} visita${v === 1 ? '' : 's'})` : ''}`;
      };
      let soloMarcados = false;
      const filtrar = () => {
        const q = norm(f.querySelector('[data-buscar]').value);
        const t = f.querySelector('[data-tipo]').value;
        f.querySelectorAll('[data-lista] li').forEach((li) => {
          const chk = li.querySelector('input').checked;
          li.hidden = (q && !li.dataset.nombre.includes(q)) || (t && li.dataset.tipo !== t) || (soloMarcados && !chk);
        });
      };
      const conectar = (root) => root.querySelectorAll('[name=p]').forEach((c) => c.addEventListener('change', contar));
      conectar(f); contar();
      f.querySelector('[data-buscar]').addEventListener('input', filtrar);
      f.querySelector('[data-tipo]').addEventListener('change', filtrar);
      f.querySelector('[data-todos]').addEventListener('click', () => { f.querySelectorAll('[data-lista] li').forEach((li) => { if (!li.hidden) li.querySelector('input').checked = true; }); contar(); });
      f.querySelector('[data-solo-marcados]').addEventListener('click', (e) => { soloMarcados = !soloMarcados; e.currentTarget.textContent = soloMarcados ? 'Ver todos' : 'Ver marcados'; filtrar(); });
      const otra = f.querySelector('[data-otra]');
      const actividadElegida = () => (f.actividad.value === '__otra' ? f.otra.value.trim() : f.actividad.value);
      // si cambian la fecha o la actividad a una reunión ya registrada, se carga para corregirla
      const revisarExistente = () => {
        const ex = actividadElegida() ? buscar(f.fecha.value, actividadElegida()) : null;
        if (editar) {
          // corrigiendo: no se cambia de reunión; solo se avisa si la nueva fecha ya tiene otra
          const choque = ex && ex.id !== sesion.id;
          f.querySelector('[data-choque]').hidden = !choque;
          if (choque) f.querySelector('[data-choque-txt]').textContent = `Ya hay otra reunión de ${ex.actividad} el ${fecha(ex.fecha)}. Elige otra fecha, o si esta sobra, elimínala.`;
          return;
        }
        if (ex && ex !== sesion) {
          sesion = ex;
          const m = presentesDe(ex, canon);
          f.querySelectorAll('[name=p]').forEach((c) => { c.checked = m.has(c.value); });
          f.notas.value = ex.notas || '';
          contar();
        } else if (!ex && sesion) sesion = null;
        f.querySelector('[data-existente]').hidden = !sesion;
      };
      f.actividad.addEventListener('change', () => { otra.hidden = f.actividad.value !== '__otra'; if (!otra.hidden) f.otra.focus(); revisarExistente(); });
      f.fecha.addEventListener('change', revisarExistente);
      f.otra.addEventListener('change', revisarExistente);
      f.querySelector('[data-eliminar-sesion]')?.addEventListener('click', async () => {
        close?.(null);
        if (!(await confirmar(`¿Eliminar la asistencia de ${esc(sesion.actividad)} del ${fecha(sesion.fecha)}?`, { boton: 'Eliminar', danger: true }))) return;
        try { await call(cfg.acciones.del, { id: sesion.id }); toast('Asistencia eliminada'); await ctx.refresh(); } catch (er) { toast(er.message, 'err'); }
      });
      // alta rápida (visita o integrante según el ámbito): queda guardado y marcado
      const agregar = async () => {
        const nombre = f.nuevaVisita.value.trim();
        if (!nombre) return f.nuevaVisita.focus();
        const ya = personas.find((p) => norm(p.nombre) === norm(nombre));
        if (ya) {
          const c = f.querySelector(`[name=p][value="${CSS.escape(ya.id)}"]`);
          if (c) { c.checked = true; contar(); }
          f.nuevaVisita.value = ''; toast(`${ya.nombre} ya estaba en la lista: quedó marcado`); return;
        }
        const btn = f.querySelector('[data-add-visita]'); btn.disabled = true;
        try {
          const p = await cfg.agregarRapido(ctx, nombre, f.fecha.value);
          personas = [...personas, p];
          cfg.personas.push(p);
          const lista = f.querySelector('[data-lista]');
          lista.insertAdjacentHTML('afterbegin', fila(p));
          const c = lista.querySelector(`[value="${CSS.escape(p.id)}"]`); c.checked = true; c.addEventListener('change', contar);
          f.nuevaVisita.value = ''; contar();
        } catch (er) { toast(er.message, 'err'); } finally { btn.disabled = false; }
      };
      f.querySelector('[data-add-visita]').addEventListener('click', agregar);
      f.nuevaVisita.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
      f._agregar = agregar;
    },
    async onSubmit(f) {
      const actividad = f.actividad.value === '__otra' ? f.otra.value.trim() : f.actividad.value;
      if (!actividad) throw new Error('Escribe el nombre de la actividad');
      // un nombre escrito en "¿Vino alguien nuevo?" sin presionar Agregar: se agrega y queda marcado
      if (f.nuevaVisita.value.trim()) {
        await f._agregar();
        if (f.nuevaVisita.value.trim()) throw new Error(`No se pudo agregar a ${f.nuevaVisita.value.trim()}: revisa el nombre o bórralo`);
      }
      const presentes = [...f.querySelectorAll('[name=p]')].filter((x) => x.checked).map((x) => x.value);
      if (!presentes.length) throw new Error('Marca al menos a una persona presente');
      await call(cfg.acciones.save, { ...cfg.extra, id: sesion?.id, fecha: f.fecha.value, actividad, notas: f.notas.value, presentes });
      vista.actividad = actividad; guardar(cfg.clave + '_actividad', actividad);
      toast(`Asistencia guardada · ${presentes.length} presente${presentes.length === 1 ? '' : 's'}`);
      await ctx.refresh();
    }
  });
}

function editarVisita(ctx, v = null) {
  return modal({
    title: v ? 'Editar visita' : 'Agregar visita',
    body: `
      <p class="muted small">Personas que asisten pero no son miembros ni están en un ministerio. Quedan en la lista para tomar asistencia.</p>
      <label class="field"><span>Nombre</span><input name="nombre" required maxlength="80" value="${esc(v?.nombre || '')}"></label>
      <label class="field"><span>Celular <small class="muted">(opcional)</small></span><input name="celular" inputmode="tel" maxlength="30" value="${esc(v?.celular || '')}" placeholder="+56 9 1234 5678"></label>
      <label class="field"><span>Notas <small class="muted">(opcional)</small></span><input name="notas" maxlength="300" value="${esc(v?.notas || '')}" placeholder="Ej.: invitado por la familia…"></label>
      ${v ? `<label class="check"><input type="checkbox" name="activo" ${v.activo ? 'checked' : ''}> Activa (aparece en la lista para tomar asistencia)</label>
      ${v.total ? '' : `<p style="margin-top:12px"><button type="button" class="btn btn-ghost btn-sm" data-eliminar>${icon('trash', 15)} Eliminar visita</button> <small class="muted">Aún no tiene asistencias.</small></p>`}` : ''}`,
    onOpen(f, { close } = {}) {
      f.querySelector('[data-eliminar]')?.addEventListener('click', async () => {
        if (!(await confirmar(`¿Eliminar a ${esc(v.nombre)} de las visitas?`, { boton: 'Eliminar', danger: true }))) return;
        try { await call('deleteVisita', { id: v.id }); toast('Visita eliminada'); close?.(); await ctx.refresh(); } catch (er) { toast(er.message, 'err'); }
      });
    },
    async onSubmit(f) {
      await call('saveVisita', { id: v?.id, nombre: f.nombre.value, celular: f.celular.value, notas: f.notas.value, activo: v ? f.activo.checked : true });
      toast(v ? 'Visita actualizada' : 'Visita agregada');
      await ctx.refresh();
    }
  });
}

// ---------------------------------------------------------------
// Discipulados en hogares
// ---------------------------------------------------------------
let verInactivos = false;
function renderHogar(root, ctx, grupoId, cabecera, redibujar, soloGrupo = false) {
  const { data } = ctx;
  const grupos = [...(data.gruposHogar || [])].sort((a, b) => (a.sector || '').localeCompare(b.sector || '', 'es') || a.nombre.localeCompare(b.nombre, 'es'));
  const visibles = grupos.filter((g) => g.activo || verInactivos || g.id === grupoId);
  const g = grupos.find((x) => x.id === grupoId);
  if (soloGrupo && !g) {
    root.innerHTML = `${cabecera('Mi grupo')('')}${emptyState('Tu usuario aún no tiene un grupo de discipulado asignado. Pídele al administrador que lo enlace a tu grupo.', 'users')}`;
    return;
  }
  const chips = soloGrupo ? '' : `<nav class="min-tabs hogar-grupos" aria-label="Grupos de discipulado">
      <a href="#/asistencia/discipulados" class="${!g ? 'active' : ''}">Resumen</a>
      ${visibles.map((x) => `<a href="#/asistencia/discipulados/${x.id}" class="${g?.id === x.id ? 'active' : ''}">${esc(x.nombre)}${x.sector ? ` <small>· ${esc(x.sector)}</small>` : ''}${x.activo ? '' : ' <small>(inactivo)</small>'}</a>`).join('')}
      ${g ? `<button type="button" class="btn btn-ghost btn-sm" data-nuevo-grupo>${icon('plus', 15)} Nuevo grupo</button>` : ''}
    </nav>`;
  if (!g) {
    // Resumen de todos los grupos
    const filas = visibles.map((x) => {
      const cfg = ambitoHogar(data, x);
      const ses = [...cfg.sesiones].sort((a, b) => a.fecha.localeCompare(b.fecha));
      const ult = ses[ses.length - 1];
      const rec = ses.slice(-VENTANA);
      const prom = rec.length ? Math.round(rec.reduce((a, s) => a + String(s.presentes || '').split(',').filter(Boolean).length, 0) / rec.length) : 0;
      const { personas } = analizar(cfg, 'Discipulado');
      const alertas = personas.filter((p) => p.activo && p.tipo !== 'visita' && ses.length && p.racha >= 3).length;
      return { x, personas: cfg.personas.filter((p) => p.activo && p.tipo !== 'visita').length, visitas: cfg.personas.filter((p) => p.tipo === 'visita' && p.activo).length, ult, prom, rec: rec.length, alertas };
    });
    root.innerHTML = `
      ${cabecera('Asistencia', chips)(`<button class="btn btn-primary" data-nuevo-grupo>${icon('plus', 16)} Nuevo grupo</button>`)}
      <article class="card">
        <header class="card-head wrap"><div><h3>${icon('users', 16)} Discipulados en hogares</h3><p class="muted">Grupos por sector. Elige un grupo para tomar su asistencia y ver sus personas.</p></div>
          ${grupos.some((x) => !x.activo) ? `<label class="check"><input type="checkbox" data-inactivos ${verInactivos ? 'checked' : ''}> Ver grupos inactivos</label>` : ''}</header>
        ${filas.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Grupo</th><th class="hide-sm">Sector</th><th class="hide-sm">Líderes</th><th class="num">Personas</th><th>Última reunión</th><th class="num">Promedio</th><th class="num">Atención</th></tr></thead>
          <tbody>${filas.map((r) => `<tr class="asist-fila${r.x.activo ? '' : ' inactive'}" data-ir="${r.x.id}" tabindex="0">
            <td><b>${esc(r.x.nombre)}</b>${r.x.dia ? `<br><small class="muted">${esc(r.x.dia)}</small>` : ''}</td>
            <td class="hide-sm">${esc(r.x.sector) || '<span class="muted">—</span>'}</td>
            <td class="hide-sm">${esc(lideresDe(data, r.x)) || '<span class="muted">—</span>'}</td>
            <td class="num">${r.personas}${r.visitas ? `<br><small class="muted">+${r.visitas} visita${r.visitas === 1 ? '' : 's'}</small>` : ''}</td>
            <td class="nowrap">${r.ult ? `${fecha(r.ult.fecha)}<br><small class="muted">${String(r.ult.presentes || '').split(',').filter(Boolean).length} presentes</small>` : '<span class="muted">Sin registros</span>'}</td>
            <td class="num">${r.rec ? r.prom : '—'}</td>
            <td class="num">${r.alertas ? `<span class="chip-warn">${r.alertas}</span>` : '0'}</td></tr>`).join('')}</tbody>
        </table></div><p class="muted small">Atención = personas con 3 o más reuniones seguidas sin venir.</p>`
        : emptyState('Aún no hay grupos. Crea el primero con “Nuevo grupo” (por ejemplo, el del sector norte) y luego agrega a sus integrantes desde la lista de miembros.', 'users')}
      </article>`;
    root.querySelectorAll('[data-nuevo-grupo]').forEach((b) => b.addEventListener('click', () => editarGrupo(ctx)));
    root.querySelector('[data-inactivos]')?.addEventListener('change', (e) => { verInactivos = e.target.checked; redibujar(); });
    root.querySelectorAll('[data-ir]').forEach((tr) => {
      tr.addEventListener('click', () => ctx.go(`asistencia/discipulados/${tr.dataset.ir}`));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tr.click(); } });
    });
    return;
  }
  const cfg = ambitoHogar(data, g);
  const info = `<article class="card hogar-info">
      <div><b>${esc(g.nombre)}</b>${g.activo ? '' : ' <span class="badge st-open">Inactivo</span>'}
        <small class="muted">${[g.sector && `Sector ${g.sector}`, lideresDe(data, g) && `${idsLideres(g).length > 1 ? 'Líderes' : 'Líder'}: ${lideresDe(data, g)}`, g.dia].filter(Boolean).map(esc).join(' · ') || 'Sin sector ni líderes'}</small>
        ${g.notas ? `<small class="muted">${esc(g.notas)}</small>` : ''}</div>
      ${soloGrupo ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-editar-grupo>${icon('edit', 15)} Editar grupo</button>`}
    </article>`;
  renderAmbito(root, ctx, cfg, cabecera('Asistencia', chips + info), redibujar);
  root.querySelectorAll('[data-nuevo-grupo]').forEach((b) => b.addEventListener('click', () => editarGrupo(ctx)));
  root.querySelector('[data-editar-grupo]')?.addEventListener('click', () => editarGrupo(ctx, g));
  // Personas del grupo (miembros enlazados, no miembros y visitas)
  const ph = (data.personasHogar || []).filter((x) => x.grupoId === g.id).sort((a, b) => (a.tipo === 'visita') - (b.tipo === 'visita') || (!a.activo) - (!b.activo) || a.nombre.localeCompare(b.nombre, 'es'));
  root.insertAdjacentHTML('beforeend', `
    <article class="card">
      <header class="card-head wrap"><div><h3>${icon('users', 16)} Personas del grupo</h3><p class="muted">${ph.filter((x) => x.activo && x.tipo !== 'visita').length} integrantes${ph.some((x) => x.tipo === 'visita') ? ` · ${ph.filter((x) => x.tipo === 'visita').length} visitas` : ''} · toca a alguien para editarlo</p></div>
        <div class="head-actions">
          ${soloGrupo ? '' : `<button class="btn btn-ghost btn-sm" data-add-miembros>${icon('users', 15)} Agregar miembros</button>`}
          <button class="btn btn-ghost btn-sm" data-add-nomiembro>${icon('plus', 15)} No miembro</button>
          <button class="btn btn-ghost btn-sm" data-add-visita>${icon('user', 15)} Visita</button>
        </div></header>
      ${ph.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Nombre</th><th>Tipo</th><th>Celular</th><th class="hide-sm">Notas</th></tr></thead>
        <tbody>${ph.map((x) => `<tr class="asist-fila${x.activo ? '' : ' inactive'}" data-persona="${x.id}" tabindex="0" title="Editar">
          <td><b>${esc(x.nombre)}</b> ${icon('edit', 13)}${x.miembroId && idsLideres(g).includes(x.miembroId) ? ' <span class="tag">Líder</span>' : ''}${x.activo ? '' : ' <small class="muted">(inactivo)</small>'}</td>
          <td>${tipoHogar(x) === 'miembro' ? '<span class="badge st-ok">Miembro</span>' : tipoHogar(x) === 'visita' ? '<span class="badge st-open">Visita</span>' : '<span class="badge st-obs">No miembro</span>'}</td>
          <td class="nowrap">${x.celular ? `<a class="link" href="tel:${esc(x.celular.replace(/[^\d+]/g, ''))}">${esc(x.celular)}</a>` : '<span class="muted">—</span>'}</td>
          <td class="hide-sm"><small class="muted">${esc(x.notas)}</small></td></tr>`).join('')}</tbody>
      </table></div>` : emptyState(soloGrupo ? 'Aún no hay personas en el grupo. Los miembros los agrega la secretaría o el pastor; tú puedes agregar visitas y no miembros.' : 'Agrega a los integrantes del grupo desde la lista de miembros, o a personas que no son miembros.', 'users')}
      ${soloGrupo && ph.length ? '<p class="muted small">Los miembros de la iglesia los agrega o quita la secretaría o el pastor.</p>' : ''}
    </article>`);
  root.querySelector('[data-add-miembros]')?.addEventListener('click', () => agregarMiembrosHogar(ctx, g));
  root.querySelector('[data-add-nomiembro]').addEventListener('click', () => editarPersonaHogar(ctx, g, null, 'integrante'));
  root.querySelectorAll('[data-add-visita]').forEach((b) => b.addEventListener('click', () => editarPersonaHogar(ctx, g, null, 'visita')));
  root.querySelectorAll('[data-persona]').forEach((tr) => {
    tr.addEventListener('click', () => editarPersonaHogar(ctx, g, ph.find((x) => x.id === tr.dataset.persona)));
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tr.click(); } });
  });
}

// Nombres de los líderes del grupo (desde su ficha de Miembros; en grupos antiguos, el texto "encargado")
const idsLideres = (g) => String(g?.lideres || '').split(',').filter(Boolean);
function lideresDe(data, g) {
  const nom = Object.fromEntries((data.miembros || []).map((m) => [m.id, m.nombre]));
  const n = idsLideres(g).map((id) => nom[id]).filter(Boolean);
  return n.length ? n.join(' y ') : g.encargado || '';
}

function editarGrupo(ctx, g = null) {
  const miembros = (ctx.data.miembros || []).filter((m) => m.estado === 'activo' || idsLideres(g).includes(m.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const porId = Object.fromEntries(miembros.map((m) => [m.id, m]));
  const [l1, l2] = idsLideres(g);
  const opciones = (sel, vacio) => `<option value="">${vacio}</option>${miembros.map((m) => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.nombre)}${m.conyugeId && porId[m.conyugeId] ? ' 💍' : ''}</option>`).join('')}`;
  return modal({
    title: g ? 'Editar grupo' : 'Nuevo grupo de discipulado',
    body: `
      <label class="field"><span>Nombre del grupo</span><input name="nombre" required maxlength="60" value="${esc(g?.nombre || '')}" placeholder="Ej.: Discipulado Villa Alegre"></label>
      <div class="form-row">
        <label class="field"><span>Sector</span><input name="sector" maxlength="60" value="${esc(g?.sector || '')}" placeholder="Ej.: Norte, Centro, Pedro de Valdivia"></label>
        <label class="field"><span>Día y hora <small class="muted">(opcional)</small></span><input name="dia" maxlength="40" list="dias-hogar" value="${esc(g?.dia || '')}" placeholder="Ej.: Jueves 19:30"><datalist id="dias-hogar">${DIAS.map((d) => `<option value="${d}">`).join('')}</datalist></label>
      </div>
      <div class="form-row">
        <label class="field"><span>Líder del grupo</span><select name="lider1">${opciones(l1, '— Elegir de Miembros —')}</select></label>
        <label class="field"><span>Segundo líder <small class="muted">(cónyuge u otro)</small></span><select name="lider2">${opciones(l2, '— Lo dirige solo —')}</select></label>
      </div>
      <p class="muted small" data-lider-ayuda>Generalmente es un matrimonio: al elegir a alguien casado (💍), su cónyuge se propone como segundo líder. Si lo dirige una sola persona, deja el segundo en “Lo dirige solo”. Los líderes quedan también como integrantes del grupo.</p>
      ${!l1 && g?.encargado ? `<p class="muted small">Antes se anotó como encargado: <b>${esc(g.encargado)}</b>. Elige a los líderes de la lista de miembros.</p>` : ''}
      <label class="field"><span>Notas <small class="muted">(opcional)</small></span><input name="notas" maxlength="300" value="${esc(g?.notas || '')}" placeholder="Ej.: se reúnen en casa de la familia…"></label>
      ${g ? `<label class="check"><input type="checkbox" name="activo" ${g.activo ? 'checked' : ''}> Grupo activo</label>
      <p style="margin-top:12px"><button type="button" class="link-btn danger-link" data-eliminar>${icon('trash', 14)} Eliminar grupo</button> <small class="muted">Solo si aún no tiene asistencias; si no, desmarca “Grupo activo”.</small></p>` : ''}`,
    submitLabel: g ? 'Guardar' : 'Crear grupo',
    onOpen(f, { close } = {}) {
      // al elegir a alguien casado, su cónyuge queda propuesto como segundo líder (se puede cambiar)
      f.lider1.addEventListener('change', () => {
        const m = porId[f.lider1.value];
        if (m?.conyugeId && porId[m.conyugeId] && (!f.lider2.value || f.lider2.value === f.lider1.value)) f.lider2.value = m.conyugeId;
        if (f.lider2.value === f.lider1.value) f.lider2.value = '';
      });
      f.querySelector('[data-eliminar]')?.addEventListener('click', async () => {
        close?.(null);
        if (!(await confirmar(`¿Eliminar el grupo <b>${esc(g.nombre)}</b> y su lista de personas?`, { boton: 'Eliminar', danger: true }))) return;
        try { await call('deleteGrupoHogar', { id: g.id }); toast('Grupo eliminado'); await ctx.refresh(); ctx.go('asistencia/discipulados'); } catch (er) { toast(er.message, 'err'); }
      });
    },
    async onSubmit(f) {
      if (!f.lider1.value && f.lider2.value) { f.lider1.value = f.lider2.value; f.lider2.value = ''; }
      if (!f.lider1.value) throw new Error('Elige al líder del grupo');
      if (f.lider1.value === f.lider2.value) throw new Error('Elige dos personas distintas, o deja el segundo en “Lo dirige solo”');
      const lideres = [f.lider1.value, f.lider2.value].filter(Boolean);
      const r = await call('saveGrupoHogar', { id: g?.id, nombre: f.nombre.value, sector: f.sector.value, dia: f.dia.value, lideres, encargado: g?.encargado || '', notas: f.notas.value, activo: g ? f.activo.checked : true });
      toast(g ? 'Grupo actualizado' : 'Grupo creado: ahora agrega a sus integrantes');
      await ctx.refresh();
      if (!g) ctx.go(`asistencia/discipulados/${r.id}`);
    }
  });
}

// Enlazar miembros al grupo desde la lista de Miembros (se pueden marcar varios)
function agregarMiembrosHogar(ctx, g) {
  const { data } = ctx;
  const ya = new Set((data.personasHogar || []).filter((x) => x.grupoId === g.id && x.miembroId).map((x) => x.miembroId));
  // en qué otro grupo está cada miembro (para orientar, no impide)
  const nomG = Object.fromEntries((data.gruposHogar || []).map((x) => [x.id, x.nombre]));
  const otroGrupo = {};
  (data.personasHogar || []).forEach((x) => { if (x.miembroId && x.grupoId !== g.id && x.activo) (otroGrupo[x.miembroId] ||= []).push(nomG[x.grupoId]); });
  const lista = (data.miembros || []).filter((m) => m.estado === 'activo' && !ya.has(m.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  if (!lista.length) return toast('Todos los miembros activos ya están en este grupo', 'err');
  return modal({
    title: `Agregar miembros a ${esc(g.nombre)}`,
    wide: true,
    body: `
      <div class="pick-tools">
        <div class="search">${icon('search', 16)}<input type="search" placeholder="Buscar por nombre o domicilio…" data-buscar></div>
        <label class="check"><input type="checkbox" data-sin-grupo> Solo sin grupo</label>
      </div>
      <ul class="pick-list" data-lista>${lista.map((m) => `<li data-nombre="${esc(norm(m.nombre + ' ' + (m.domicilio || '')))}" data-con-grupo="${otroGrupo[m.id] ? 1 : 0}"><label class="check"><input type="checkbox" name="m" value="${m.id}"> ${esc(m.nombre)}${m.domicilio ? ` <small class="muted">· ${esc(m.domicilio)}</small>` : ''}${otroGrupo[m.id] ? ` <small class="tag">en ${esc(otroGrupo[m.id].join(', '))}</small>` : ''}</label></li>`).join('')}</ul>
      <p class="muted small" data-cuenta>0 seleccionados</p>`,
    submitLabel: 'Agregar al grupo',
    onOpen(f) {
      const filtrar = () => {
        const q = norm(f.querySelector('[data-buscar]').value);
        const sg = f.querySelector('[data-sin-grupo]').checked;
        f.querySelectorAll('[data-lista] li').forEach((li) => { li.hidden = (q && !li.dataset.nombre.includes(q)) || (sg && li.dataset.conGrupo === '1'); });
      };
      f.querySelector('[data-buscar]').addEventListener('input', filtrar);
      f.querySelector('[data-sin-grupo]').addEventListener('change', filtrar);
      f.querySelectorAll('[name=m]').forEach((c) => c.addEventListener('change', () => { f.querySelector('[data-cuenta]').textContent = `${f.querySelectorAll('[name=m]:checked').length} seleccionados`; }));
    },
    async onSubmit(f) {
      const ids = [...f.querySelectorAll('[name=m]:checked')].map((c) => c.value);
      if (!ids.length) throw new Error('Marca al menos a un miembro');
      for (const id of ids) await call('savePersonaHogar', { grupoId: g.id, tipo: 'integrante', miembroId: id });
      toast(`${ids.length} miembro${ids.length === 1 ? '' : 's'} agregado${ids.length === 1 ? '' : 's'} al grupo`);
      await ctx.refresh();
    }
  });
}

// No miembro o visita (con su contacto); un miembro enlazado solo edita notas y si está activo
function editarPersonaHogar(ctx, g, x = null, tipoNuevo = 'integrante') {
  const tipo = x ? x.tipo : tipoNuevo;
  const esMiembro = !!x?.esMiembro;
  const total = x ? (ctx.data.asistenciasHogar || []).filter((a) => a.grupoId === g.id && String(a.presentes || '').split(',').includes(x.id)).length : 0;
  const titulo = x ? (esMiembro ? x.nombre : tipo === 'visita' ? 'Editar visita' : 'Editar no miembro') : tipo === 'visita' ? 'Agregar visita al grupo' : 'Agregar no miembro al grupo';
  return modal({
    title: esc(titulo),
    body: `
      ${esMiembro ? `<p class="muted small">Es miembro de la iglesia: su nombre y celular vienen de su ficha en Miembros.</p>`
        : `<p class="muted small">${tipo === 'visita' ? 'Persona que visita el discipulado. Anota su contacto para hacerle seguimiento.' : 'Integrante del grupo que no es miembro de la iglesia.'}</p>
      <label class="field"><span>Nombre</span><input name="nombre" required maxlength="80" value="${esc(x?.nombre || '')}"></label>
      <label class="field"><span>Celular ${tipo === 'visita' ? '' : '<small class="muted">(opcional)</small>'}</span><input name="celular" inputmode="tel" maxlength="30" value="${esc(x?.celular || '')}" placeholder="+56 9 1234 5678"></label>`}
      <label class="field"><span>Notas <small class="muted">(opcional)</small></span><input name="notas" maxlength="300" value="${esc(x?.notas || '')}" placeholder="${tipo === 'visita' ? 'Ej.: invitada por la hermana…, dirección' : 'Ej.: rol en el grupo'}"></label>
      ${x && tipo === 'visita' ? `<label class="check"><input type="checkbox" name="pasar"> Ya participa siempre: pasarla a integrante (no miembro)</label>` : ''}
      ${x ? `<label class="check"><input type="checkbox" name="activo" ${x.activo ? 'checked' : ''}> Activo en el grupo (aparece al tomar asistencia)</label>
      <p style="margin-top:12px">${total ? `<small class="muted">Tiene ${total} asistencia${total === 1 ? '' : 's'}: si ya no participa, desmarca “Activo”.</small>` : esMiembro && ctx.user?.rol === 'discipulado' ? '' : `<button type="button" class="link-btn danger-link" data-quitar>${icon('trash', 14)} Quitar del grupo</button>`}</p>` : ''}`,
    submitLabel: x ? 'Guardar' : 'Agregar',
    onOpen(f, { close } = {}) {
      f.querySelector('[data-quitar]')?.addEventListener('click', async () => {
        close?.(null);
        if (!(await confirmar(`¿Quitar a <b>${esc(x.nombre)}</b> de ${esc(g.nombre)}?`, { boton: 'Quitar', danger: true }))) return;
        try { await call('deletePersonaHogar', { id: x.id }); toast('Quitado del grupo'); await ctx.refresh(); } catch (er) { toast(er.message, 'err'); }
      });
    },
    async onSubmit(f) {
      const d = { id: x?.id, grupoId: g.id, tipo: f.pasar?.checked ? 'integrante' : tipo, miembroId: x?.miembroId || '', notas: f.notas.value, activo: x ? f.activo.checked : true };
      if (!esMiembro) { d.nombre = f.nombre.value; d.celular = f.celular.value; } else d.celular = '';
      await call('savePersonaHogar', d);
      toast(x ? 'Datos guardados' : tipo === 'visita' ? 'Visita agregada al grupo' : 'Agregado al grupo');
      await ctx.refresh();
    }
  });
}
