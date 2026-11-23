// Actividades de la tesorería general (aniversario, retiro, venta…): cuota, confirmados (miembros de la iglesia),
// pagos y gastos. Las cuotas entran como ingreso "Actividades" de la tesorería general; los gastos de la actividad
// son movimientos de la tesorería asociados a ella.
import { icon, esc, money, fecha, modal, formData, toast, confirmar, emptyState, pesos, formatoPesos, cap, sinTildes, coincide } from '../ui.js';
import { call } from '../api.js';
import { abrirFormMovimiento } from './movform.js';
import { activoHoy } from './miembros.js';

export const actividadesGenerales = (data) => (data.actividades || []).filter((a) => !a.ministerioId);

export function resumenActividadGeneral(data, a) {
  const ins = (data.inscripciones || []).filter((x) => x.actividadId === a.id);
  const movs = data.movGenerales.filter((x) => x.actividadId === a.id);
  const suma = (l) => l.reduce((s, x) => s + x.monto, 0);
  const cuotas = suma(movs.filter((x) => x.origen === 'cuota'));
  const otrosIngresos = suma(movs.filter((x) => x.tipo === 'ingreso' && x.origen !== 'cuota'));
  const gastos = suma(movs.filter((x) => x.tipo === 'gasto'));
  const pagados = ins.filter((x) => x.movId).length;
  return { ins, movs, cuotas, otrosIngresos, gastos, pagados, ingresos: cuotas + otrosIngresos, resultado: cuotas + otrosIngresos - gastos, porCobrar: (ins.length - pagados) * (a.cuota || 0) };
}

// Pestañas de la tesorería general (Libro · Actividades)
export function tabsTesoreria(activo) {
  const t = [['', 'Movimientos', 'wallet'], ['actividades', 'Actividades', 'calendar']];
  return `<nav class="min-tabs" aria-label="Secciones de la tesorería">${t.map(([k, l, ic]) => `<a href="#/general${k ? '/' + k : ''}" class="${activo === k ? 'active' : ''}">${icon(ic, 16)} ${l}</a>`).join('')}</nav>`;
}
const cabecera = (activo, titulo, acciones = '', volver = false) => `
  ${volver ? `<a class="back" href="#/general/actividades">${icon('chevL', 16)} Actividades</a>` : ''}
  <section class="page-head">
    <div><span class="eyebrow">Tesorería general</span><h1>${titulo}</h1></div>
    <div class="head-actions">${acciones}</div>
  </section>
  ${tabsTesoreria(activo)}`;

export function renderSeccion(root, ctx) {
  const [sub, id] = ctx.params || [];
  if (sub === 'actividad' && id) return renderActividad(root, ctx, id);
  return renderLista(root, ctx);
}

function renderLista(root, ctx) {
  const { data } = ctx;
  const acts = actividadesGenerales(data).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const res = acts.map((a) => ({ a, r: resumenActividadGeneral(data, a) }));
  const tot = res.reduce((s, x) => ({ ing: s.ing + x.r.ingresos, gas: s.gas + x.r.gastos }), { ing: 0, gas: 0 });
  root.innerHTML = `
  ${cabecera('actividades', 'Actividades', `<button class="btn btn-primary" data-nueva>${icon('plus', 16)} Nueva actividad</button>`)}
  <section class="kpis kpis-4">
    <article class="kpi"><span class="kpi-label">${icon('calendar', 15)} Actividades</span><strong class="kpi-value">${acts.length}</strong><span class="kpi-sub">${acts.filter((a) => a.estado !== 'cerrada').length} abiertas</span></article>
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:var(--green)"></i> Entradas</span><strong class="kpi-value">${money(tot.ing)}</strong><span class="kpi-sub">cuotas y otros ingresos</span></article>
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:var(--rose)"></i> Salidas</span><strong class="kpi-value">${money(tot.gas)}</strong><span class="kpi-sub">gastos de las actividades</span></article>
    <article class="kpi kpi-dark"><span class="kpi-label">Resultado</span><strong class="kpi-value">${money(tot.ing - tot.gas)}</strong><span class="kpi-sub">${tot.ing - tot.gas < 0 ? 'cubierto con la caja de la iglesia' : 'entradas menos salidas'}</span></article>
  </section>
  ${acts.length ? `<section class="act-grid">${res.map(({ a, r }) => `
    <a class="card act-card" href="#/general/actividad/${a.id}">
      <div class="act-top"><div><h3>${esc(a.nombre)}</h3><span class="muted">${fecha(a.fecha)} · cuota ${a.cuota ? money(a.cuota) : 'sin cuota'}</span></div>${a.estado === 'cerrada' ? '<span class="badge st-open">Cerrada</span>' : '<span class="badge st-ok">Abierta</span>'}</div>
      <div class="act-stats">
        <div><span>Confirmados</span><b>${r.ins.length}</b></div>
        <div><span>Pagaron</span><b>${r.pagados}/${r.ins.length}</b></div>
        <div><span>Entradas</span><b class="ingreso">${money(r.ingresos)}</b></div>
        <div><span>Salidas</span><b class="gasto">${money(r.gastos)}</b></div>
      </div>
      <div class="act-res ${r.resultado < 0 ? 'neg' : ''}"><span>Resultado</span><b>${money(r.resultado)}</b></div>
    </a>`).join('')}</section>`
    : `<article class="card">${emptyState('Aún no hay actividades de la iglesia. Crea una con <b>Nueva actividad</b> (aniversario, retiro, venta…): defines la cuota, eliges a los miembros confirmados y registras quién pagó. Sus gastos e ingresos quedan en la tesorería general.', 'sparkle')}</article>`}`;
  root.querySelector('[data-nueva]').addEventListener('click', () => editarActividad(ctx));
}

