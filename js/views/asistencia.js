// Control de asistencia: cultos dominicales, escuela dominical u otras actividades.
// Se marca a los presentes (miembros, integrantes de ministerios que no son miembros y visitas)
// y la app avisa quién lleva varias reuniones seguidas sin venir.
import { icon, esc, modal, toast, confirmar, emptyState, fecha } from '../ui.js';
import { call } from '../api.js';

const BASE = ['Culto dominical', 'Escuela dominical'];
const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const leer = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
const vista = { actividad: leer('asist_actividad', BASE[0]), umbral: +leer('asist_umbral', 3) || 3, filtro: 'todos' };
const TIPO = { miembro: 'Miembro', integrante: 'Ministerio', visita: 'Visita' };
const VENTANA = 8; // reuniones recientes para medir regularidad

export function actividadesDe(data) {
  const vistas = new Map(BASE.map((a) => [norm(a), a]));
  data.asistencias.forEach((s) => { if (!vistas.has(norm(s.actividad))) vistas.set(norm(s.actividad), s.actividad); });
  return [...vistas.values()];
}
const etiquetaTipo = (p) => (p.tipo === 'integrante' && p.ministerios.length ? p.ministerios.join(', ') : TIPO[p.tipo]);
// último domingo (hoy si es domingo)
const ultimoDomingo = (hoy) => { const d = new Date(hoy + 'T12:00:00'); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10); };

// id → id de la persona (el "i:" de un integrante que luego se hizo miembro cuenta como el miembro)
const canonDe = (data) => {
  const c = {};
  data.personasAsistencia.forEach((p) => { c[p.id] = p.id; (p.alias || []).forEach((a) => { c[a] = p.id; }); });
  return c;
};
const presentesDe = (s, canon) => new Set(String(s.presentes || '').split(',').filter(Boolean).map((id) => canon[id] || id));

