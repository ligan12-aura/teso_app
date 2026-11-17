import { icon, esc, money, moneyShort, mesNombre, chart, monthPicker, bindMonthPicker, badgeEstado, prevMonth, emptyState, mesCorto } from '../ui.js';
import { resumenMinisterio, estadoDe, transferenciaDe, liderDe, monthsBack, movsMinisterio, split } from '../calc.js';

export function render(root, ctx) {
  const { data, mes } = ctx;
  const mins = data.ministerios.filter((m) => m.activo);
  const mesAnt = prevMonth(mes);
  const res = mins.map((m) => ({ m, r: resumenMinisterio(data, m.id, mes) }));
  const totGastos = res.reduce((a, x) => a + x.r.gastos, 0);
  const totDisp = res.reduce((a, x) => a + x.r.saldoInicial + x.r.ingresos, 0);
  const totSinBoleta = res.reduce((a, x) => a + x.r.sinBoleta, 0);

  root.innerHTML = `
  <section class="page-head">
    <div><span class="eyebrow">Control por ministerio</span><h1>Ministerios</h1></div>
    <div class="head-actions">${monthPicker(mes)}</div>
  </section>

  <section class="kpis kpis-4">
    <article class="kpi"><span class="kpi-label">${icon('grid', 15)} Ministerios activos</span><strong class="kpi-value">${mins.length}</strong></article>
    <article class="kpi"><span class="kpi-label">${icon('wallet', 15)} Fondos disponibles</span><strong class="kpi-value">${money(totDisp)}</strong><span class="kpi-sub">saldo anterior + ingresos del mes</span></article>
    <article class="kpi"><span class="kpi-label">${icon('up', 15)} Gastado en ${mesNombre(mes)}</span><strong class="kpi-value">${money(totGastos)}</strong></article>
    <article class="kpi ${totSinBoleta ? 'kpi-warn' : ''}"><span class="kpi-label">${icon('receipt', 15)} Gastos sin boleta</span><strong class="kpi-value">${totSinBoleta}</strong><span class="kpi-sub">${totSinBoleta ? 'revisar respaldo' : 'todo respaldado'}</span></article>
  </section>

  ${mins.length ? `<section class="min-grid">
    ${res.map(({ m, r }) => {
      const lider = liderDe(data, m.id);
      const disp = r.saldoInicial + r.ingresos;
      const t = transferenciaDe(data, m.id, mes);
      return `
      <a class="min-card" href="#/ministerio/${m.id}" style="--c:${m.color}">
        <header>
          <span class="min-icon">${esc(m.icono)}</span>
          <div><h3>${esc(m.nombre)}</h3><span class="muted">${lider ? esc(lider.nombre) : 'Sin líder asignado'}</span></div>
          <span class="min-saldo"><small>Saldo</small>${money(r.saldoFinal)}</span>
        </header>
        <div class="min-bar">
          <div class="progress"><span style="width:${Math.min(100, r.uso * 100)}%;${r.uso > 1 ? 'background:var(--rose)' : ''}"></span></div>
          <div class="min-bar-txt"><span>Gastado <b>${money(r.gastos)}</b></span><span>de ${money(disp)}</span></div>
        </div>
        <div class="min-spark"><canvas data-spark="${m.id}"></canvas></div>
        <footer>
          <div><small>Rendición ${mesCorto(mesAnt).split(' ')[0]}</small>${badgeEstado(estadoDe(data, m.id, mesAnt))}</div>
          <div><small>Rendición ${mesCorto(mes).split(' ')[0]}</small>${badgeEstado(estadoDe(data, m.id, mes))}</div>
          <div><small>Ítem ${mesCorto(mes).split(' ')[0]}</small>${t ? `<span class="badge st-ok">${icon('transfer', 13)}${moneyShort(t.monto)}</span>` : `<span class="badge st-open">${icon('clock', 13)}Pendiente</span>`}</div>
        </footer>
        ${r.sinBoleta ? `<span class="min-warn" title="Gastos sin boleta">${icon('receipt', 13)} ${r.sinBoleta}</span>` : ''}
      </a>`;
    }).join('')}
  </section>` : emptyState('Aún no hay ministerios. Créalos en Configuración.', 'grid')}`;

  bindMonthPicker(root, mes, ctx.setMes);

  const meses = monthsBack(mes, 6);
  mins.forEach((m) => {
    const movs = movsMinisterio(data, m.id);
    const gastos = meses.map((mm) => split(movs.filter((x) => x.mes === mm)).gastos);
    chart(root.querySelector(`[data-spark="${m.id}"]`), {
      type: 'bar',
      data: { labels: meses.map(mesCorto), datasets: [{ data: gastos, backgroundColor: meses.map((mm) => (mm === mes ? m.color : m.color + '55')), borderRadius: 4, barThickness: 'flex', maxBarThickness: 18 }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` Gastos: ${money(c.raw)}` } } }, scales: { x: { display: true, grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 } } }, y: { display: false } } }
    });
  });
}
