// Listado de integrantes (p. ej. jóvenes) y actividades con cuota de un ministerio.
// Lo usa el líder del ministerio y también tesorería/administración.
import { icon, esc, money, fecha, modal, formData, toast, confirmar, emptyState, pesos, formatoPesos, cap, mesLargo, esAdmin, sinTildes } from '../ui.js';
import { rendicionDe } from '../calc.js';
import { call } from '../api.js';
import { abrirFormMovimiento } from './movform.js';
import { edad } from './miembros.js';
import { renderMinisterio as renderAsistencia } from './asistencia.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const filtros = { q: '', tipo: 'activos' };

export const etiquetaIntegrantes = (m) => (m.porMatrimonio === 'si' ? 'Matrimonios' : /j[oó]ven/i.test(m.nombre) ? 'Jóvenes' : 'Integrantes');
const singular = (m) => (m.porMatrimonio === 'si' ? 'matrimonio' : /j[oó]ven/i.test(m.nombre) ? 'joven' : 'integrante');
export const integrantesDe = (data, mid) => (data.integrantes || []).filter((i) => i.ministerioId === mid);
export const actividadesDe = (data, mid) => (data.actividades || []).filter((a) => a.ministerioId === mid);

// Totales de una actividad: confirmados, pagos y el flujo de entradas y salidas
export function resumenActividad(data, a) {
  const ins = (data.inscripciones || []).filter((x) => x.actividadId === a.id);
  const movs = data.movMinisterios.filter((x) => x.actividadId === a.id);
  const suma = (l) => l.reduce((s, x) => s + x.monto, 0);
  const cuotas = suma(movs.filter((x) => x.origen === 'cuota'));
  const otrosIngresos = suma(movs.filter((x) => x.tipo === 'ingreso' && x.origen !== 'cuota'));
  const gastos = suma(movs.filter((x) => x.tipo === 'gasto'));
  const pagados = ins.filter((x) => x.movId).length;
  return {
    ins, movs, cuotas, otrosIngresos, gastos, pagados,
    ingresos: cuotas + otrosIngresos,
    resultado: cuotas + otrosIngresos - gastos,
    porCobrar: (ins.length - pagados) * (a.cuota || 0)
  };
}

// Pestañas del ministerio (Finanzas · Jóvenes · Asistencia · Actividades)
// La asistencia del ministerio la ven su líder, el pastor y el administrador (no tesorería)
let rolMin = '';
export const veAsistenciaMin = (rol) => ['lider', 'pastor', 'admin'].includes(rol);
export function tabsMinisterio(m, base, activo, rol = rolMin) {
  const t = [['', 'Finanzas', 'wallet'], ['integrantes', etiquetaIntegrantes(m), 'users'], ...(veAsistenciaMin(rol) ? [['asistencia', 'Asistencia', 'checkCircle']] : []), ['actividades', 'Actividades', 'calendar']];
  return `<nav class="min-tabs" aria-label="Secciones del ministerio">${t.map(([k, l, ic]) => `<a href="#/${base}${k ? '/' + k : ''}" class="${activo === k ? 'active' : ''}">${icon(ic, 16)} ${l}</a>`).join('')}</nav>`;
}

function cabecera(m, base, esTes, activo, titulo, acciones = '') {
  return `
  ${esTes ? `<a class="back" href="#/ministerios">${icon('chevL', 16)} Ministerios</a>` : ''}
  <section class="page-head">
    <div><span class="eyebrow">${esc(m.icono)} ${esc(m.nombre)}</span><h1>${titulo}</h1></div>
    <div class="head-actions">${acciones}</div>
  </section>
  ${tabsMinisterio(m, base, activo)}`;
}

// Punto de entrada desde la vista del ministerio
export function renderSeccion(root, ctx, m, { esTes, base, sub, subId }) {
  rolMin = ctx.user?.rol || '';
  if (sub === 'asistencia' && !veAsistenciaMin(rolMin)) sub = 'actividades';
  if (sub === 'integrantes') return renderIntegrantes(root, ctx, m, base, esTes);
  if (sub === 'asistencia') return renderAsistencia(root, ctx, m, (acciones) => cabecera(m, base, esTes, 'asistencia', 'Asistencia', acciones), etiquetaIntegrantes(m));
  if (sub === 'actividad' && subId) return renderActividad(root, ctx, m, base, esTes, subId);
  return renderActividades(root, ctx, m, base, esTes);
}

