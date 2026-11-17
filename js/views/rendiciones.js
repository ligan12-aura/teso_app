import { icon, esc, money, mesLargo, mesNombre, cap, monthPicker, bindMonthPicker, badgeEstado, ESTADOS, toast, confirmar, emptyState, nextMonth, fecha, prevMonth } from '../ui.js';
import { call } from '../api.js';
import { resumenMinisterio, rendicionDe, transferenciaDe, liderDe } from '../calc.js';
import { transferirItem } from './ministerio.js';

let mesSel = null;

export function render(root, ctx) {
  const { data } = ctx;
  // Por defecto se revisa el mes anterior (el que se rinde a fin de mes)
  if (!mesSel) mesSel = prevMonth(data.hoy.slice(0, 7));
  const mes = mesSel;
  const mesSig = nextMonth(mes);
  const mins = data.ministerios.filter((m) => m.activo);
  const filas = mins.map((m) => {
    const r = resumenMinisterio(data, m.id, mes);
    const rend = rendicionDe(data, m.id, mes);
    return { m, r, rend, estado: rend?.estado || 'abierta', t: transferenciaDe(data, m.id, mesSig), lider: liderDe(data, m.id) };
  });
  const cuenta = (e) => filas.filter((f) => f.estado === e).length;
  const listos = filas.filter((f) => f.estado === 'aprobada' && !f.t);
  const orden = { enviada: 0, observada: 1, abierta: 2, aprobada: 3 };
  filas.sort((a, b) => orden[a.estado] - orden[b.estado] || a.m.nombre.localeCompare(b.m.nombre));

  root.innerHTML = `
  <section class="page-head">
    <div><span class="eyebrow">Cierre mensual</span><h1>Rendiciones</h1></div>
    <div class="head-actions">${monthPicker(mes, 'mp-rend')}</div>
  </section>

  <section class="flow-explain">
    <div class="fe-step"><span>1</span><p><b>Líder registra</b> gastos e ingresos de ${mesNombre(mes)} con sus boletas</p></div>
    <div class="fe-arrow">${icon('chevR')}</div>
    <div class="fe-step"><span>2</span><p><b>Líder confirma</b> que la rendición está completa</p></div>
    <div class="fe-arrow">${icon('chevR')}</div>
    <div class="fe-step"><span>3</span><p><b>Tesorero revisa</b> y aprueba u observa</p></div>
    <div class="fe-arrow">${icon('chevR')}</div>
    <div class="fe-step"><span>4</span><p><b>Se transfiere</b> el ítem de ${mesNombre(mesSig)}</p></div>
  </section>

  <section class="status-cards">
    ${['enviada', 'observada', 'abierta', 'aprobada'].map((e) => `
      <div class="status-card ${ESTADOS[e].cls}"><span>${icon(ESTADOS[e].icon, 18)}</span><div><strong>${cuenta(e)}</strong><small>${ESTADOS[e].label}</small></div></div>`).join('')}
    <div class="status-card st-transfer"><span>${icon('transfer', 18)}</span><div><strong>${filas.filter((f) => f.t).length}/${filas.length}</strong><small>Ítems ${mesNombre(mesSig)} transferidos</small></div></div>
  </section>

  <article class="card">
    <header class="card-head wrap">
      <div><h3>Rendiciones de ${mesLargo(mes)}</h3><p class="muted">Revisa cada ministerio y transfiere el ítem de ${mesNombre(mesSig)}</p></div>
      ${listos.length ? `<button class="btn btn-primary btn-sm" data-bulk>${icon('transfer', 16)} Transferir ${listos.length} ítem${listos.length > 1 ? 's' : ''} aprobado${listos.length > 1 ? 's' : ''}</button>` : ''}
    </header>
    ${filas.length ? `<div class="rend-rows">
      ${filas.map(({ m, r, rend, estado, t, lider }) => `
      <div class="rend-row st-${estado}">
        <a class="rr-min" href="#/ministerio/${m.id}" data-goto="${m.id}">
          <span class="min-dot lg" style="background:${m.color}">${esc(m.icono)}</span>
          <div><strong>${esc(m.nombre)}</strong><span class="muted">${lider ? esc(lider.nombre) : 'Sin líder'}</span></div>
        </a>
        <div class="rr-state">${badgeEstado(estado)}<small class="muted">${estado === 'enviada' ? `enviada ${fecha(rend.fechaEnvio)}` : estado === 'aprobada' ? `aprobada ${fecha(rend.fechaRevision)}` : estado === 'observada' ? 'esperando corrección' : 'sin confirmar'}</small></div>
        <div class="rr-nums">
          <div><small>Gastos</small><b>${money(r.gastos)}</b></div>
          <div><small>Saldo</small><b>${money(r.saldoFinal)}</b></div>
          <div><small>Boletas</small><b class="${r.sinBoleta ? 'warn-txt' : ''}">${r.boletas}${r.sinBoleta ? ` <span title="sin boleta">(${r.sinBoleta} ${icon('alert', 12)})</span>` : ''}</b></div>
        </div>
        <div class="rr-actions">
          ${estado === 'enviada' ? `<button class="btn btn-ok btn-sm" data-aprobar="${m.id}">${icon('check', 15)} Aprobar</button>` : ''}
          <a class="btn btn-ghost btn-sm" href="#/ministerio/${m.id}" data-goto="${m.id}">${icon('eye', 15)} Revisar</a>
          ${t ? `<span class="badge st-ok" title="Transferido el ${fecha(t.fecha)}">${icon('transfer', 13)} ${money(t.monto)}</span>`
            : `<button class="btn ${estado === 'aprobada' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-transf="${m.id}" ${estado === 'aprobada' ? '' : 'title="La rendición aún no está aprobada"'}>${icon('transfer', 15)} Ítem ${mesNombre(mesSig)}</button>`}
        </div>
        ${rend?.comentarioLider && estado === 'enviada' ? `<div class="rr-comment">${icon('user', 13)} “${esc(rend.comentarioLider)}”</div>` : ''}
      </div>`).join('')}
    </div>` : emptyState('No hay ministerios activos.', 'grid')}
  </article>`;

  bindMonthPicker(root, mes, (m) => { mesSel = m; ctx.setMes(ctx.mes); }, 'mp-rend');
  // Al ir al detalle, abrir en el mes de la rendición
  root.querySelectorAll('[data-goto]').forEach((a) => a.addEventListener('click', () => ctx.setMesSilent(mes)));
  root.querySelectorAll('[data-aprobar]').forEach((b) => b.addEventListener('click', async () => {
    const f = filas.find((x) => x.m.id === b.dataset.aprobar);
    if (!(await confirmar(`¿Aprobar la rendición de <b>${esc(f.m.nombre)}</b> de ${mesLargo(mes)}?<br><span class="muted">Gastos ${money(f.r.gastos)} · ${f.r.boletas} boletas${f.r.sinBoleta ? ` · ${f.r.sinBoleta} sin boleta` : ''}</span>`, { boton: 'Aprobar' }))) return;
    try { await call('revisarRendicion', { ministerioId: f.m.id, mes, decision: 'aprobada' }); toast('Rendición aprobada'); await ctx.refresh(); } catch (e) { toast(e.message, 'err'); }
  }));
  root.querySelectorAll('[data-transf]').forEach((b) => b.addEventListener('click', () => {
    const f = filas.find((x) => x.m.id === b.dataset.transf);
    transferirItem(ctx, f.m, mesSig);
  }));
  root.querySelector('[data-bulk]')?.addEventListener('click', async () => {
    const total = listos.reduce((a, f) => a + f.m.itemMensual, 0);
    if (!(await confirmar(`Se registrará la transferencia del ítem de <b>${mesLargo(mesSig)}</b> a:<ul class="bulk-list">${listos.map((f) => `<li>${esc(f.m.icono)} ${esc(f.m.nombre)} <b>${money(f.m.itemMensual)}</b></li>`).join('')}</ul>Total: <b>${money(total)}</b>`, { titulo: 'Transferir ítems', boton: 'Registrar transferencias' }))) return;
    let ok = 0;
    for (const f of listos) {
      try { await call('transferirItem', { ministerioId: f.m.id, mes: mesSig }); ok++; } catch (e) { toast(`${f.m.nombre}: ${e.message}`, 'err'); }
    }
    toast(`${ok} transferencia${ok === 1 ? '' : 's'} registrada${ok === 1 ? '' : 's'}`);
    await ctx.refresh();
  });
}