// Regularidad de cada persona en una actividad
export function analizar(data, actividad) {
  const canon = canonDe(data);
  const sesiones = data.asistencias.filter((s) => norm(s.actividad) === norm(actividad)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pres = sesiones.map((s) => presentesDe(s, canon));
  const personas = data.personasAsistencia.map((p) => {
    const idx = sesiones.map((_, i) => i);
    // cuenta desde que es miembro / está en el ministerio; una visita, desde la primera vez que vino
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

export function render(root, ctx) {
  const { data } = ctx;
  const actividades = actividadesDe(data);
  if (!actividades.some((a) => norm(a) === norm(vista.actividad))) vista.actividad = actividades[0];
  const { sesiones, pres, personas } = analizar(data, vista.actividad);
  // en la lista: activos (miembros e integrantes) y visitas que ya vinieron a esta actividad
  const lista = personas.filter((p) => (p.tipo === 'visita' ? p.activo || p.total > 0 : p.activo)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const alertas = lista.filter((p) => p.tipo !== 'visita' && sesiones.length && p.racha >= vista.umbral)
    .sort((a, b) => b.racha - a.racha || a.nombre.localeCompare(b.nombre, 'es'));
  const ult = sesiones[sesiones.length - 1];
  const recientes = sesiones.slice(-VENTANA);
  const promedio = recientes.length ? Math.round(recientes.reduce((a, s, i) => a + pres[sesiones.length - recientes.length + i].size, 0) / recientes.length) : 0;
  const cuenta = (i) => { const c = { m: 0, i: 0, v: 0 }; pres[i].forEach((id) => { c[id[0]] = (c[id[0]] || 0) + 1; }); return c; };
  const regulares = lista.filter((p) => p.tipo !== 'visita' && p.estado === 'regular').length;
  const irregulares = lista.filter((p) => p.tipo !== 'visita' && p.estado === 'irregular').length;

  root.innerHTML = `
  <section class="page-head">
    <div><span class="eyebrow">Iglesia</span><h1>Asistencia</h1></div>
    <div class="head-actions">
      <button class="btn btn-ghost" data-visita>${icon('user', 16)} Agregar visita</button>
      <button class="btn btn-primary" data-tomar>${icon('check', 16)} Tomar asistencia</button>
    </div>
  </section>

  <div class="tabs asist-tabs">${actividades.map((a) => `<button class="tab ${norm(a) === norm(vista.actividad) ? 'active' : ''}" data-act="${esc(a)}">${esc(a)}</button>`).join('')}</div>

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
          <div><b>${esc(p.nombre)}</b><small class="muted">${esc(etiquetaTipo(p))}${p.ultima ? ` · vino por última vez el ${fecha(p.ultima)}` : ' · no ha venido desde que se lleva el registro'}${p.celular ? ` · ${esc(p.celular)}` : ''}</small></div>
          <span class="chip-warn">${p.racha} seguidas</span></li>`).join('')}</ul>`
        : `<div class="note">${icon('checkCircle', 16)}<span>Nadie lleva ${vista.umbral} reuniones seguidas sin venir. 🙌</span></div>`}
    </article>
    <article class="card">
      <header class="card-head"><div><h3>Reuniones registradas</h3><p class="muted">${esc(vista.actividad)} · toca una para corregirla</p></div></header>
      ${sesiones.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Fecha</th><th class="num">Presentes</th><th class="num hide-sm">Miembros</th><th class="num hide-sm">Ministerios</th><th class="num">Visitas</th><th></th></tr></thead>
        <tbody>${sesiones.map((s, i) => [s, i]).reverse().slice(0, 15).map(([s, i]) => { const c = cuenta(i); return `<tr class="asist-fila" data-sesion="${s.id}" tabindex="0" title="Corregir esta reunión">
          <td class="nowrap"><b>${fecha(s.fecha)}</b>${s.notas ? `<br><small class="muted">${esc(s.notas)}</small>` : ''}</td>
          <td class="num strong">${pres[i].size}</td><td class="num hide-sm">${c.m}</td><td class="num hide-sm">${c.i}</td><td class="num">${c.v}</td>
          <td class="row-actions"><button class="icon-btn sm" data-borrar="${s.id}" title="Eliminar">${icon('trash', 15)}</button></td></tr>`; }).join('')}</tbody>
      </table></div>${sesiones.length > 15 ? `<p class="muted small">Se muestran las últimas 15 de ${sesiones.length}.</p>` : ''}`
        : emptyState(`Aún no hay reuniones de ${vista.actividad}. Presiona “Tomar asistencia”.`, 'calendar')}
    </article>
  </div>

  <article class="card">
    <header class="card-head wrap"><div><h3>Asistencia por persona</h3><p class="muted">${esc(vista.actividad)} · en las últimas ${VENTANA} reuniones (o desde que está en la lista)</p></div></header>
    <div class="filters">
      <div class="search">${icon('search', 16)}<input type="search" placeholder="Buscar…" data-q></div>
      <div class="seg seg-sm">${[['todos', 'Todos'], ['regular', 'Regulares'], ['irregular', 'Irregulares'], ['visita', 'Visitas']].map(([k, l]) => `<label><input type="radio" name="fasist" value="${k}" ${vista.filtro === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
    </div>
    ${lista.length ? `<div class="table-wrap"><table class="table asist-tabla">
      <thead><tr><th>Nombre</th><th>Grupo</th><th class="num">Vino</th><th class="num">Faltas seguidas</th><th>Última vez</th><th>Estado</th></tr></thead>
      <tbody>${lista.map((p) => `<tr data-nombre="${esc(norm(p.nombre))}" data-grupo="${p.tipo === 'visita' ? 'visita' : p.estado}"${p.tipo === 'visita' ? ` class="asist-fila" data-visita-id="${esc(p.id.slice(2))}" tabindex="0" title="Editar visita"` : ''}>
        <td><b>${esc(p.nombre)}</b>${p.tipo === 'visita' ? ` ${icon('edit', 13)}${p.activo ? '' : ' <small class="muted">(inactiva)</small>'}` : ''}</td>
        <td><small class="muted">${esc(etiquetaTipo(p))}</small></td>
        <td class="num">${p.recientes ? `${p.vinoRec}/${p.recientes}` : '—'}</td>
        <td class="num">${p.recientes ? (p.racha >= vista.umbral && p.tipo !== 'visita' ? `<span class="chip-warn">${p.racha}</span>` : p.racha) : '—'}</td>
        <td class="nowrap">${p.ultima ? fecha(p.ultima) : '<span class="muted">—</span>'}</td>
        <td>${p.tipo === 'visita' ? `<span class="badge st-open">Visita · ${p.total ? `${p.total} ${p.total === 1 ? 'vez' : 'veces'}` : 'aún no viene'}</span>` : p.estado === 'nuevo' ? '<span class="badge st-open">Pocos datos</span>' : p.estado === 'regular' ? '<span class="badge st-ok">Regular</span>' : '<span class="badge st-obs">Irregular</span>'}</td></tr>`).join('')}</tbody>
    </table></div>` : emptyState('Carga a los hermanos en Miembros para llevar la asistencia.', 'users')}
  </article>`;

  root.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => { vista.actividad = b.dataset.act; guardar('asist_actividad', vista.actividad); render(root, ctx); }));
  root.querySelector('[data-umbral]')?.addEventListener('change', (e) => { vista.umbral = +e.target.value; guardar('asist_umbral', String(vista.umbral)); render(root, ctx); });
  root.querySelector('[data-tomar]').addEventListener('click', () => tomarAsistencia(ctx));
  root.querySelector('[data-visita]').addEventListener('click', () => editarVisita(ctx));
  // Las filas que se abren responden a Enter y Espacio como un botón
  root.querySelectorAll('.asist-fila').forEach((tr) => tr.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === tr) { e.preventDefault(); tr.click(); }
  }));
  root.querySelectorAll('[data-sesion]').forEach((tr) => tr.addEventListener('click', (e) => {
    if (e.target.closest('[data-borrar]')) return;
    tomarAsistencia(ctx, data.asistencias.find((s) => s.id === tr.dataset.sesion));
  }));
  root.querySelectorAll('[data-visita-id]').forEach((tr) => tr.addEventListener('click', () => {
    const p = data.personasAsistencia.find((x) => x.id === 'v:' + tr.dataset.visitaId);
    if (p) editarVisita(ctx, { id: tr.dataset.visitaId, nombre: p.nombre, celular: p.celular, notas: p.notas, activo: p.activo, total: personas.find((x) => x.id === p.id)?.total || 0 });
  }));
  root.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
    const s = data.asistencias.find((x) => x.id === b.dataset.borrar);
    if (!(await confirmar(`¿Eliminar la asistencia de ${esc(s.actividad)} del ${fecha(s.fecha)}?`, { boton: 'Eliminar', danger: true }))) return;
    try { await call('deleteAsistencia', { id: s.id }); toast('Asistencia eliminada'); await ctx.refresh(); } catch (er) { toast(er.message, 'err'); }
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

