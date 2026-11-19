import { icon, esc, money, moneyShort, cap, mesLargo, mesCorto, mesNombre, fechaCorta, chart, PALETA, COLOR, ring, sparkline, badgeEstado, monthPicker, bindMonthPicker, prevMonth, emptyState } from '../ui.js';
import { presupuestoGeneralMensual, monthsBack, serieGeneral, saldoGeneralHasta, movsGeneralesMes, split, porCategoria, porGrupo, resumenMinisterio, estadoDe, transferenciaDe } from '../calc.js';
import { nuevoMovGeneral, registrarCulto } from './general.js';

export function render(root, ctx) {
  const { data, mes } = ctx;
  const hoyMes = data.hoy.slice(0, 7);
  const meses = monthsBack(mes, 12);
  const serie = serieGeneral(data, meses);
  const actual = serie[serie.length - 1];
  const anterior = serie[serie.length - 2];
  const saldo = saldoGeneralHasta(data, mes);
  const movsMes = movsGeneralesMes(data, mes);
  const asignado = movsMes.filter((m) => m.origen === 'transferencia').reduce((a, m) => a + m.monto, 0);
  const ministerios = data.ministerios.filter((m) => m.activo);
  const itemsTotal = ministerios.reduce((a, m) => a + m.itemMensual, 0);
  const presTotal = presupuestoGeneralMensual(data, mes);
  const mesRend = prevMonth(mes);
  const delta = (a, b) => (b ? (a - b) / b : 0);
  const pct = (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
  const ingCat = porCategoria(movsMes, 'ingreso');
  const gasCat = porGrupo(movsMes, 'gasto').map(([g, v]) => [g, v]);
  const ultimos = [...data.movGenerales].sort((a, b) => (b.fecha + b.creadoEn).localeCompare(a.fecha + a.creadoEn)).slice(0, 7);
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
  const aprobadas = ministerios.filter((m) => estadoDe(data, m.id, mesRend) === 'aprobada').length;
  const pendientesRev = ministerios.filter((m) => estadoDe(data, m.id, mesRend) === 'enviada').length;

  root.innerHTML = `
  <section class="page-head">
    <div>
      <span class="eyebrow">${saludo}, ${esc(ctx.user.nombre.split(' ')[0])}</span>
      <h1>Resumen de tesorería</h1>
    </div>
    <div class="head-actions">
      ${monthPicker(mes)}
      <button class="btn btn-ghost" data-culto>${icon('church')} Registrar culto</button>
      <button class="btn btn-primary" data-nuevo>${icon('plus')} Movimiento</button>
    </div>
  </section>

  ${pendientesRev ? `<a class="alert-strip" href="#/rendiciones">${icon('send')} <span><strong>${pendientesRev} rendición${pendientesRev > 1 ? 'es' : ''}</strong> de ${mesNombre(mesRend)} esperando tu revisión</span>${icon('chevR')}</a>` : ''}

  <section class="kpis">
    <article class="kpi kpi-hero">
      <span class="kpi-label">${icon('wallet', 16)} Saldo en caja ${mes === hoyMes ? 'hoy' : `a fin de ${mesNombre(mes)}`}</span>
      <strong class="kpi-value">${money(saldo)}</strong>
      <div class="kpi-spark">${sparkline(serie.map((s) => s.saldo), '#e8c77d', 260, 46)}</div>
      <span class="kpi-sub">Evolución últimos 12 meses</span>
    </article>
    <article class="kpi">
      <span class="kpi-label"><i class="dot" style="background:${COLOR.ingreso}"></i> Ingresos de ${mesNombre(mes)}</span>
      <strong class="kpi-value">${money(actual.ingresos)}</strong>
      <span class="trend ${actual.ingresos >= anterior.ingresos ? 'up' : 'down'}">${icon(actual.ingresos >= anterior.ingresos ? 'up' : 'down', 14)} ${pct(delta(actual.ingresos, anterior.ingresos))} vs ${mesNombre(anterior.mes)}</span>
    </article>
    <article class="kpi">
      <span class="kpi-label"><i class="dot" style="background:${COLOR.gasto}"></i> Gastos de ${mesNombre(mes)}</span>
      <strong class="kpi-value">${money(actual.gastos)}</strong>
      ${presTotal ? `<div class="pres-mini"><div class="progress"><span style="width:${Math.min(100, (actual.gastos / presTotal) * 100)}%;${actual.gastos > presTotal ? 'background:var(--rose)' : ''}"></span></div><small>${Math.round((actual.gastos / presTotal) * 100)}% del presupuesto (${moneyShort(presTotal)})</small></div>` : ''}
      <span class="trend ${actual.gastos <= anterior.gastos ? 'up' : 'down'}">${icon(actual.gastos >= anterior.gastos ? 'up' : 'down', 14)} ${pct(delta(actual.gastos, anterior.gastos))} vs ${mesNombre(anterior.mes)}</span>
    </article>
    <article class="kpi">
      <span class="kpi-label"><i class="dot" style="background:${COLOR.gold}"></i> Resultado del mes</span>
      <strong class="kpi-value ${actual.neto < 0 ? 'neg' : 'pos'}">${actual.neto < 0 ? '−' : '+'}${money(Math.abs(actual.neto))}</strong>
      <span class="kpi-sub">${money(asignado)} asignado a ministerios</span>
    </article>
  </section>

  <section class="grid-2-1">
    <article class="card">
      <header class="card-head"><div><h3>Flujo de los últimos 12 meses</h3><p class="muted">Ingresos, gastos y saldo acumulado</p></div></header>
      <div class="chart-box tall"><canvas id="ch-flujo"></canvas></div>
    </article>
    <article class="card">
      <header class="card-head"><div><h3>Rendiciones de ${mesNombre(mesRend)}</h3><p class="muted">${aprobadas} de ${ministerios.length} aprobadas</p></div><a class="btn btn-ghost btn-sm" href="#/rendiciones">Ver</a></header>
      <div class="progress big"><span style="width:${ministerios.length ? (aprobadas / ministerios.length) * 100 : 0}%"></span></div>
      <ul class="rend-list">
        ${ministerios.map((m) => {
          const e = estadoDe(data, m.id, mesRend);
          const t = transferenciaDe(data, m.id, mes);
          return `<li><a href="#/ministerio/${m.id}"><span class="min-dot" style="background:${m.color}">${esc(m.icono)}</span><span class="rl-name">${esc(m.nombre)}</span>${badgeEstado(e)}${t ? `<span class="chip-ok" title="Ítem de ${mesNombre(mes)} transferido">${icon('transfer', 13)}</span>` : '<span class="chip-pend" title="Ítem pendiente">' + icon('transfer', 13) + '</span>'}</a></li>`;
        }).join('') || '<li class="muted">No hay ministerios.</li>'}
      </ul>
    </article>
  </section>

  <section class="grid-3">
    <article class="card">
      <header class="card-head"><div><h3>¿De dónde viene?</h3><p class="muted">Ingresos de ${mesNombre(mes)}</p></div></header>
      ${ingCat.length ? `<div class="donut-wrap"><div class="chart-box donut"><canvas id="ch-ing"></canvas><div class="donut-center"><span>Total</span><strong>${moneyShort(actual.ingresos)}</strong></div></div>${legend(ingCat, actual.ingresos)}</div>` : emptyState('Sin ingresos este mes')}
    </article>
    <article class="card">
      <header class="card-head"><div><h3>¿A dónde va?</h3><p class="muted">Gastos de ${mesNombre(mes)} por tipo</p></div></header>
      ${gasCat.length ? `<div class="donut-wrap"><div class="chart-box donut"><canvas id="ch-gas"></canvas><div class="donut-center"><span>Total</span><strong>${moneyShort(actual.gastos)}</strong></div></div>${legend(gasCat, actual.gastos, 5)}</div>` : emptyState('Sin gastos este mes')}
    </article>
    <article class="card">
      <header class="card-head"><div><h3>Ministerios este mes</h3><p class="muted">Uso del presupuesto · ${money(itemsTotal)} en ítems</p></div></header>
      <div class="min-rings">
        ${ministerios.map((m) => {
          const r = resumenMinisterio(data, m.id, mes);
          return `<a class="min-ring" href="#/ministerio/${m.id}">${ring(r.uso, m.color, 58, 6)}<span>${esc(m.icono)} ${esc(m.nombre)}</span><small>${r.sinPresupuesto ? `${moneyShort(r.gastos)} · sin presupuesto` : `${moneyShort(r.gastos)} de ${moneyShort(r.presupuesto)}`}</small></a>`;
        }).join('')}
      </div>
    </article>
  </section>

  <section class="grid-1-1">
    <article class="card">
      <header class="card-head"><div><h3>Distribución del ítem mensual</h3><p class="muted">Cuánto recibe cada ministerio</p></div></header>
      <div class="chart-box"><canvas id="ch-items"></canvas></div>
    </article>
    <article class="card">
      <header class="card-head"><div><h3>Últimos movimientos</h3></div><a class="btn btn-ghost btn-sm" href="#/general">Ver todos</a></header>
      ${ultimos.length ? `<ul class="mov-mini">${ultimos.map((m) => `
        <li><span class="mm-ico ${m.tipo}">${icon(m.tipo === 'ingreso' ? 'down' : 'up', 15)}</span>
          <div><strong>${esc(m.categoria)}</strong><span>${esc(m.descripcion || '')} · ${fechaCorta(m.fecha)}</span></div>
          <b class="${m.tipo}">${m.tipo === 'ingreso' ? '+' : '−'}${money(m.monto)}</b></li>`).join('')}</ul>` : emptyState('Aún no hay movimientos')}
    </article>
  </section>`;

  bindMonthPicker(root, mes, ctx.setMes);
  root.querySelector('[data-nuevo]').addEventListener('click', () => nuevoMovGeneral(ctx));
  root.querySelector('[data-culto]').addEventListener('click', () => registrarCulto(ctx));

  chart(root.querySelector('#ch-flujo'), {
    data: {
      labels: meses.map(mesCorto),
      datasets: [
        { type: 'bar', label: 'Ingresos', data: serie.map((s) => s.ingresos), backgroundColor: COLOR.ingreso, borderRadius: 6, maxBarThickness: 18, order: 2 },
        { type: 'bar', label: 'Gastos', data: serie.map((s) => s.gastos), backgroundColor: COLOR.gasto, borderRadius: 6, maxBarThickness: 18, order: 3 },
        { type: 'line', label: 'Saldo', data: serie.map((s) => s.saldo), borderColor: COLOR.gold, backgroundColor: 'rgba(201,154,59,.12)', fill: true, tension: 0.35, pointRadius: 3, pointBackgroundColor: '#fff', pointBorderWidth: 2, yAxisID: 'y1', order: 1 }
      ]
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${money(c.raw)}` } } },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: (v) => moneyShort(v) }, grid: { color: '#eef0f3' }, border: { display: false } },
        y1: { position: 'right', ticks: { callback: (v) => moneyShort(v) }, grid: { display: false }, border: { display: false } }
      }
    }
  });
  const donut = (id, cats, max) => { const g = agrupar(cats, max); return chart(root.querySelector(id), {
    type: 'doughnut',
    data: { labels: g.map((c) => c[0]), datasets: [{ data: g.map((c) => c[1]), backgroundColor: g.map((c) => c[2]), borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }] },
    options: { cutout: '70%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${money(c.raw)}` } } } }
  }); };
  if (ingCat.length) donut('#ch-ing', ingCat, 5);
  if (gasCat.length) donut('#ch-gas', gasCat, 5);
  const sorted = [...ministerios].sort((a, b) => b.itemMensual - a.itemMensual);
  chart(root.querySelector('#ch-items'), {
    type: 'bar',
    data: { labels: sorted.map((m) => `${m.icono} ${m.nombre}`), datasets: [{ data: sorted.map((m) => m.itemMensual), backgroundColor: sorted.map((m) => m.color), borderRadius: 8, barThickness: 16 }] },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${money(c.raw)} al mes` } } },
      scales: { x: { ticks: { callback: (v) => moneyShort(v) }, grid: { color: '#eef0f3' }, border: { display: false } }, y: { grid: { display: false }, border: { display: false } } }
    }
  });
}

function agrupar(cats, max) {
  const rows = cats.slice(0, max).map((c, i) => [c[0], c[1], PALETA[i % PALETA.length]]);
  const rest = cats.slice(max).reduce((a, c) => a + c[1], 0);
  if (rest) rows.push(['Otros', rest, '#c5cad3']);
  return rows;
}

function legend(cats, totalv, max = 5) {
  return `<ul class="legend">${agrupar(cats, max).map(([n, v, col]) => `<li><i style="background:${col}"></i><span>${esc(n)}</span><b>${Math.round((v / totalv) * 100)}%</b></li>`).join('')}</ul>`;
}