function editarActividad(ctx, a = null) {
  return modal({
    title: a ? 'Editar actividad' : 'Nueva actividad de la iglesia',
    body: `
      <label class="field"><span>Nombre</span><input name="nombre" maxlength="80" required placeholder="Ej: Aniversario de la iglesia" value="${esc(a?.nombre || '')}"></label>
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
      d.general = true;
      if (a) d.id = a.id;
      const r = await call('saveActividad', d);
      toast(a ? 'Actividad actualizada' : 'Actividad creada');
      // primero se recargan los datos y después se abre la actividad nueva (así ya existe al mostrarla)
      await ctx.refresh();
      if (!a) location.hash = `#/general/actividad/${r.id}`;
    }
  });
}

function renderActividad(root, ctx, aid) {
  const { data } = ctx;
  const a = actividadesGenerales(data).find((x) => x.id === aid);
  if (!a) { root.innerHTML = `${cabecera('actividades', 'Actividades', '', true)}${emptyState('Actividad no encontrada', 'alert')}`; return; }
  const r = resumenActividadGeneral(data, a);
  const mb = Object.fromEntries(data.miembros.map((m) => [m.id, m]));
  const activosTot = data.miembros.filter((m) => activoHoy(m, data.hoy)).length;
  const ins = [...r.ins].sort((x, y) => (mb[x.miembroId]?.nombre || '').localeCompare(mb[y.miembroId]?.nombre || '', 'es'));
  const cuotasMovs = r.movs.filter((x) => x.origen === 'cuota');
  const otros = r.movs.filter((x) => x.origen !== 'cuota').sort((x, y) => (y.fecha + y.creadoEn).localeCompare(x.fecha + x.creadoEn));

  root.innerHTML = `
  ${cabecera('actividades', esc(a.nombre), `
    <button class="btn btn-ghost" data-editar>${icon('edit', 16)} Editar</button>
    <button class="btn btn-ghost danger-txt" data-eliminar>${icon('trash', 16)} Eliminar</button>`, true)}
  <p class="act-meta"><span class="am-item">${icon('clock', 15)} ${cap(fecha(a.fecha))}</span><span class="am-item">Cuota ${a.cuota ? `<b>${money(a.cuota)}</b> por persona` : '<b>sin cuota</b>'}</span><span class="am-item">${a.estado === 'cerrada' ? '<span class="badge st-open">Cerrada</span>' : '<span class="badge st-ok">Abierta</span>'}</span>${a.descripcion ? `<span class="am-desc muted">${esc(a.descripcion)}</span>` : ''}</p>
  <section class="kpis kpis-4">
    <article class="kpi"><span class="kpi-label">${icon('users', 15)} Confirmados</span><strong class="kpi-value">${r.ins.length}</strong><span class="kpi-sub">de ${activosTot} miembros activos</span></article>
    <article class="kpi"><span class="kpi-label">${icon('checkCircle', 15)} Cuotas pagadas</span><strong class="kpi-value">${r.pagados} <small class="kpi-pct">de ${r.ins.length}</small></strong><span class="kpi-sub">recaudado ${money(r.cuotas)}${r.porCobrar ? ` · falta <b>${money(r.porCobrar)}</b>` : ''}</span></article>
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:var(--rose)"></i> Gastos</span><strong class="kpi-value">${money(r.gastos)}</strong><span class="kpi-sub">${r.otrosIngresos ? `otros ingresos ${money(r.otrosIngresos)}` : 'asociados a la actividad'}</span></article>
    <article class="kpi kpi-dark"><span class="kpi-label">Resultado de la actividad</span><strong class="kpi-value">${money(r.resultado)}</strong><span class="kpi-sub">${r.resultado < 0 ? 'la diferencia sale de la caja de la iglesia' : 'entradas menos salidas'}</span></article>
  </section>

  <section class="grid-2-1">
    <article class="card">
      <header class="card-head wrap"><div><h3>Confirmados</h3><p class="muted">Registra el pago cuando cada uno entregue su cuota: entra como ingreso “Actividades” de la tesorería general con esa fecha</p></div>
        <button class="btn btn-primary btn-sm" data-confirmar>${icon('users', 16)} Elegir confirmados</button></header>
      ${ins.length ? `<ul class="ins-list">${ins.map((x) => {
        const m = mb[x.miembroId];
        return `<li>
          <div><b>${esc(m?.nombre || '—')}</b>${m?.celular ? `<br><small class="muted">${esc(m.celular)}</small>` : ''}</div>
          ${x.movId ? `<div class="ins-pago"><span class="badge st-ok">${icon('check', 13)} Pagó ${money(x.pagoMonto)}</span><small class="muted">${fecha(x.fechaPago)}</small><button class="link-btn" data-anular="${x.id}">Anular</button></div>`
            : `<div class="ins-pago"><span class="badge st-obs">Pendiente</span><button class="btn btn-soft-green btn-sm" data-pagar="${x.id}">${icon('down', 15)} Registrar pago</button></div>`}
        </li>`;
      }).join('')}</ul>` : emptyState('Aún no hay confirmados. Usa <b>Elegir confirmados</b> para marcarlos desde la lista de miembros.', 'users')}
    </article>

    <article class="card">
      <header class="card-head wrap"><div><h3>Entradas y salidas</h3><p class="muted">Todo queda también en el libro de la tesorería general</p></div>
        <div class="head-actions"><button class="btn btn-primary btn-sm" data-mov="gasto">${icon('camera', 15)} Gasto</button><button class="btn btn-soft-green btn-sm" data-mov="ingreso">${icon('plus', 15)} Otro ingreso</button></div></header>
      <ul class="mov-list">
        ${cuotasMovs.length ? `<li><span class="ml-ico ingreso">${icon('users', 16)}</span><div class="ml-main"><strong>Cuotas pagadas</strong><span>${cuotasMovs.length} pago${cuotasMovs.length > 1 ? 's' : ''}</span></div><div class="ml-right"><b class="ingreso">+${money(r.cuotas)}</b></div></li>` : ''}
        ${otros.map((x) => `<li>
          <span class="ml-ico ${x.tipo}">${icon(x.tipo === 'ingreso' ? 'down' : 'up', 16)}</span>
          <div class="ml-main"><strong>${esc(x.descripcion || x.categoria)}</strong><span>${esc(x.categoria)} · ${fecha(x.fecha)}</span></div>
          <div class="ml-right"><b class="${x.tipo}">${x.tipo === 'ingreso' ? '+' : '−'}${money(x.monto)}</b>
            <div class="ml-actions">${x.origen === 'manual' || x.origen === 'importado' ? `<button class="icon-btn sm" data-edit="${x.id}" title="Editar">${icon('edit', 15)}</button><button class="icon-btn sm danger" data-del="${x.id}" title="Eliminar">${icon('trash', 15)}</button>` : ''}</div></div>
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
  root.querySelector('[data-editar]').addEventListener('click', () => editarActividad(ctx, a));
  root.querySelector('[data-eliminar]').addEventListener('click', async () => {
    if (r.movs.length) return toast('La actividad tiene pagos o gastos registrados. Anúlalos o elimínalos antes de borrarla.', 'err');
    if (!(await confirmar(`¿Eliminar la actividad <b>${esc(a.nombre)}</b> y su lista de confirmados?`, { boton: 'Eliminar', danger: true }))) return;
    try { await call('deleteActividad', { id: a.id }); toast('Actividad eliminada'); location.hash = '#/general/actividades'; await ctx.refresh(); } catch (e) { toast(e.message, 'err'); }
  });
  root.querySelector('[data-confirmar]').addEventListener('click', () => elegirConfirmados(ctx, a, r));
  root.querySelectorAll('[data-pagar]').forEach((b) => b.addEventListener('click', () => {
    const x = r.ins.find((y) => y.id === b.dataset.pagar);
    registrarPago(ctx, a, x, mb[x.miembroId]);
  }));
  root.querySelectorAll('[data-anular]').forEach((b) => b.addEventListener('click', async () => {
    const x = r.ins.find((y) => y.id === b.dataset.anular);
    if (!(await confirmar(`Se anulará el pago de <b>${esc(mb[x.miembroId]?.nombre || '')}</b> por <b>${money(x.pagoMonto)}</b> y se quitará su ingreso del ${fecha(x.fechaPago)} de la tesorería general.`, { boton: 'Anular pago', danger: true }))) return;
    await accion('anularPagoCuota', { inscripcionId: x.id }, 'Pago anulado');
  }));
  const formMov = (tipo, mov) => abrirFormMovimiento({
    ctx, ambito: 'general', tipo, mov, extra: { actividadId: a.id },
    action: mov ? 'updateMovGeneral' : 'addMovGeneral',
    titulo: mov ? 'Editar movimiento' : tipo === 'gasto' ? `Gasto · ${a.nombre}` : `Ingreso · ${a.nombre}`
  });
  root.querySelectorAll('[data-mov]').forEach((b) => b.addEventListener('click', () => formMov(b.dataset.mov)));
  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => formMov(null, r.movs.find((x) => x.id === b.dataset.edit))));
  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const x = r.movs.find((y) => y.id === b.dataset.del);
    if (!(await confirmar(`Se eliminará <b>${esc(x.descripcion || x.categoria)}</b> por <b>${money(x.monto)}</b> de la tesorería general.`, { boton: 'Eliminar', danger: true }))) return;
    await accion('deleteMovGeneral', { id: x.id }, 'Movimiento eliminado');
  }));
}