// Pasar lista: fecha, actividad y presentes (con buscador y alta rápida de visitas)
function tomarAsistencia(ctx, sesion = null) {
  const { data } = ctx;
  const actividades = actividadesDe(data);
  const canon = canonDe(data);
  const buscar = (f, act) => data.asistencias.find((s) => s.fecha === f && norm(s.actividad) === norm(act));
  // al abrir: si ya existe la reunión de la fecha propuesta, se corrige esa
  if (!sesion) sesion = buscar(ultimoDomingo(data.hoy), vista.actividad) || null;
  const marcados = sesion ? presentesDe(sesion, canon) : new Set();
  // personas disponibles: activos + visitas activas + quien ya estaba marcado en esta reunión
  let personas = data.personasAsistencia.filter((p) => p.activo || marcados.has(p.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const actInicial = sesion?.actividad || vista.actividad;
  const fila = (p) => `<li data-nombre="${esc(norm(p.nombre))}" data-tipo="${p.tipo}"><label class="check"><input type="checkbox" name="p" value="${p.id}" ${marcados.has(p.id) ? 'checked' : ''}> ${esc(p.nombre)} <small class="muted">· ${esc(etiquetaTipo(p))}</small></label></li>`;
  return modal({
    title: 'Asistencia',
    wide: true,
    body: `
      <div class="form-row">
        <label class="field"><span>Fecha</span><input type="date" name="fecha" value="${esc(sesion?.fecha || ultimoDomingo(data.hoy))}" max="${data.hoy}" required></label>
        <label class="field"><span>Actividad</span><select name="actividad">${actividades.map((a) => `<option ${norm(a) === norm(actInicial) ? 'selected' : ''}>${esc(a)}</option>`).join('')}<option value="__otra">Otra actividad…</option></select></label>
      </div>
      <div class="note" data-existente ${sesion ? '' : 'hidden'}>${icon('edit', 16)}<span>Esta reunión ya estaba registrada: estás corrigiéndola.</span></div>
      <label class="field" data-otra hidden><span>Nombre de la actividad</span><input name="otra" maxlength="60" placeholder="Ej.: Reunión de oración, Vigilia, Campamento"></label>
      <div class="pick-tools">
        <div class="search">${icon('search', 16)}<input type="search" placeholder="Buscar nombre…" data-buscar></div>
        <select data-tipo><option value="">Todos</option><option value="miembro">Miembros</option><option value="integrante">De ministerios (no miembros)</option><option value="visita">Visitas</option></select>
        <button type="button" class="link-btn" data-solo-marcados>Ver marcados</button>
      </div>
      <ul class="pick-list" data-lista>${personas.map(fila).join('')}</ul>
      <div class="asist-nueva"><input name="nuevaVisita" placeholder="¿Vino alguien nuevo? Escribe su nombre" maxlength="80"><button type="button" class="btn btn-ghost btn-sm" data-add-visita>${icon('plus', 15)} Agregar visita</button></div>
      <label class="field"><span>Notas <small class="muted">(opcional)</small></span><input name="notas" maxlength="300" value="${esc(sesion?.notas || '')}" placeholder="Ej.: culto de Santa Cena, día de lluvia"></label>
      <p class="muted small" data-cuenta></p>`,
    submitLabel: 'Guardar asistencia',
    onOpen(f) {
      const contar = () => {
        const c = [...f.querySelectorAll('[name=p]')].filter((x) => x.checked);
        const v = c.filter((x) => x.value.startsWith('v:')).length;
        f.querySelector('[data-cuenta]').textContent = `${c.length} presente${c.length === 1 ? '' : 's'}${v ? ` (${v} visita${v === 1 ? '' : 's'})` : ''}`;
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
      f.querySelector('[data-solo-marcados]').addEventListener('click', (e) => { soloMarcados = !soloMarcados; e.currentTarget.textContent = soloMarcados ? 'Ver todos' : 'Ver marcados'; filtrar(); });
      const otra = f.querySelector('[data-otra]');
      const actividadElegida = () => (f.actividad.value === '__otra' ? f.otra.value.trim() : f.actividad.value);
      // si cambian la fecha o la actividad a una reunión ya registrada, se carga para corregirla
      const revisarExistente = () => {
        const ex = actividadElegida() ? buscar(f.fecha.value, actividadElegida()) : null;
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
      // alta rápida de una visita: queda guardada y marcada como presente
      const agregar = async () => {
        const nombre = f.nuevaVisita.value.trim();
        if (!nombre) return f.nuevaVisita.focus();
        const ya = personas.find((p) => norm(p.nombre) === norm(nombre));
        if (ya) {
          const c = f.querySelector(`[name=p][value="${ya.id}"]`);
          if (c) { c.checked = true; contar(); }
          f.nuevaVisita.value = ''; toast(`${ya.nombre} ya estaba en la lista: quedó marcado`); return;
        }
        const btn = f.querySelector('[data-add-visita]'); btn.disabled = true;
        try {
          const v = await call('saveVisita', { nombre, fecha: f.fecha.value });
          const p = { id: 'v:' + v.id, tipo: 'visita', nombre: v.nombre, activo: true, desde: f.fecha.value, celular: '', ministerios: [] };
          personas = [...personas, p];
          data.personasAsistencia.push(p);
          const lista = f.querySelector('[data-lista]');
          lista.insertAdjacentHTML('afterbegin', fila(p));
          const c = lista.querySelector(`[value="${p.id}"]`); c.checked = true; c.addEventListener('change', contar);
          f.nuevaVisita.value = ''; contar();
        } catch (er) { toast(er.message, 'err'); } finally { btn.disabled = false; }
      };
      f.querySelector('[data-add-visita]').addEventListener('click', agregar);
      f.nuevaVisita.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
    },
    async onSubmit(f) {
      const actividad = f.actividad.value === '__otra' ? f.otra.value.trim() : f.actividad.value;
      if (!actividad) throw new Error('Escribe el nombre de la actividad');
      const presentes = [...f.querySelectorAll('[name=p]')].filter((x) => x.checked).map((x) => x.value);
      if (!presentes.length) throw new Error('Marca al menos a una persona presente');
      await call('saveAsistencia', { id: sesion?.id, fecha: f.fecha.value, actividad, notas: f.notas.value, presentes });
      vista.actividad = actividad; guardar('asist_actividad', actividad);
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