// =================================================================
// Integrantes
// =================================================================
function renderIntegrantes(root, ctx, m, base, esTes) {
  const { data } = ctx;
  const hoy = data.hoy;
  const todos = integrantesDe(data, m.id).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const activos = todos.filter((i) => i.activo);
  const miembros = activos.filter((i) => i.esMiembro).length;
  const mesHoy = +hoy.slice(5, 7);
  const cumple = activos.filter((i) => i.fechaNacimiento && +i.fechaNacimiento.slice(5, 7) === mesHoy)
    .sort((a, b) => a.fechaNacimiento.slice(8).localeCompare(b.fechaNacimiento.slice(8)));
  const q = sinTildes(filtros.q);
  const lista = todos.filter((i) => {
    if (filtros.tipo === 'activos' && !i.activo) return false;
    if (filtros.tipo === 'miembros' && !(i.activo && i.esMiembro)) return false;
    if (filtros.tipo === 'nomiembros' && !(i.activo && !i.esMiembro)) return false;
    if (filtros.tipo === 'inactivos' && i.activo) return false;
    return !q || sinTildes(`${i.nombre} ${i.celular} ${i.email}`).includes(q);
  });
  const lbl = etiquetaIntegrantes(m);

  root.innerHTML = `
  ${cabecera(m, base, esTes, 'integrantes', lbl, `${esAdmin(ctx.user) ? `<button class="btn btn-ghost" data-varios>${icon('church', 16)} Agregar miembros</button>` : ''}<button class="btn btn-primary" data-nuevo>${icon('plus', 16)} Agregar ${singular(m)}</button>`)}
  <section class="kpis kpis-4">
    <article class="kpi"><span class="kpi-label">${icon('users', 15)} ${lbl} activos</span><strong class="kpi-value">${activos.length}</strong><span class="kpi-sub">${todos.length - activos.length ? `${todos.length - activos.length} inactivo${todos.length - activos.length > 1 ? 's' : ''}` : 'en el listado'}</span></article>
    <article class="kpi"><span class="kpi-label">${icon('church', 15)} Miembros de la iglesia</span><strong class="kpi-value">${miembros}</strong><span class="kpi-sub">enlazados a su ficha de Miembros</span></article>
    <article class="kpi"><span class="kpi-label">${icon('user', 15)} No miembros</span><strong class="kpi-value">${activos.length - miembros}</strong><span class="kpi-sub">aún no bautizados u otra iglesia</span></article>
    <article class="kpi"><span class="kpi-label">${icon('gift', 15)} Cumpleaños de ${MESES[mesHoy - 1]}</span><strong class="kpi-value">${cumple.length}</strong><span class="kpi-sub">${cumple.length ? cumple.slice(0, 3).map((i) => `${esc(i.nombre.split(' ')[0])} (${+i.fechaNacimiento.slice(8)})`).join(', ') + (cumple.length > 3 ? '…' : '') : 'nadie este mes'}</span></article>
  </section>
  <article class="card">
    <header class="card-head wrap"><div><h3>Listado</h3><p class="muted">${lista.length} de ${todos.length}</p></div></header>
    <div class="filters">
      <div class="search">${icon('search', 16)}<input type="search" placeholder="Buscar por nombre, celular o correo…" value="${esc(filtros.q)}" data-q></div>
      <div class="seg seg-sm">
        ${[['activos', 'Activos'], ['miembros', 'Miembros'], ['nomiembros', 'No miembros'], ['inactivos', 'Inactivos']].map(([k, l]) => `<label><input type="radio" name="ftipo" value="${k}" ${filtros.tipo === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}
      </div>
    </div>
    ${todos.length ? (lista.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Nombre</th><th>Nacimiento</th><th>Celular</th><th class="hide-sm">Correo</th><th></th></tr></thead>
      <tbody>${lista.map((i) => {
        const e = edad(i.fechaNacimiento, hoy);
        return `<tr class="${i.activo ? '' : 'inactive'}">
          <td><b>${esc(i.nombre)}</b>${i.esMiembro ? ' <span class="tag tag-verde">Miembro</span>' : ''}${i.notas ? `<br><small class="muted">${esc(i.notas)}</small>` : ''}</td>
          <td class="nowrap">${i.fechaNacimiento ? `${fecha(i.fechaNacimiento)}<br><small class="muted">${e} años</small>` : '<span class="falta">—</span>'}</td>
          <td class="nowrap">${i.celular ? `<a class="link" href="tel:${esc(i.celular.replace(/[^\d+]/g, ''))}">${esc(i.celular)}</a>` : '<span class="falta">—</span>'}</td>
          <td class="hide-sm">${i.email ? `<a class="link" href="mailto:${esc(i.email)}">${esc(i.email)}</a>` : '<span class="falta">—</span>'}</td>
          <td class="row-actions"><button class="icon-btn sm" data-edit="${i.id}" title="Editar">${icon('edit', 16)}</button></td>
        </tr>`;
      }).join('')}</tbody></table></div>` : emptyState('Nadie coincide con la búsqueda', 'search'))
    : emptyState(`Aún no hay ${lbl.toLowerCase()} en el listado. Usa <b>Agregar ${singular(m)}</b>.`, 'users')}
  </article>`;

  root.querySelector('[data-nuevo]').addEventListener('click', () => editarIntegrante(ctx, m));
  root.querySelector('[data-varios]')?.addEventListener('click', () => agregarVariosMiembros(ctx, m));
  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editarIntegrante(ctx, m, todos.find((i) => i.id === b.dataset.edit))));
  root.querySelectorAll('[name=ftipo]').forEach((r) => r.addEventListener('change', () => { filtros.tipo = r.value; renderIntegrantes(root, ctx, m, base, esTes); }));
  const qi = root.querySelector('[data-q]');
  qi.addEventListener('input', () => {
    clearTimeout(qi._t);
    qi._t = setTimeout(() => { filtros.q = qi.value; renderIntegrantes(root, ctx, m, base, esTes); const n = root.querySelector('[data-q]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250);
  });
}

// Elegir de una vez a varios miembros de la iglesia para el listado (solo tesorería, que ve el registro)
function agregarVariosMiembros(ctx, m) {
  const { data } = ctx;
  const porMat = m.porMatrimonio === 'si';
  const ya = new Set(integrantesDe(data, m.id).flatMap((i) => [i.esMiembro ? i.miembroId : '', i.conyugeEsMiembro ? i.miembroId2 : '']).filter(Boolean));
  const fichas = Object.fromEntries((data.miembros || []).map((x) => [x.id, x]));
  const enlace = Object.fromEntries((data.miembrosEnlace || []).map((x) => [x.id, x]));
  const vistos = new Set();
  const lista = (data.miembrosEnlace || []).filter((x) => !ya.has(x.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .filter((x) => {
      if (!porMat) return true;
      if (vistos.has(x.id)) return false;
      vistos.add(x.id);
      const c = enlace[x.conyugeId];
      if (c && c.conyugeId === x.id && !ya.has(c.id)) { vistos.add(c.id); x.pareja = c.nombre; }
      return true;
    })
    .map((x) => ({ ...x, nombre: x.pareja ? `${x.nombre} y ${x.pareja}` : x.nombre, edad: edad(fichas[x.id]?.fechaNacimiento, data.hoy) }));
  if (!lista.length) return toast('Todos los miembros activos ya están en el listado');
  return modal({
    title: `Agregar miembros · ${esc(etiquetaIntegrantes(m))}`,
    body: `
      <p class="muted small">Marca a los miembros de la iglesia que participan en ${esc(m.nombre)}. Quedan enlazados a su ficha: sus datos se toman de Miembros.${porMat ? ' Los matrimonios aparecen en una sola línea y entran juntos.' : ''}</p>
      <div class="pick-tools"><div class="search">${icon('search', 16)}<input type="search" placeholder="Buscar…" data-buscar></div>
        <select data-edad><option value="">Todas las edades</option><option value="25">Hasta 25 años</option><option value="30">Hasta 30 años</option><option value="35">Hasta 35 años</option></select>
        <button type="button" class="link-btn" data-todos>Marcar visibles</button><button type="button" class="link-btn" data-ninguno>Ninguno</button></div>
      <ul class="pick-list">${lista.map((x) => `<li data-nombre="${esc(sinTildes(x.nombre))}" data-edad="${x.edad ?? ''}"><label class="check"><input type="checkbox" name="mb" value="${x.id}"> ${esc(x.nombre)}${x.edad != null ? ` <small class="muted">· ${x.edad} años</small>` : ''}</label></li>`).join('')}</ul>
      <p class="muted small" data-cuenta></p>`,
    submitLabel: 'Agregar al listado',
    onOpen(f) {
      const cajas = [...f.querySelectorAll('[name=mb]')];
      const contar = () => { const n = cajas.filter((c) => c.checked).length; f.querySelector('[data-cuenta]').textContent = `${n} seleccionado${n === 1 ? '' : 's'}`; };
      const filtrar = () => {
        const q = sinTildes(f.querySelector('[data-buscar]').value);
        const max = +f.querySelector('[data-edad]').value || 0;
        f.querySelectorAll('.pick-list li').forEach((li) => {
          const e = li.dataset.edad === '' ? null : +li.dataset.edad;
          li.hidden = (q && !li.dataset.nombre.includes(q)) || (max && (e == null || e > max));
        });
      };
      cajas.forEach((c) => c.addEventListener('change', contar)); contar();
      f.querySelector('[data-buscar]').addEventListener('input', filtrar);
      f.querySelector('[data-edad]').addEventListener('change', filtrar);
      f.querySelector('[data-todos]').addEventListener('click', () => { cajas.forEach((c) => { if (!c.closest('li').hidden) c.checked = true; }); contar(); });
      f.querySelector('[data-ninguno]').addEventListener('click', () => { cajas.forEach((c) => { c.checked = false; }); contar(); });
    },
    async onSubmit(f) {
      const ids = [...f.querySelectorAll('[name=mb]')].filter((c) => c.checked).map((c) => c.value);
      if (!ids.length) throw new Error('Marca al menos un miembro');
      const r = await call('agregarMiembrosIntegrantes', { ministerioId: m.id, miembroIds: ids });
      const n = r.agregados + r.enlazados;
      toast(`${n} agregado${n === 1 ? '' : 's'} al listado${r.enlazados ? ` (${r.enlazados} ya estaba${r.enlazados === 1 ? '' : 'n'} y se enlazó)` : ''}`);
      await ctx.refresh();
    }
  });
}

function editarIntegrante(ctx, m, it = null) {
  const { data } = ctx;
  // Solo tesorería (quien ve el registro de Miembros) enlaza a un integrante con su ficha
  const puedeEnlazar = esAdmin(ctx.user);
  const enlazados = new Set(integrantesDe(data, m.id).filter((i) => i.miembroId && i.id !== it?.id).map((i) => i.miembroId));
  const opciones = (data.miembrosEnlace || []).filter((x) => !enlazados.has(x.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  // si su ficha de miembro ya no está activa, igual se muestra la opción actual
  if (it?.esMiembro && it.miembroId && !opciones.some((x) => x.id === it.miembroId)) opciones.unshift({ id: it.miembroId, nombre: it.nombre });
  const enlazado = !!it?.esMiembro;
  const porMat = m.porMatrimonio === 'si';
  const enlace = Object.fromEntries((data.miembrosEnlace || []).map((x) => [x.id, x]));
  const usados2 = new Set(integrantesDe(data, m.id).filter((i) => i.id !== it?.id).flatMap((i) => [i.miembroId, i.miembroId2]).filter(Boolean));
  const opciones2 = (data.miembrosEnlace || []).filter((x) => !usados2.has(x.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  if (it?.conyugeEsMiembro && it.miembroId2 && !opciones2.some((x) => x.id === it.miembroId2)) opciones2.unshift({ id: it.miembroId2, nombre: it.nombre2 });
  return modal({
    title: it ? `Ficha · ${esc(it.nombre)}` : `Agregar ${singular(m)}`,
    body: `
      ${puedeEnlazar ? `<label class="field"><span>¿Es miembro de la iglesia?</span>
        <select name="miembroId"><option value="">No es miembro (sin bautizar u otra iglesia)</option>${opciones.map((x) => `<option value="${x.id}" ${enlazado && x.id === it?.miembroId ? 'selected' : ''}>Sí · ${esc(x.nombre)}</option>`).join('')}</select>
        <small class="hint">Si es miembro, elígelo: sus datos se toman de su ficha en Miembros y no se registra dos veces.</small></label>`
        : `<input type="hidden" name="miembroId" value="${enlazado ? esc(it.miembroId) : ''}">${!it ? `<p class="muted small">Si se hace miembro de la iglesia, al registrarlo en Miembros con el mismo nombre queda enlazado solo.</p>` : ''}`}
      <div class="note" data-nota-miembro hidden>${icon('church', 16)}<span>${puedeEnlazar ? 'Nombre, contacto y fecha de nacimiento se toman de la ficha de Miembros (los actualiza secretaría o tesorería).' : 'Está enlazado a su ficha de Miembros: sus datos personales los administra secretaría o tesorería.'}</span></div>
      ${enlazado && it.faltan?.length ? `<div data-completar>
        <p class="muted small">${icon('alert', 13)} A su ficha de Miembros le falta${it.faltan.length > 1 ? 'n' : ''} ${it.faltan.map((k) => ({ celular: 'el celular', email: 'el correo', fechaNacimiento: 'la fecha de nacimiento' })[k]).join(', ').replace(/, ([^,]*)$/, ' y $1')}. Si lo sabes, complétalo aquí y quedará guardado en Miembros.</p>
        <div class="form-row">
          ${it.faltan.includes('celular') ? `<label class="field"><span>Celular</span><input name="cCelular" inputmode="tel" placeholder="+56 9 1234 5678" value="${esc(it.celular || '')}"></label>` : ''}
          ${it.faltan.includes('fechaNacimiento') ? `<label class="field"><span>Fecha de nacimiento</span><input type="date" name="cFechaNacimiento" max="${data.hoy}" value="${esc(it.fechaNacimiento || '')}"></label>` : ''}
        </div>
        ${it.faltan.includes('email') ? `<label class="field"><span>Correo</span><input type="email" name="cEmail" placeholder="nombre@correo.cl" value="${esc(it.email || '')}"></label>` : ''}
      </div>` : ''}
      <div data-propios>
        <label class="field"><span>${porMat ? 'Nombre y apellidos (esposo/a)' : 'Nombre y apellidos'}</span><input name="nombre" maxlength="80" value="${esc(it && !it.esMiembro ? (it.nombreBase ?? it.nombre) : '')}"></label>
        ${it && !it.esMiembro && it.miembroId ? '<p class="muted small">Su ficha de Miembros ya no existe: quedó como no miembro.</p>' : ''}
        <div class="form-row">
          <label class="field"><span>Celular</span><input name="celular" inputmode="tel" placeholder="+56 9 1234 5678" value="${esc(it && !it.esMiembro ? it.celular : '')}"></label>
          <label class="field"><span>Fecha de nacimiento</span><input type="date" name="fechaNacimiento" max="${data.hoy}" value="${esc(it && !it.esMiembro ? it.fechaNacimiento : '')}"></label>
        </div>
        <label class="field"><span>Correo</span><input type="email" name="email" placeholder="nombre@correo.cl" value="${esc(it && !it.esMiembro ? it.email : '')}"></label>
      </div>
      ${porMat ? `<div class="conyuge-integrante">
        ${puedeEnlazar ? `<label class="field"><span>💍 Cónyuge</span><select name="miembroId2"><option value="">No es miembro / sin cónyuge (escribe su nombre abajo)</option>${opciones2.map((x) => `<option value="${x.id}" ${it?.conyugeEsMiembro && x.id === it.miembroId2 ? 'selected' : ''}>Sí · ${esc(x.nombre)}</option>`).join('')}</select></label>`
          : `<input type="hidden" name="miembroId2" value="${it?.conyugeEsMiembro ? esc(it.miembroId2) : ''}">`}
        <label class="field" data-nombre2><span>Nombre del cónyuge <small class="muted">(vacío si viene solo o sola)</small></span><input name="nombre2" maxlength="80" value="${esc(it && !it.conyugeEsMiembro ? it.nombre2 || '' : '')}"></label>
        ${it?.conyugeEsMiembro && !puedeEnlazar ? `<p class="muted small">💍 Cónyuge: ${esc(it.nombre2)} (miembro de la iglesia)</p>` : ''}
      </div>` : ''}
      <label class="field"><span>Notas</span><input name="notas" maxlength="300" placeholder="Ej: contacto de su apoderado" value="${esc(it?.notas || '')}"></label>
      ${it ? `<label class="check"><input type="checkbox" name="activo" ${it.activo ? 'checked' : ''}> Activo en el ministerio</label>
      <button type="button" class="link-btn danger-link" data-borrar>${icon('trash', 14)} Eliminar del listado</button>` : ''}`,
    submitLabel: it ? 'Guardar' : 'Agregar',
    onOpen(f, { close }) {
      const sync = () => {
        const es = !!f.miembroId.value;
        f.querySelector('[data-propios]').hidden = es;
        f.querySelector('[data-nota-miembro]').hidden = !es;
        // completar datos de la ficha solo mientras siga enlazado al mismo miembro
        const comp = f.querySelector('[data-completar]');
        if (comp) comp.hidden = f.miembroId.value !== it.miembroId;
      };
      if (puedeEnlazar) f.miembroId.addEventListener('change', sync);
      sync();
      // ministerio por matrimonio: al elegir a un miembro casado se propone su cónyuge
      const sync2 = () => {
        const n2 = f.querySelector('[data-nombre2]');
        if (n2) n2.hidden = !!f.miembroId2?.value;
      };
      if (porMat) {
        if (puedeEnlazar) {
          f.miembroId.addEventListener('change', () => {
            const c = enlace[enlace[f.miembroId.value]?.conyugeId];
            if (c && !f.miembroId2.value && [...f.miembroId2.options].some((o) => o.value === c.id)) f.miembroId2.value = c.id;
            sync2();
          });
          f.miembroId2.addEventListener('change', sync2);
        }
        sync2();
      }
      f.querySelector('[data-borrar]')?.addEventListener('click', async () => {
        close(null);
        if (!(await confirmar(`¿Eliminar a <b>${esc(it.nombre)}</b> del listado? Si ya no participa, es mejor dejarlo inactivo.`, { boton: 'Eliminar', danger: true }))) return;
        try { await call('deleteIntegrante', { id: it.id }); toast('Eliminado del listado'); await ctx.refresh(); } catch (e) { toast(e.message, 'err'); }
      });
    },
    async onSubmit(f) {
      const d = formData(f);
      if (!d.miembroId && !d.nombre) throw new Error('Escribe el nombre');
      if (porMat && d.miembroId2) d.nombre2 = '';
      if (porMat && d.miembroId && d.miembroId === d.miembroId2) throw new Error('Elige a dos personas distintas');
      if (f.querySelector('[data-completar]') && d.miembroId === it?.miembroId) d.completar = { celular: d.cCelular || '', email: d.cEmail || '', fechaNacimiento: d.cFechaNacimiento || '' };
      delete d.cCelular; delete d.cEmail; delete d.cFechaNacimiento;
      d.ministerioId = m.id;
      if (it) { d.id = it.id; d.activo = f.activo.checked; }
      await call('saveIntegrante', d);
      toast(it ? 'Ficha actualizada' : 'Agregado al listado');
      await ctx.refresh();
    }
  });
}

// =================================================================
// Actividades
// =================================================================
function renderActividades(root, ctx, m, base, esTes) {
  const { data } = ctx;
  const acts = actividadesDe(data, m.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const res = acts.map((a) => ({ a, r: resumenActividad(data, a) }));
  const tot = res.reduce((s, x) => ({ ing: s.ing + x.r.ingresos, gas: s.gas + x.r.gastos }), { ing: 0, gas: 0 });

  root.innerHTML = `
  ${cabecera(m, base, esTes, 'actividades', 'Actividades', `<button class="btn btn-primary" data-nueva>${icon('plus', 16)} Nueva actividad</button>`)}
  <section class="kpis kpis-4">
    <article class="kpi"><span class="kpi-label">${icon('calendar', 15)} Actividades</span><strong class="kpi-value">${acts.length}</strong><span class="kpi-sub">${acts.filter((a) => a.estado !== 'cerrada').length} abiertas</span></article>
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:var(--green)"></i> Entradas</span><strong class="kpi-value">${money(tot.ing)}</strong><span class="kpi-sub">cuotas y otros ingresos</span></article>
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:var(--rose)"></i> Salidas</span><strong class="kpi-value">${money(tot.gas)}</strong><span class="kpi-sub">gastos de las actividades</span></article>
    <article class="kpi kpi-dark"><span class="kpi-label">Resultado</span><strong class="kpi-value">${money(tot.ing - tot.gas)}</strong><span class="kpi-sub">${tot.ing - tot.gas < 0 ? 'cubierto con la caja del ministerio' : 'entradas menos salidas'}</span></article>
  </section>
  ${acts.length ? `<section class="act-grid">${res.map(({ a, r }) => `
    <a class="card act-card" href="#/${base}/actividad/${a.id}">
      <div class="act-top"><div><h3>${esc(a.nombre)}</h3><span class="muted">${fecha(a.fecha)} · cuota ${a.cuota ? money(a.cuota) : 'sin cuota'}</span></div>${a.estado === 'cerrada' ? '<span class="badge st-open">Cerrada</span>' : '<span class="badge st-ok">Abierta</span>'}</div>
      <div class="act-stats">
        <div><span>Confirmados</span><b>${r.ins.length}</b></div>
        <div><span>Pagaron</span><b>${r.pagados}/${r.ins.length}</b></div>
        <div><span>Entradas</span><b class="ingreso">${money(r.ingresos)}</b></div>
        <div><span>Salidas</span><b class="gasto">${money(r.gastos)}</b></div>
      </div>
      <div class="act-res ${r.resultado < 0 ? 'neg' : ''}"><span>Resultado</span><b>${money(r.resultado)}</b></div>
    </a>`).join('')}</section>`
    : `<article class="card">${emptyState('Aún no hay actividades. Crea una con <b>Nueva actividad</b>: defines la cuota, eliges a los confirmados y registras quién pagó.', 'sparkle')}</article>`}`;

  root.querySelector('[data-nueva]').addEventListener('click', () => editarActividad(ctx, m, base));
}

function editarActividad(ctx, m, base, a = null) {
  return modal({
    title: a ? 'Editar actividad' : 'Nueva actividad',
    body: `
      <label class="field"><span>Nombre</span><input name="nombre" maxlength="80" required placeholder="Ej: Campamento de verano" value="${esc(a?.nombre || '')}"></label>
      <div class="form-row">
        <label class="field"><span>Fecha de la actividad</span><input type="date" name="fecha" required value="${esc(a?.fecha || ctx.data.hoy)}"></label>
        <label class="field"><span>Cuota por persona ($)</span><input name="cuota" inputmode="numeric" placeholder="0 = sin cuota" value="${a?.cuota ? a.cuota.toLocaleString('es-CL') : ''}"></label>
      </div>
      <label class="field"><span>Descripción (opcional)</span><input name="descripcion" maxlength="300" value="${esc(a?.descripcion || '')}"></label>
      ${a ? `<label class="field"><span>Estado</span><select name="estado"><option value="abierta" ${a.estado !== 'cerrada' ? 'selected' : ''}>Abierta</option><option value="cerrada" ${a.estado === 'cerrada' ? 'selected' : ''}>Cerrada (terminada)</option></select></label>` : ''}`,
    submitLabel: a ? 'Guardar' : 'Crear actividad',
    onOpen(f) { formatoPesos(f.cuota); },
    async onSubmit(f) {
      const d = formData(f);
      d.cuota = pesos(d.cuota);
      d.ministerioId = m.id;
      if (a) d.id = a.id;
      const r = await call('saveActividad', d);
      toast(a ? 'Actividad actualizada' : 'Actividad creada');
      if (!a) location.hash = `#/${base}/actividad/${r.id}`;
      await ctx.refresh();
    }
  });
}

function renderActividad(root, ctx, m, base, esTes, aid) {
  const { data } = ctx;
  const a = actividadesDe(data, m.id).find((x) => x.id === aid);
  if (!a) {
    root.innerHTML = `${cabecera(m, base, esTes, 'actividades', 'Actividades')}${emptyState('Actividad no encontrada', 'alert')}`;
    return;
  }
  const r = resumenActividad(data, a);
  const integ = Object.fromEntries(integrantesDe(data, m.id).map((i) => [i.id, i]));
  const activosTot = integrantesDe(data, m.id).filter((i) => i.activo).length;
  const ins = [...r.ins].sort((x, y) => (integ[x.integranteId]?.nombre || '').localeCompare(integ[y.integranteId]?.nombre || '', 'es'));
  const cuotasMovs = r.movs.filter((x) => x.origen === 'cuota');
  const otros = r.movs.filter((x) => x.origen !== 'cuota').sort((x, y) => (y.fecha + y.creadoEn).localeCompare(x.fecha + x.creadoEn));
  const lbl = etiquetaIntegrantes(m).toLowerCase();
  // Para el líder, los meses con rendición enviada o aprobada quedan cerrados (igual que en Finanzas)
  const mesAbierto = (mes) => esTes || ['abierta', 'observada'].includes(rendicionDe(data, m.id, mes)?.estado || 'abierta');
  const hoyAbierto = mesAbierto(data.hoy.slice(0, 7));

  root.innerHTML = `
  ${cabecera(m, base, esTes, 'actividades', esc(a.nombre), `
    <button class="btn btn-ghost" data-editar>${icon('edit', 16)} Editar</button>
    <button class="btn btn-ghost danger-txt" data-eliminar>${icon('trash', 16)} Eliminar</button>`)}
  <p class="act-meta"><span class="am-item">${icon('clock', 15)} ${cap(fecha(a.fecha))}</span><span class="am-item">Cuota ${a.cuota ? `<b>${money(a.cuota)}</b> por persona` : '<b>sin cuota</b>'}</span><span class="am-item">${a.estado === 'cerrada' ? '<span class="badge st-open">Cerrada</span>' : '<span class="badge st-ok">Abierta</span>'}</span>${a.descripcion ? `<span class="am-desc muted">${esc(a.descripcion)}</span>` : ''}</p>
  <section class="kpis kpis-4">
    <article class="kpi"><span class="kpi-label">${icon('users', 15)} Confirmados</span><strong class="kpi-value">${r.ins.length}</strong><span class="kpi-sub">de ${activosTot} ${lbl} activos</span></article>
    <article class="kpi"><span class="kpi-label">${icon('checkCircle', 15)} Cuotas pagadas</span><strong class="kpi-value">${r.pagados} <small class="kpi-pct">de ${r.ins.length}</small></strong><span class="kpi-sub">recaudado ${money(r.cuotas)}${r.porCobrar ? ` · falta <b>${money(r.porCobrar)}</b>` : ''}</span></article>
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:var(--rose)"></i> Gastos</span><strong class="kpi-value">${money(r.gastos)}</strong><span class="kpi-sub">${r.otrosIngresos ? `otros ingresos ${money(r.otrosIngresos)}` : 'asociados a la actividad'}</span></article>
    <article class="kpi kpi-dark"><span class="kpi-label">Resultado de la actividad</span><strong class="kpi-value">${money(r.resultado)}</strong><span class="kpi-sub">${r.resultado < 0 ? 'la diferencia sale de la caja del ministerio' : 'entradas menos salidas'}</span></article>
  </section>

  <section class="grid-2-1">
    <article class="card">
      <header class="card-head wrap"><div><h3>Confirmados</h3><p class="muted">Registra el pago cuando cada uno entregue su cuota: entra como ingreso del ministerio con esa fecha</p></div>
        <button class="btn btn-primary btn-sm" data-confirmar>${icon('users', 16)} Elegir confirmados</button></header>
      ${ins.length ? `<ul class="ins-list">${ins.map((x) => {
        const i = integ[x.integranteId];
        return `<li>
          <div><b>${esc(i?.nombre || '—')}</b>${i?.esMiembro ? ' <span class="tag tag-verde">Miembro</span>' : ''}${i?.celular ? `<br><small class="muted">${esc(i.celular)}</small>` : ''}</div>
          ${x.movId ? `<div class="ins-pago"><span class="badge st-ok">${icon('check', 13)} Pagó ${money(x.pagoMonto)}</span><small class="muted">${fecha(x.fechaPago)}</small>${mesAbierto(x.fechaPago.slice(0, 7)) ? `<button class="link-btn" data-anular="${x.id}">Anular</button>` : `<small class="muted" title="La rendición de ese mes ya fue enviada">${icon('lock', 12)} mes cerrado</small>`}</div>`
            : `<div class="ins-pago"><span class="badge st-obs">Pendiente</span>${hoyAbierto ? `<button class="btn btn-soft-green btn-sm" data-pagar="${x.id}">${icon('down', 15)} Registrar pago</button>` : ''}</div>`}
        </li>`;
      }).join('')}</ul>` : emptyState(`Aún no hay confirmados. Usa <b>Elegir confirmados</b> para marcarlos desde el listado de ${lbl}.`, 'users')}
    </article>

    <article class="card">
      <header class="card-head wrap"><div><h3>Entradas y salidas</h3><p class="muted">Todo queda también en las finanzas del ministerio</p></div>
        ${hoyAbierto ? `<div class="head-actions"><button class="btn btn-primary btn-sm" data-mov="gasto">${icon('camera', 15)} Gasto</button><button class="btn btn-soft-green btn-sm" data-mov="ingreso">${icon('plus', 15)} Otro ingreso</button></div>` : ''}</header>
      ${hoyAbierto ? '' : `<div class="note">${icon('lock', 16)}<span>La rendición de ${mesLargo(data.hoy.slice(0, 7))} ya fue enviada: no se pueden registrar pagos ni gastos hasta que el tesorero la observe o comience el mes siguiente.</span></div>`}
      <ul class="mov-list">
        ${cuotasMovs.length ? `<li><span class="ml-ico ingreso">${icon('users', 16)}</span><div class="ml-main"><strong>Cuotas pagadas</strong><span>${cuotasMovs.length} pago${cuotasMovs.length > 1 ? 's' : ''}</span></div><div class="ml-right"><b class="ingreso">+${money(r.cuotas)}</b></div></li>` : ''}
        ${otros.map((x) => `<li>
          <span class="ml-ico ${x.tipo}">${icon(x.tipo === 'ingreso' ? 'down' : 'up', 16)}</span>
          <div class="ml-main"><strong>${esc(x.descripcion || x.categoria)}</strong><span>${esc(x.categoria)} · ${fecha(x.fecha)}</span></div>
          <div class="ml-right"><b class="${x.tipo}">${x.tipo === 'ingreso' ? '+' : '−'}${money(x.monto)}</b>
            <div class="ml-actions">${x.tipo === 'gasto' && !x.archivoId ? `<span class="chip-warn">${icon('alert', 13)} Sin boleta</span>` : ''}${mesAbierto(x.mes) ? `<button class="icon-btn sm" data-edit="${x.id}" title="Editar">${icon('edit', 15)}</button><button class="icon-btn sm danger" data-del="${x.id}" title="Eliminar">${icon('trash', 15)}</button>` : ''}</div></div>
        </li>`).join('')}
      </ul>
      ${!r.movs.length ? emptyState('Sin entradas ni salidas todavía', 'receipt') : ''}
      <div class="act-tot">
        <div><span>Entradas</span><b class="ingreso">${money(r.ingresos)}</b></div>
        <div><span>Salidas</span><b class="gasto">${money(r.gastos)}</b></div>
        <div class="${r.resultado < 0 ? 'neg' : ''}"><span>Resultado</span><b>${money(r.resultado)}</b></div>
      </div>
    </article>
  </section>`;

  const accion = async (act, payload, ok) => {
    try { await call(act, payload); toast(ok); await ctx.refresh(); } catch (e) { toast(e.message, 'err'); }
  };
  root.querySelector('[data-editar]').addEventListener('click', () => editarActividad(ctx, m, base, a));
  root.querySelector('[data-eliminar]').addEventListener('click', async () => {
    if (r.movs.length) return toast('La actividad tiene pagos o gastos registrados. Anúlalos o elimínalos antes de borrarla.', 'err');
    if (!(await confirmar(`¿Eliminar la actividad <b>${esc(a.nombre)}</b> y su lista de confirmados?`, { boton: 'Eliminar', danger: true }))) return;
    try { await call('deleteActividad', { id: a.id }); toast('Actividad eliminada'); location.hash = `#/${base}/actividades`; await ctx.refresh(); } catch (e) { toast(e.message, 'err'); }
  });
  root.querySelector('[data-confirmar]').addEventListener('click', () => elegirConfirmados(ctx, m, a, r));
  root.querySelectorAll('[data-pagar]').forEach((b) => b.addEventListener('click', () => {
    const x = r.ins.find((y) => y.id === b.dataset.pagar);
    registrarPago(ctx, a, x, integ[x.integranteId], mesAbierto);
  }));
  root.querySelectorAll('[data-anular]').forEach((b) => b.addEventListener('click', async () => {
    const x = r.ins.find((y) => y.id === b.dataset.anular);
    if (!(await confirmar(`Se anulará el pago de <b>${esc(integ[x.integranteId]?.nombre || '')}</b> por <b>${money(x.pagoMonto)}</b> y se quitará el ingreso del ${fecha(x.fechaPago)} de las finanzas del ministerio.`, { boton: 'Anular pago', danger: true }))) return;
    await accion('anularPagoCuota', { inscripcionId: x.id }, 'Pago anulado');
  }));
  const formMov = (tipo, mov) => abrirFormMovimiento({
    ctx, ambito: 'ministerio', tipo, mov, ministerioId: esTes ? m.id : undefined, extra: { actividadId: a.id },
    action: mov ? 'updateMovMinisterio' : 'addMovMinisterio',
    titulo: mov ? 'Editar movimiento' : tipo === 'gasto' ? `Gasto · ${a.nombre}` : `Ingreso · ${a.nombre}`
  });
  root.querySelectorAll('[data-mov]').forEach((b) => b.addEventListener('click', () => formMov(b.dataset.mov)));
  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => formMov(null, r.movs.find((x) => x.id === b.dataset.edit))));
  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const x = r.movs.find((y) => y.id === b.dataset.del);
    if (!(await confirmar(`Se eliminará <b>${esc(x.descripcion || x.categoria)}</b> por <b>${money(x.monto)}</b>.`, { boton: 'Eliminar', danger: true }))) return;
    await accion('deleteMovMinisterio', { id: x.id }, 'Movimiento eliminado');
  }));
}

function elegirConfirmados(ctx, m, a, r) {
  const ya = new Map(r.ins.map((x) => [x.integranteId, x]));
  const lista = integrantesDe(ctx.data, m.id).filter((i) => i.activo || ya.has(i.id)).sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
  if (!lista.length) return toast(`Primero agrega ${etiquetaIntegrantes(m).toLowerCase()} al listado`, 'err');
  return modal({
    title: `Confirmados · ${esc(a.nombre)}`,
    body: `
      <div class="pick-tools"><div class="search">${icon('search', 16)}<input type="search" placeholder="Buscar…" data-buscar></div>
        <button type="button" class="link-btn" data-todos>Marcar todos</button><button type="button" class="link-btn" data-ninguno>Ninguno</button></div>
      <ul class="pick-list">${lista.map((i) => {
        const x = ya.get(i.id);
        return `<li data-nombre="${esc(sinTildes(i.nombre))}"><label class="check"><input type="checkbox" name="i" value="${i.id}" ${x ? 'checked' : ''} ${x?.movId ? 'disabled data-pagado' : ''}> ${esc(i.nombre)}${x?.movId ? ' <small class="muted">· ya pagó</small>' : ''}${!i.activo ? ' <small class="muted">· inactivo</small>' : ''}</label></li>`;
      }).join('')}</ul>
      <p class="muted small" data-cuenta></p>`,
    submitLabel: 'Guardar confirmados',
    onOpen(f) {
      const cajas = [...f.querySelectorAll('[name=i]')];
      const contar = () => { f.querySelector('[data-cuenta]').textContent = `${cajas.filter((c) => c.checked).length} confirmados`; };
      cajas.forEach((c) => c.addEventListener('change', contar)); contar();
      f.querySelector('[data-buscar]').addEventListener('input', (e) => {
        const q = sinTildes(e.target.value);
        f.querySelectorAll('.pick-list li').forEach((li) => { li.hidden = q && !li.dataset.nombre.includes(q); });
      });
      f.querySelector('[data-todos]').addEventListener('click', () => { cajas.forEach((c) => { if (!c.closest('li').hidden) c.checked = true; }); contar(); });
      f.querySelector('[data-ninguno]').addEventListener('click', () => { cajas.forEach((c) => { if (!c.disabled && !c.closest('li').hidden) c.checked = false; }); contar(); });
    },
    async onSubmit(f) {
      const ids = [...f.querySelectorAll('[name=i]')].filter((c) => c.checked).map((c) => c.value);
      const res = await call('setConfirmados', { actividadId: a.id, integranteIds: ids });
      toast(`${res.confirmados} confirmados`);
      await ctx.refresh();
    }
  });
}

function registrarPago(ctx, a, ins, it, mesAbierto = () => true) {
  return modal({
    title: `Pago de cuota · ${esc(it?.nombre || '')}`,
    body: `
      <div class="form-row">
        <label class="field"><span>Monto ($)</span><input name="monto" inputmode="numeric" class="input-money" value="${a.cuota ? a.cuota.toLocaleString('es-CL') : ''}" required></label>
        <label class="field"><span>Fecha en que pagó</span><input type="date" name="fecha" value="${ctx.data.hoy}" max="${ctx.data.hoy}" required></label>
      </div>
      <p class="muted small">Se registra como ingreso del ministerio (“Cuota de actividad”) en esa fecha, y queda en la rendición de ese mes.</p>`,
    submitLabel: 'Registrar pago',
    onOpen(f) { formatoPesos(f.monto); },
    async onSubmit(f) {
      const d = formData(f);
      const monto = pesos(d.monto);
      if (!monto) throw new Error('Ingresa el monto');
      if (d.fecha && !mesAbierto(d.fecha.slice(0, 7))) throw new Error(`La rendición de ${mesLargo(d.fecha.slice(0, 7))} ya fue enviada: elige una fecha de un mes abierto.`);
      await call('registrarPagoCuota', { inscripcionId: ins.id, monto, fecha: d.fecha });
      toast(`Pago registrado en ${mesLargo(d.fecha.slice(0, 7))}`);
      await ctx.refresh();
    }
  });
}