function elegirConfirmados(ctx, a, r) {
  const ya = new Map(r.ins.map((x) => [x.miembroId, x]));
  const lista = ctx.data.miembros.filter((m) => activoHoy(m, ctx.data.hoy) || ya.has(m.id)).sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
  if (!lista.length) return toast('Primero registra a los miembros de la iglesia', 'err');
  return modal({
    title: `Confirmados · ${esc(a.nombre)}`,
    body: `
      <div class="pick-tools"><div class="search">${icon('search', 16)}<input type="search" placeholder="Buscar…" data-buscar></div>
        <button type="button" class="link-btn" data-todos>Marcar visibles</button><button type="button" class="link-btn" data-ninguno>Ninguno</button></div>
      <ul class="pick-list">${lista.map((m) => {
        const x = ya.get(m.id);
        return `<li data-nombre="${esc(sinTildes(m.nombre))}"><label class="check"><input type="checkbox" name="i" value="${m.id}" ${x ? 'checked' : ''} ${x?.movId ? 'disabled' : ''}> ${esc(m.nombre)}${x?.movId ? ' <small class="muted">· ya pagó</small>' : ''}${m.estado !== 'activo' ? ` <small class="muted">· ${esc(m.estado)}</small>` : ''}</label></li>`;
      }).join('')}</ul>
      <p class="muted small" data-cuenta></p>`,
    submitLabel: 'Guardar confirmados',
    onOpen(f) {
      const cajas = [...f.querySelectorAll('[name=i]')];
      const contar = () => { f.querySelector('[data-cuenta]').textContent = `${cajas.filter((c) => c.checked).length} confirmados`; };
      cajas.forEach((c) => c.addEventListener('change', contar)); contar();
      f.querySelector('[data-buscar]').addEventListener('input', (e) => {
        const q = sinTildes(e.target.value);
        f.querySelectorAll('.pick-list li').forEach((li) => { li.hidden = q && !coincide(li.dataset.nombre, q); });
      });
      f.querySelector('[data-todos]').addEventListener('click', () => { cajas.forEach((c) => { if (!c.closest('li').hidden) c.checked = true; }); contar(); });
      f.querySelector('[data-ninguno]').addEventListener('click', () => { cajas.forEach((c) => { if (!c.disabled && !c.closest('li').hidden) c.checked = false; }); contar(); });
    },
    async onSubmit(f) {
      const ids = [...f.querySelectorAll('[name=i]')].filter((c) => c.checked).map((c) => c.value);
      const res = await call('setConfirmados', { actividadId: a.id, miembroIds: ids });
      toast(`${res.confirmados} confirmados`);
      await ctx.refresh();
    }
  });
}

function registrarPago(ctx, a, ins, m) {
  return modal({
    title: `Pago de cuota · ${esc(m?.nombre || '')}`,
    body: `
      <div class="form-row">
        <label class="field"><span>Monto ($)</span><input name="monto" inputmode="numeric" class="input-money" value="${a.cuota ? a.cuota.toLocaleString('es-CL') : ''}" required></label>
        <label class="field"><span>Fecha en que pagó</span><input type="date" name="fecha" value="${ctx.data.hoy}" max="${ctx.data.hoy}" required></label>
      </div>
      <label class="field"><span>Medio</span><select name="medio">${ctx.data.medios.map((x) => `<option>${x}</option>`).join('')}</select></label>
      <p class="muted small">Se registra como ingreso “Actividades” de la tesorería general en esa fecha.</p>`,
    submitLabel: 'Registrar pago',
    onOpen(f) { formatoPesos(f.monto); },
    async onSubmit(f) {
      const d = formData(f);
      const monto = pesos(d.monto);
      if (!monto) throw new Error('Ingresa el monto');
      await call('registrarPagoCuota', { inscripcionId: ins.id, monto, fecha: d.fecha, medio: d.medio });
      toast('Pago registrado en la tesorería');
      await ctx.refresh();
    }
  });
}
