import { pesos, formatoPesos, icon, esc, money, moneyShort, cap, mesLargo, mesNombre, mesCorto, fecha, fechaCorta, chart, PALETA, COLOR, monthPicker, bindMonthPicker, badgeEstado, ESTADOS, modal, formData, toast, confirmar, verArchivo, emptyState, nextMonth, prevMonth, esAdmin } from '../ui.js';
import { call } from '../api.js';
import { presupuestoMinisterio, resumenMinisterio, rendicionDe, transferenciaDe, liderDe, monthsBack, movsMinisterio, split, porCategoria, saldoMinisterio } from '../calc.js';
import { abrirFormMovimiento } from './movform.js';
import { descargarPlanillaMinisterio } from '../planillaDescarga.js';
import { renderSeccion, tabsMinisterio, actividadesDe, resumenActividad } from './actividades.js';

export function render(root, ctx) {
  const { data, mes, user } = ctx;
  const esTes = esAdmin(user);
  const mid = esTes ? ctx.params[0] : user.ministerioId;
  const m = data.ministerios.find((x) => x.id === mid);
  if (!m) {
    root.innerHTML = emptyState(esTes ? 'Ministerio no encontrado.' : 'Tu usuario aún no tiene un ministerio asignado. Habla con el tesorero.', 'alert');
    return;
  }
  // Listado de integrantes y actividades (si el ministerio lo tiene habilitado)
  const conAct = m.actividades === 'si';
  const base = esTes ? `ministerio/${m.id}` : 'mi-ministerio';
  const sub = esTes ? ctx.params[1] : ctx.params[0];
  if (sub && conAct) return renderSeccion(root, ctx, m, { esTes, base, sub, subId: esTes ? ctx.params[2] : ctx.params[1] });
  const acts = conAct ? actividadesDe(data, m.id).sort((a, b) => b.fecha.localeCompare(a.fecha)) : [];
  const actNombre = Object.fromEntries(acts.map((a) => [a.id, a.nombre]));
  const r = resumenMinisterio(data, m.id, mes);
  const rend = rendicionDe(data, m.id, mes);
  const estado = rend?.estado || 'abierta';
  const editable = esTes || estado === 'abierta' || estado === 'observada';
  const lider = esTes ? liderDe(data, m.id) : user;
  const saldoTotal = saldoMinisterio(data, m.id);
  const itemMes = transferenciaDe(data, m.id, mes);
  const mesSig = nextMonth(mes);
  const itemSig = transferenciaDe(data, m.id, mesSig);
  const movs = [...r.movs].sort((a, b) => (b.fecha + b.creadoEn).localeCompare(a.fecha + a.creadoEn));
  const cats = porCategoria(r.movs, 'gasto');
  const hoyMes = data.hoy.slice(0, 7);
  const historial = [...new Set([...data.rendiciones.filter((x) => x.ministerioId === m.id).map((x) => x.mes), ...movsMinisterio(data, m.id).filter((x) => x.categoria !== 'Saldo inicial').map((x) => x.mes)])]
    .sort().reverse().slice(0, 8);

  root.innerHTML = `
  ${esTes ? `<a class="back" href="#/ministerios">${icon('chevL', 16)} Ministerios</a>` : ''}
  <section class="min-hero" style="--c:${m.color}">
    <div class="mh-left">
      <span class="mh-icon">${esc(m.icono)}</span>
      <div>
        <span class="eyebrow light">${esTes ? 'Ministerio' : 'Mi ministerio'}</span>
        <h1>${esc(m.nombre)}</h1>
        <span class="mh-sub">${lider ? `${icon('user', 14)} ${esc(lider.nombre)}` : 'Sin líder asignado'} · Ítem ${money(m.itemMensual)} · Presupuesto ${m.presupuestoMensual ? money(m.presupuestoMensual) : 'sin definir'}</span>
      </div>
    </div>
    <div class="mh-right">
      <span>Saldo disponible hoy</span>
      <strong>${money(saldoTotal)}</strong>
      ${monthPicker(mes)}
      <button class="btn btn-light btn-sm mh-descarga" data-planilla>${icon('download', 15)} Descargar planilla</button>
    </div>
  </section>
  ${conAct ? tabsMinisterio(m, base, '') : ''}

  ${pendientesLider()}
  ${panelRendicion()}

  ${franjaPresupuesto()}

  <section class="kpis kpis-4">
    <article class="kpi"><span class="kpi-label">Saldo inicial</span><strong class="kpi-value">${money(r.saldoInicial)}</strong><span class="kpi-sub">arrastre de meses anteriores</span></article>
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:${COLOR.ingreso}"></i> Ingresos</span><strong class="kpi-value">${money(r.ingresos)}</strong><span class="kpi-sub">${itemMes ? `incluye ítem ${money(itemMes.monto)}` : 'ítem del mes aún no recibido'}</span></article>
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:${COLOR.gasto}"></i> Gastos</span><strong class="kpi-value">${money(r.gastos)}</strong><span class="kpi-sub">${r.boletas} boleta${r.boletas === 1 ? '' : 's'} · ${r.sinBoleta ? `<b class="warn-txt">${r.sinBoleta} sin boleta</b>` : 'todo respaldado'}</span></article>
    <article class="kpi kpi-dark"><span class="kpi-label">Saldo al cierre de ${mesNombre(mes)}</span><strong class="kpi-value">${money(r.saldoFinal)}</strong></article>
  </section>

  <section class="grid-2-1">
    <article class="card">
      <header class="card-head wrap">
        <div><h3>Movimientos de ${mesLargo(mes)}</h3><p class="muted">${movs.length} registro${movs.length === 1 ? '' : 's'}</p></div>
        ${editable ? `<div class="head-actions">
          <button class="btn btn-soft-green btn-sm" data-add="ingreso">${icon('plus', 16)} Ingreso</button>
          <button class="btn btn-primary btn-sm" data-add="gasto">${icon('camera', 16)} Rendir gasto</button>
        </div>` : `<span class="lock-note">${icon('lock', 14)} Mes cerrado</span>`}
      </header>
      ${movs.length ? `<ul class="mov-list">
        ${movs.map((x) => `
        <li class="${x.origen === 'transferencia' ? 'is-item' : ''}">
          <span class="ml-ico ${x.tipo}">${icon(x.origen === 'transferencia' ? 'transfer' : x.tipo === 'ingreso' ? 'down' : 'up', 16)}</span>
          <div class="ml-main">
            <strong>${esc(x.descripcion || x.categoria)}</strong>
            <span>${esc(x.categoria)} · ${fecha(x.fecha)}${x.actividadId && actNombre[x.actividadId] ? ` · <a class="tag" href="#/${base}/actividad/${x.actividadId}">${icon('sparkle', 11)} ${esc(actNombre[x.actividadId])}</a>` : ''}</span>
          </div>
          <div class="ml-right">
            <b class="${x.tipo}">${x.tipo === 'ingreso' ? '+' : '−'}${money(x.monto)}</b>
            <div class="ml-actions">
              ${x.archivoId ? `<button class="chip-btn" data-ver="${x.id}">${icon('receipt', 14)} Boleta</button>` : x.tipo === 'gasto' ? `<span class="chip-warn">${icon('alert', 13)} Sin boleta</span>` : ''}
              ${editable && x.origen === 'manual' ? `<button class="icon-btn sm" data-edit="${x.id}" title="Editar">${icon('edit', 15)}</button><button class="icon-btn sm danger" data-del="${x.id}" title="Eliminar">${icon('trash', 15)}</button>` : ''}
              ${editable && x.origen === 'cuota' && !conAct ? `<button class="icon-btn sm danger" data-del="${x.id}" title="Quitar cuota (el ministerio ya no usa actividades)">${icon('trash', 15)}</button>` : ''}
            </div>
          </div>
        </li>`).join('')}
      </ul>` : emptyState(editable ? 'Aún no hay movimientos este mes.<br>Usa <b>Rendir gasto</b> para registrar una compra con su boleta.' : 'Sin movimientos este mes.', 'receipt')}
    </article>

    <div class="stack">
      <article class="card">
        <header class="card-head"><div><h3>Gastos por categoría</h3><p class="muted">${mesLargo(mes)}</p></div></header>
        ${cats.length ? `<div class="chart-box donut sm"><canvas id="ch-cat"></canvas><div class="donut-center"><span>Gastos</span><strong>${moneyShort(r.gastos)}</strong></div></div>
        <ul class="legend">${cats.slice(0, 6).map((c, i) => `<li><i style="background:${PALETA[i % PALETA.length]}"></i><span>${esc(c[0])}</span><b>${money(c[1])}</b></li>`).join('')}</ul>` : emptyState('Sin gastos registrados')}
      </article>
      <article class="card">
        <header class="card-head"><div><h3>Últimos 6 meses</h3></div></header>
        <div class="chart-box sm"><canvas id="ch-6m"></canvas></div>
      </article>
      ${conAct ? `<article class="card">
        <header class="card-head"><div><h3>Actividades</h3><p class="muted">Resultado de cada una (entradas − salidas)</p></div><a class="link" href="#/${base}/actividades">Ver todas</a></header>
        ${acts.length ? `<ul class="act-mini">${acts.slice(0, 5).map((a) => { const ra = resumenActividad(data, a); return `<li><a href="#/${base}/actividad/${a.id}"><span>${esc(a.nombre)}<small class="muted">${fecha(a.fecha)} · ${ra.pagados}/${ra.ins.length} pagaron</small></span><b class="${ra.resultado < 0 ? 'gasto' : 'ingreso'}">${money(ra.resultado)}</b></a></li>`; }).join('')}</ul>` : emptyState('Sin actividades aún')}
      </article>` : ''}
      <article class="card">
        <header class="card-head"><div><h3>Historial de rendiciones</h3></div></header>
        ${historial.length ? `<ul class="hist">${historial.map((mm) => {
          const rr = rendicionDe(data, m.id, mm);
          return `<li><button data-mes="${mm}" class="${mm === mes ? 'active' : ''}"><span>${cap(mesLargo(mm))}</span>${badgeEstado(rr?.estado || 'abierta')}</button></li>`;
        }).join('')}</ul>` : emptyState('Sin historial aún')}
      </article>
    </div>
  </section>`;

  // ---------- Presupuesto del mes ----------
  function franjaPresupuesto() {
    const p = presupuestoMinisterio(data, m.id, mes);
    if (!p.limite) {
      return `<section class="pres-strip"><div class="ps-txt"><span>${icon('wallet', 16)} Presupuesto de ${mesNombre(mes)}</span><strong>Sin definir</strong><small>no hay límite de gasto</small></div>
        <div class="ps-bar"><p class="muted">${esTes ? 'Define el presupuesto mensual del ministerio en Configuración → Presupuesto.' : 'Tesorería aún no define el presupuesto de tu ministerio.'} Gastado este mes: <b>${money(p.gastado)}</b>.</p></div></section>`;
    }
    const pct = p.gastado / p.limite;
    const cls = pct > 1 ? 'over' : pct >= 0.9 ? 'near' : '';
    return `<section class="pres-strip ${cls}">
      <div class="ps-txt">
        <span>${icon('wallet', 16)} Presupuesto de ${mesNombre(mes)}</span>
        <strong>${money(p.limite)}</strong>
        <small>monto fijo definido por tesorería</small>
      </div>
      <div class="ps-bar">
        <div class="progress"><span style="width:${Math.min(100, pct * 100)}%"></span></div>
        <div class="ps-nums"><span>Gastado <b>${money(p.gastado)}</b> (${Math.round(pct * 100)}%)</span><span>${p.disponible >= 0 ? `Disponible <b>${money(p.disponible)}</b>` : `<b class="gasto">Excedido en ${money(-p.disponible)}</b>`}</span></div>
      </div>
    </section>`;
  }

  // ---------- Avisos para el líder: meses anteriores sin cerrar ----------
  function pendientesLider() {
    if (esTes) return '';
    const meses = [...new Set(movsMinisterio(data, m.id).filter((x) => x.categoria !== 'Saldo inicial').map((x) => x.mes))].filter((mm) => mm < hoyMes && mm !== mes);
    return meses.sort().map((mm) => {
      const e = rendicionDe(data, m.id, mm)?.estado || 'abierta';
      if (e === 'observada') return `<button class="alert-strip warn" data-mes="${mm}">${icon('alert')} <span><strong>Tu rendición de ${mesNombre(mm)} fue observada.</strong> Revisa el comentario de tesorería y reenvíala.</span>${icon('chevR')}</button>`;
      if (e === 'abierta') return `<button class="alert-strip warn" data-mes="${mm}">${icon('clock')} <span><strong>Falta confirmar la rendición de ${mesNombre(mm)}.</strong> Sin ella no se puede transferir el ítem del mes siguiente.</span>${icon('chevR')}</button>`;
      return '';
    }).join('');
  }

  // ---------- Panel de rendición ----------
  function panelRendicion() {
    const hechos = { abierta: 0, observada: 1, enviada: 2, aprobada: 3 }[estado];
    const stepper = `<ol class="stepper ${estado === 'observada' ? 'is-obs' : ''}">
      ${['Registro de movimientos', estado === 'observada' ? 'Observada · corregir' : 'Confirmada por el líder', 'Aprobada por tesorería'].map((t, i) => `
      <li class="${i < hechos ? 'done' : i === hechos ? 'current' : ''}"><span class="dot-step">${i < hechos ? icon('check', 13) : i === hechos && estado === 'observada' ? '!' : i + 1}</span><span>${t}</span></li>`).join('')}
    </ol>`;
    let msg = '', acciones = '';
    const comentarioTes = rend?.comentarioTesorero ? `<blockquote class="quote obs">${icon('alert', 15)} <span><b>Tesorería:</b> ${esc(rend.comentarioTesorero)}</span></blockquote>` : '';
    const comentarioLid = rend?.comentarioLider ? `<blockquote class="quote">${icon('user', 15)} <span><b>Líder:</b> ${esc(rend.comentarioLider)}</span></blockquote>` : '';
    if (!esTes) {
      if (estado === 'abierta') {
        msg = mes === hoyMes ? `Registra cada gasto con su boleta. Al terminar el mes, confirma que la rendición está completa.` : `¿Ya registraste todos los movimientos de ${mesNombre(mes)}? Confírmalo para que tesorería lo revise y pueda transferir el ítem de ${mesNombre(mesSig)}.`;
        acciones = `<button class="btn btn-gold" data-enviar>${icon('send', 16)} Confirmar rendición de ${mesNombre(mes)}</button>`;
      } else if (estado === 'observada') {
        msg = `Tesorería pidió correcciones. Ajusta lo necesario y vuelve a confirmar.`;
        acciones = `<button class="btn btn-gold" data-enviar>${icon('send', 16)} Reenviar rendición</button>`;
      } else if (estado === 'enviada') {
        msg = `Enviada el ${fecha(rend.fechaEnvio)}. Tesorería la está revisando.`;
        acciones = `<button class="btn btn-ghost" data-retirar>${icon('undo', 16)} Retirar para corregir</button>`;
      } else {
        msg = `Aprobada el ${fecha(rend.fechaRevision)}. ¡Gracias por tu fidelidad en la administración! 🙌`;
      }
    } else {
      if (estado === 'enviada') {
        msg = `${lider ? esc(lider.nombre.split(' ')[0]) : 'El líder'} confirmó la rendición el ${fecha(rend.fechaEnvio)}. Revisa los movimientos y boletas.`;
        acciones = `<button class="btn btn-ok" data-aprobar>${icon('checkCircle', 16)} Aprobar</button><button class="btn btn-ghost" data-observar>${icon('alert', 16)} Observar</button>`;
      } else if (estado === 'aprobada') {
        msg = `Aprobada el ${fecha(rend.fechaRevision)}.`;
        acciones = `<button class="btn btn-ghost btn-sm" data-observar>${icon('undo', 15)} Reabrir con observación</button>`;
      } else {
        msg = estado === 'observada' ? 'Esperando que el líder corrija y reenvíe.' : 'El líder aún no confirma la rendición de este mes.';
        acciones = `<button class="btn btn-ghost btn-sm" data-aprobar-forzar>${icon('checkCircle', 15)} Aprobar igualmente</button>`;
      }
    }
    const transfer = esTes ? `
      <div class="transfer-box ${itemSig ? 'done' : ''}">
        <div class="tb-ico">${icon('transfer', 20)}</div>
        <div class="tb-txt">
          <span>Ítem de ${mesNombre(mesSig)}</span>
          <strong>${itemSig ? `${money(itemSig.monto)} transferido` : money(m.itemMensual)}</strong>
          <small>${itemSig ? `el ${fecha(itemSig.fecha)}` : estado === 'aprobada' ? 'Listo para transferir' : 'Requiere rendición aprobada'}</small>
        </div>
        ${itemSig ? `<button class="link-btn" data-anular="${itemSig.id}">Anular</button>` : `<button class="btn ${estado === 'aprobada' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-transferir>Transferir</button>`}
      </div>` : '';
    return `
    <section class="rend-panel st-${estado}">
      <div class="rp-main">
        <div class="rp-head"><h3>Rendición de ${mesLargo(mes)}</h3>${badgeEstado(estado)}</div>
        ${stepper}
        <p class="rp-msg">${msg}</p>
        ${comentarioTes}${esTes ? comentarioLid : ''}
        ${acciones ? `<div class="rp-actions">${acciones}</div>` : ''}
      </div>
      ${transfer}
    </section>`;
  }

  // ---------- Eventos ----------
  bindMonthPicker(root, mes, ctx.setMes);
  root.querySelector('[data-planilla]')?.addEventListener('click', () => descargarPlanillaMinisterio(data, m.id).catch((e) => toast(e.message, 'err')));
  root.querySelectorAll('[data-mes]').forEach((b) => b.addEventListener('click', () => ctx.setMes(b.dataset.mes)));
  const byId = (id) => data.movMinisterios.find((x) => x.id === id);
  const form = (tipo, mov) => abrirFormMovimiento({
    ctx, ambito: 'ministerio', tipo, mov, ministerioId: esTes ? m.id : undefined,
    action: mov ? 'updateMovMinisterio' : 'addMovMinisterio',
    titulo: mov ? 'Editar movimiento' : tipo === 'gasto' ? `Rendir gasto · ${m.nombre}` : `Registrar ingreso · ${m.nombre}`
  });
  root.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => form(b.dataset.add)));
  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => form(null, byId(b.dataset.edit))));
  root.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => { const x = byId(b.dataset.ver); verArchivo(x.archivoId, `${x.descripcion || x.categoria} · ${money(x.monto)}`); }));
  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const x = byId(b.dataset.del);
    if (!(await confirmar(`Se eliminará <b>${esc(x.descripcion || x.categoria)}</b> por <b>${money(x.monto)}</b>${x.archivoId ? ' junto con su boleta' : ''}.`, { boton: 'Eliminar', danger: true }))) return;
    await accion('deleteMovMinisterio', { id: x.id }, 'Movimiento eliminado');
  }));

  async function accion(action, payload, ok) {
    try { await call(action, payload); toast(ok); await ctx.refresh(); return true; } catch (e) { toast(e.message, 'err'); return false; }
  }

  root.querySelector('[data-enviar]')?.addEventListener('click', () => {
    const aviso = r.sinBoleta ? `<div class="note warn">${icon('alert', 16)} Tienes <b>${r.sinBoleta} gasto${r.sinBoleta > 1 ? 's' : ''} sin boleta</b>. Puedes explicarlo en el comentario.</div>` : '';
    modal({
      title: `Confirmar rendición de ${mesLargo(mes)}`,
      body: `<div class="resumen-envio">
          <div><span>Ingresos</span><b class="ingreso">${money(r.ingresos)}</b></div>
          <div><span>Gastos</span><b class="gasto">${money(r.gastos)}</b></div>
          <div><span>Saldo al cierre</span><b>${money(r.saldoFinal)}</b></div>
        </div>${aviso}
        <p class="muted">Al confirmar declaras que registraste <b>todos</b> los gastos e ingresos del mes. El mes quedará bloqueado mientras tesorería lo revisa.</p>
        <label class="field"><span>Comentario para tesorería (opcional)</span><textarea name="comentario" rows="3" maxlength="500"></textarea></label>`,
      submitLabel: 'Confirmar y enviar',
      async onSubmit(f) {
        await call('enviarRendicion', { mes, comentario: formData(f).comentario });
        toast('Rendición enviada a tesorería');
        await ctx.refresh();
      }
    });
  });
  root.querySelector('[data-retirar]')?.addEventListener('click', async () => {
    if (await confirmar('La rendición volverá a estado abierto para que puedas corregirla.', { boton: 'Retirar' })) accion('retirarRendicion', { mes }, 'Rendición retirada');
  });
  root.querySelector('[data-aprobar]')?.addEventListener('click', async () => {
    if (await confirmar(`¿Aprobar la rendición de <b>${esc(m.nombre)}</b> de ${mesLargo(mes)}?<br><span class="muted">Gastos ${money(r.gastos)} · ${r.boletas} boletas${r.sinBoleta ? ` · ${r.sinBoleta} sin boleta` : ''}</span>`, { boton: 'Aprobar' })) {
      const ok = await accion('revisarRendicion', { ministerioId: m.id, mes, decision: 'aprobada' }, 'Rendición aprobada');
      if (ok && !transferenciaDe(ctx.data, m.id, mesSig)) toast(`Ahora puedes transferir el ítem de ${mesNombre(mesSig)}`);
    }
  });
  root.querySelector('[data-aprobar-forzar]')?.addEventListener('click', async () => {
    if (await confirmar(`El líder no ha confirmado esta rendición. ¿Aprobarla de todas formas?`, { boton: 'Aprobar' })) accion('revisarRendicion', { ministerioId: m.id, mes, decision: 'aprobada', forzar: true }, 'Rendición aprobada');
  });
  root.querySelector('[data-observar]')?.addEventListener('click', () => modal({
    title: 'Observar rendición',
    body: `<p class="muted">El líder verá tu comentario y podrá corregir y reenviar.</p><label class="field"><span>¿Qué debe corregir?</span><textarea name="comentario" rows="4" maxlength="500" required placeholder="Ej: Falta la boleta del 12 de ${mesNombre(mes)}…"></textarea></label>`,
    submitLabel: 'Enviar observación',
    async onSubmit(f) {
      await call('revisarRendicion', { ministerioId: m.id, mes, decision: 'observada', comentario: formData(f).comentario });
      toast('Observación enviada al líder');
      await ctx.refresh();
    }
  }));
  root.querySelector('[data-transferir]')?.addEventListener('click', () => transferirItem(ctx, m, mesSig));
  root.querySelector('[data-anular]')?.addEventListener('click', async (e) => {
    if (await confirmar('Se eliminará el egreso en tesorería general y el ingreso en el ministerio asociados a esta transferencia.', { titulo: 'Anular transferencia', boton: 'Anular', danger: true })) {
      accion('anularTransferencia', { id: e.currentTarget.dataset.anular }, 'Transferencia anulada');
    }
  });

  // ---------- Gráficos ----------
  if (cats.length) {
    chart(root.querySelector('#ch-cat'), {
      type: 'doughnut',
      data: { labels: cats.map((c) => c[0]), datasets: [{ data: cats.map((c) => c[1]), backgroundColor: PALETA, borderWidth: 2, borderColor: '#fff' }] },
      options: { cutout: '68%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${money(c.raw)}` } } } }
    });
  }
  const meses = monthsBack(mes, 6);
  const todos = movsMinisterio(data, m.id);
  const serie = meses.map((mm) => split(todos.filter((x) => x.mes === mm)));
  chart(root.querySelector('#ch-6m'), {
    type: 'bar',
    data: {
      labels: meses.map(mesCorto),
      datasets: [
        { label: 'Ingresos', data: serie.map((s) => s.ingresos), backgroundColor: COLOR.ingreso, borderRadius: 5, maxBarThickness: 14 },
        { label: 'Gastos', data: serie.map((s) => s.gastos), backgroundColor: m.color, borderRadius: 5, maxBarThickness: 14 }
      ]
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${money(c.raw)}` } } },
      scales: { x: { grid: { display: false } }, y: { ticks: { callback: (v) => moneyShort(v) }, grid: { color: '#eef0f3' }, border: { display: false } } }
    }
  });
}

export function transferirItem(ctx, m, mes, forzar = false) {
  return modal({
    title: `Transferir ítem · ${m.nombre}`,
    body: `<p class="muted">Registra que transferiste el ítem de <b>${mesLargo(mes)}</b> al líder. Se crea un egreso en tesorería general y un ingreso en el ministerio.</p>
      ${forzar ? `<div class="note warn">${icon('alert', 16)} La rendición del mes anterior no está aprobada. Se transferirá igualmente.</div>` : ''}
      <div class="note">${icon('wallet', 16)}<span>El ítem mensual de ${esc(m.nombre)} es <b>${money(m.itemMensual)}</b>. La transferencia no puede superarlo.</span></div>
      <div class="form-row">
        <label class="field"><span>Monto</span><input name="monto" inputmode="numeric" value="${m.itemMensual.toLocaleString('es-CL')}" required></label>
        <label class="field"><span>Fecha de transferencia</span><input type="date" name="fecha" value="${ctx.data.hoy}" required></label>
      </div>`,
    submitLabel: 'Registrar transferencia',
    onOpen(f) { formatoPesos(f.monto); },
    async onSubmit(f, { close }) {
      const d = formData(f);
      if (pesos(d.monto) > m.itemMensual) throw new Error(`No puede superar el ítem mensual de ${money(m.itemMensual)}.`);
      try {
        await call('transferirItem', { ministerioId: m.id, mes, monto: pesos(d.monto), fecha: d.fecha, forzar });
      } catch (e) {
        if (e.code === 'NEEDS_FORCE') {
          close(null);
          if (await confirmar(`${esc(e.message)}<br><br>¿Transferir de todas formas?`, { boton: 'Sí, continuar' })) transferirItem(ctx, m, mes, true);
          return false;
        }
        throw e;
      }
      toast(`Ítem de ${mesNombre(mes)} transferido a ${m.nombre}`);
      await ctx.refresh();
    }
  });
}
