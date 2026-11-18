import { pesos, formatoPesos, icon, esc, money, moneyShort, cap, mesLargo, mesCorto, fecha, chart, COLOR, monthPicker, bindMonthPicker, modal, formData, toast, confirmar, verArchivo, emptyState } from '../ui.js';
import { call } from '../api.js';
import { split, saldoGeneralHasta, monthsBack, serieGeneral, porGrupo, grupoDe, presupuestoGeneralMensual } from '../calc.js';
import { PALETA } from '../ui.js';
import { abrirFormMovimiento } from './movform.js';
import { filasDiezmantes } from './diezmos.js';

const filtros = { periodo: 'mes', tipo: '', categoria: '', grupo: '', q: '' };

export const nuevoMovGeneral = (ctx, tipo = 'ingreso', mov = null) =>
  abrirFormMovimiento({ ctx, ambito: 'general', tipo, mov, action: mov ? 'updateMovGeneral' : 'addMovGeneral', titulo: mov ? 'Editar movimiento' : 'Nuevo movimiento · Tesorería general' });

export function registrarCulto(ctx) {
  const cats = ['Diezmos', 'Ofrendas', 'Ofrenda misionera', 'Ofrenda pro-templo'];
  const activos = filasDiezmantes(ctx.data.miembros || []);
  return modal({
    title: 'Registrar culto',
    wide: true,
    body: `<p class="muted">Ingresa lo recaudado en un culto. Se crea un ingreso por cada monto.</p>
      <div class="form-row">
        <label class="field"><span>Fecha del culto</span><input type="date" name="fecha" value="${ctx.data.hoy}" max="${ctx.data.hoy}" required></label>
        <label class="field"><span>Medio</span><select name="medio">${ctx.data.medios.map((m) => `<option>${m}</option>`).join('')}</select></label>
      </div>
      <div class="culto-grid">
        ${cats.map((c, i) => `<label class="field"><span>${c}</span><input name="m${i}" inputmode="numeric" class="input-money culto-monto" placeholder="0"></label>`).join('')}
      </div>
      ${activos.length ? `
      <div class="det-diezmo">
        <button type="button" class="btn btn-ghost btn-sm" data-detallar>${icon('users', 15)} Detallar diezmos por hermano</button>
        <div class="det-panel" hidden>
          <p class="muted small">Escribe cuánto diezmó cada hermano. El total de <b>Diezmos</b> se calcula solo (hermanos + sin identificar) y cada diezmo queda registrado en el apartado Diezmos.</p>
          <div class="search lote-buscar">${icon('search', 16)}<input type="search" placeholder="Buscar hermano…" data-buscar></div>
          <ul class="lote-lista">${activos.map((m) => `<li data-nombre="${esc(m.nombre.toLowerCase())}"><span>${m.matrimonio ? '💍 ' : ''}${esc(m.nombre)}</span><input class="lote-monto det-monto" data-id="${m.id}" data-conyuge="${m.conyugeId}" inputmode="numeric" placeholder="$0" aria-label="Diezmo de ${esc(m.nombre)}"></li>`).join('')}</ul>
          <div class="det-sin"><span>Sin identificar <small class="muted">(sobres sin nombre)</small></span><input class="lote-monto" data-sin inputmode="numeric" placeholder="$0"></div>
          <div class="det-resumen" data-det-resumen></div>
        </div>
      </div>` : ''}
      <label class="field"><span>Descripción</span><input name="descripcion" value="Culto dominical"></label>
      <div class="culto-total">Total: <strong data-total>$0</strong></div>`,
    submitLabel: 'Registrar ingresos',
    onOpen(form) {
      const inputs = [...form.querySelectorAll('.culto-monto')];
      const diezmo = form.m0;
      const panel = form.querySelector('.det-panel');
      const dets = [...form.querySelectorAll('.det-monto')];
      const sin = form.querySelector('[data-sin]');
      const detalleActivo = () => panel && !panel.hidden;
      const upd = () => {
        if (detalleActivo()) {
          const ident = dets.reduce((a, i) => a + pesos(i.value), 0);
          const total = ident + pesos(sin.value);
          diezmo.value = total ? total.toLocaleString('es-CL') : '';
          const n = dets.filter((i) => pesos(i.value) > 0).length;
          form.querySelector('[data-det-resumen]').innerHTML = `${n} hermano${n === 1 ? '' : 's'} · identificado <b>${money(ident)}</b> · sin identificar <b>${money(pesos(sin.value))}</b>`;
        }
        let t = 0;
        inputs.forEach((i) => { const n = pesos(i.value); i.value = n ? n.toLocaleString('es-CL') : ''; t += n; });
        form.querySelector('[data-total]').textContent = money(t);
      };
      inputs.forEach((i) => i.addEventListener('input', upd));
      [...dets, sin].filter(Boolean).forEach((i) => { formatoPesos(i); i.addEventListener('input', upd); });
      form.querySelector('[data-detallar]')?.addEventListener('click', (e) => {
        const abrir = panel.hidden;
        panel.hidden = !abrir;
        diezmo.readOnly = abrir;
        diezmo.classList.toggle('calculado', abrir);
        e.currentTarget.innerHTML = abrir ? `${icon('x', 15)} Quitar el detalle por hermano` : `${icon('users', 15)} Detallar diezmos por hermano`;
        if (abrir && !dets.some((i) => pesos(i.value)) && !pesos(sin.value) && pesos(diezmo.value)) sin.value = pesos(diezmo.value).toLocaleString('es-CL');
        upd();
        if (abrir) form.querySelector('[data-buscar]').focus();
      });
      form.querySelector('[data-buscar]')?.addEventListener('input', (e) => {
        const t = e.target.value.toLowerCase();
        form.querySelectorAll('.lote-lista li').forEach((li) => { li.hidden = t && !li.dataset.nombre.includes(t); });
      });
      form._detalle = () => (detalleActivo() ? dets.map((i) => ({ miembroId: i.dataset.id, conyugeId: i.dataset.conyuge || '', monto: pesos(i.value) })).filter((x) => x.monto > 0) : null);
    },
    async onSubmit(form) {
      const d = formData(form);
      const items = cats.map((c, i) => ({ categoria: c, monto: pesos(d['m' + i]) })).filter((x) => x.monto > 0);
      const detalle = form._detalle?.();
      if (detalle && detalle.length) {
        const it = items.find((x) => x.categoria === 'Diezmos');
        if (it) it.detalle = detalle;
      }
      if (!items.length) throw new Error('Ingresa al menos un monto');
      const r = await call('addMovGeneralLote', { fecha: d.fecha, medio: d.medio, descripcion: d.descripcion, items });
      toast(`${r.creados} ingreso${r.creados > 1 ? 's' : ''} registrado${r.creados > 1 ? 's' : ''}${r.diezmosIdentificados ? ` · ${r.diezmosIdentificados} diezmo${r.diezmosIdentificados > 1 ? 's' : ''} por hermano` : ''}`);
      await ctx.refresh();
    }
  });
}

export function render(root, ctx) {
  const { data, mes } = ctx;
  const anio = mes.slice(0, 4);
  const enPeriodo = (m) => (filtros.periodo === 'mes' ? m.mes === mes : m.mes.startsWith(anio));
  const periodoMovs = data.movGenerales.filter(enPeriodo);
  const q = filtros.q.toLowerCase();
  const lista = periodoMovs
    .filter((m) => (!filtros.tipo || m.tipo === filtros.tipo) && (!filtros.categoria || m.categoria === filtros.categoria) && (!filtros.grupo || grupoDe(m.tipo, m.categoria) === filtros.grupo))
    .filter((m) => !q || `${m.categoria} ${m.descripcion} ${m.medio}`.toLowerCase().includes(q))
    .sort((a, b) => (b.fecha + b.creadoEn).localeCompare(a.fecha + a.creadoEn));
  const s = split(periodoMovs);
  const saldoFinal = filtros.periodo === 'mes' ? saldoGeneralHasta(data, mes) : saldoGeneralHasta(data, `${anio}-12`);
  // Se incluye el filtro activo aunque no tenga movimientos en este período, para que siempre se vea
  const categorias = [...new Set([...periodoMovs.map((m) => m.categoria), filtros.categoria].filter(Boolean))].sort();
  const grupos = [...new Set([...periodoMovs.map((m) => grupoDe(m.tipo, m.categoria)), filtros.grupo].filter(Boolean))].sort();
  const hayFiltros = !!(filtros.tipo || filtros.categoria || filtros.grupo || filtros.q);
  const minName = Object.fromEntries(data.ministerios.map((m) => [m.id, m]));

  // saldo acumulado tras cada movimiento (orden cronológico global)
  const saldoTras = new Map();
  {
    let acc = Number(data.config.saldoInicial) || 0;
    const desde = data.config.fechaSaldoInicial || '';
    [...data.movGenerales].sort((a, b) => (a.fecha + a.creadoEn).localeCompare(b.fecha + b.creadoEn)).forEach((m) => {
      if (desde && m.fecha < desde) return;
      acc += m.tipo === 'ingreso' ? m.monto : -m.monto;
      saldoTras.set(m.id, acc);
    });
  }

  root.innerHTML = `
  <section class="page-head">
    <div><span class="eyebrow">Iglesia</span><h1>Tesorería general</h1></div>
    <div class="head-actions">
      <div class="seg seg-sm">
        <label><input type="radio" name="periodo" value="mes" ${filtros.periodo === 'mes' ? 'checked' : ''}><span>Mes</span></label>
        <label><input type="radio" name="periodo" value="anio" ${filtros.periodo === 'anio' ? 'checked' : ''}><span>Año</span></label>
      </div>
      ${filtros.periodo === 'mes' ? monthPicker(mes) : `<div class="month-picker"><button class="icon-btn" data-y="-1">${icon('chevL')}</button><span class="mp-label">Año ${anio}</span><button class="icon-btn" data-y="1">${icon('chevR')}</button></div>`}
    </div>
  </section>

  <section class="kpis kpis-4">
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:${COLOR.ingreso}"></i> Ingresos</span><strong class="kpi-value">${money(s.ingresos)}</strong></article>
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:${COLOR.gasto}"></i> Gastos</span><strong class="kpi-value">${money(s.gastos)}</strong></article>
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:${COLOR.gold}"></i> Resultado</span><strong class="kpi-value ${s.neto < 0 ? 'neg' : 'pos'}">${s.neto < 0 ? '−' : '+'}${money(Math.abs(s.neto))}</strong></article>
    <article class="kpi kpi-dark"><span class="kpi-label">${icon('wallet', 15)} Saldo al cierre</span><strong class="kpi-value">${money(saldoFinal)}</strong></article>
  </section>

  <article class="card">
    <header class="card-head"><div><h3>${filtros.periodo === 'mes' ? `Pulso de ${mesLargo(mes)}` : `Año ${anio} mes a mes`}</h3><p class="muted">${filtros.periodo === 'mes' ? 'Movimientos por día y saldo de caja' : 'Ingresos, gastos y saldo al cierre de cada mes'}</p></div></header>
    <div class="chart-box"><canvas id="ch-gen"></canvas></div>
  </article>

  ${franjaPresupuesto(data, s.gastos, filtros.periodo === 'mes' ? `de ${mesLargo(mes)}` : `del año ${anio}`, filtros.periodo === 'mes' ? 1 : 12)}

  ${tarjetaTipos(periodoMovs, s.gastos, filtros.periodo === 'mes' ? mesLargo(mes) : `año ${anio}`)}

  <article class="card">
    <header class="card-head wrap">
      <div><h3>Libro de movimientos</h3><p class="muted">${lista.length} movimiento${lista.length === 1 ? '' : 's'}${hayFiltros ? ` de ${periodoMovs.length} · con filtros` : ''}</p></div>
      <div class="head-actions">
        <button class="btn btn-ghost btn-sm" data-culto>${icon('church', 16)} Registrar culto</button>
        <button class="btn btn-soft-green btn-sm" data-add="ingreso">${icon('plus', 16)} Ingreso</button>
        <button class="btn btn-soft-rose btn-sm" data-add="gasto">${icon('plus', 16)} Gasto</button>
      </div>
    </header>
    <div class="filters">
      <div class="search">${icon('search', 16)}<input type="search" placeholder="Buscar…" value="${esc(filtros.q)}" data-f="q"></div>
      <select data-f="tipo"><option value="">Ingresos y gastos</option><option value="ingreso" ${filtros.tipo === 'ingreso' ? 'selected' : ''}>Solo ingresos</option><option value="gasto" ${filtros.tipo === 'gasto' ? 'selected' : ''}>Solo gastos</option></select>
      <select data-f="grupo"><option value="">Todos los tipos</option>${grupos.map((g) => `<option ${g === filtros.grupo ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
      <select data-f="categoria"><option value="">Todas las categorías</option>${categorias.map((c) => `<option ${c === filtros.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      ${hayFiltros ? `<button type="button" class="btn btn-ghost btn-sm" data-limpiar>${icon('x', 15)} Quitar filtros</button>` : ''}
    </div>
    ${lista.length ? `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th class="hide-sm">Medio</th><th class="num">Monto</th><th class="num hide-sm">Saldo</th><th></th></tr></thead>
        <tbody>
          ${lista.map((m) => `
          <tr>
            <td class="nowrap">${fecha(m.fecha)}</td>
            <td><span class="cat-pill ${m.tipo}">${esc(m.categoria)}</span><small class="grp">${esc(grupoDe(m.tipo, m.categoria))}</small></td>
            <td class="desc">${esc(m.descripcion)}${m.origen === 'transferencia' && minName[m.ministerioId] ? ` <a class="tag" href="#/ministerio/${m.ministerioId}">${esc(minName[m.ministerioId].icono)} Ítem</a>` : ''}</td>
            <td class="hide-sm muted">${esc(m.medio)}</td>
            <td class="num ${m.tipo} strong">${m.tipo === 'ingreso' ? '+' : '−'}${money(m.monto)}</td>
            <td class="num hide-sm muted">${saldoTras.has(m.id) ? money(saldoTras.get(m.id)) : ''}</td>
            <td class="row-actions">
              ${m.archivoId ? `<button class="icon-btn sm" data-ver="${m.id}" title="Ver comprobante">${icon('receipt', 16)}</button>` : ''}
              ${m.origen !== 'transferencia' && m.origen !== 'diezmo' ? `<button class="icon-btn sm" data-edit="${m.id}" title="Editar">${icon('edit', 16)}</button><button class="icon-btn sm danger" data-del="${m.id}" title="Eliminar">${icon('trash', 16)}</button>` : `<span class="icon-btn sm ghost" title="${m.origen === 'diezmo' ? 'Diezmo por hermano: se corrige en el apartado Diezmos' : 'Transferencia de ítem: se anula desde el detalle del ministerio'}">${icon('lock', 15)}</span>`}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : emptyState('No hay movimientos con estos filtros', 'search')}
  </article>`;

  // Eventos
  bindMonthPicker(root, mes, ctx.setMes);
  root.querySelectorAll('[data-y]').forEach((b) => b.addEventListener('click', () => ctx.setMes(`${+anio + +b.dataset.y}${mes.slice(4)}`)));
  root.querySelectorAll('[name=periodo]').forEach((r) => r.addEventListener('change', () => { filtros.periodo = r.value; filtros.categoria = ''; filtros.grupo = ''; ctx.setMes(mes); }));
  root.querySelectorAll('[data-f]').forEach((el) => {
    const ev = el.tagName === 'INPUT' ? 'input' : 'change';
    el.addEventListener(ev, () => {
      filtros[el.dataset.f] = el.value;
      if (el.tagName === 'INPUT') { clearTimeout(el._t); el._t = setTimeout(() => { ctx.setMes(mes); const s2 = document.querySelector('[data-f=q]'); s2?.focus(); s2?.setSelectionRange(s2.value.length, s2.value.length); }, 300); }
      else ctx.setMes(mes);
    });
  });
  root.querySelector('[data-culto]').addEventListener('click', () => registrarCulto(ctx));
  root.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => nuevoMovGeneral(ctx, b.dataset.add)));
  const byId = (id) => data.movGenerales.find((m) => m.id === id);
  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => nuevoMovGeneral(ctx, null, byId(b.dataset.edit))));
  root.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => { const m = byId(b.dataset.ver); verArchivo(m.archivoId, m.descripcion || m.categoria); }));
  root.querySelector('[data-limpiar]')?.addEventListener('click', () => { Object.assign(filtros, { tipo: '', categoria: '', grupo: '', q: '' }); ctx.setMes(mes); });
  root.querySelectorAll('[data-grupo]').forEach((b) => b.addEventListener('click', () => { filtros.grupo = b.dataset.grupo; filtros.tipo = 'gasto'; filtros.categoria = ''; ctx.setMes(mes); setTimeout(() => document.querySelector('.filters')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }));
  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const m = byId(b.dataset.del);
    if (!(await confirmar(`Se eliminará <b>${esc(m.categoria)}</b> por <b>${money(m.monto)}</b> del ${fecha(m.fecha)}.`, { boton: 'Eliminar', danger: true }))) return;
    try { await call('deleteMovGeneral', { id: m.id }); toast('Movimiento eliminado'); await ctx.refresh(); } catch (e) { toast(e.message, 'err'); }
  }));

  // Gráfico
  const canvas = root.querySelector('#ch-gen');
  if (filtros.periodo === 'mes') {
    const dias = new Date(+mes.slice(0, 4), +mes.slice(5, 7), 0).getDate();
    const ing = Array(dias).fill(0), gas = Array(dias).fill(0);
    periodoMovs.forEach((m) => { const d = +m.fecha.slice(8, 10) - 1; (m.tipo === 'ingreso' ? ing : gas)[d] += m.monto; });
    let acc = saldoGeneralHasta(data, TesoCore.prevMonth(mes));
    const hoy = data.hoy;
    const saldo = ing.map((v, i) => { acc += v - gas[i]; return `${mes}-${String(i + 1).padStart(2, '0')}` > hoy ? null : acc; });
    chart(canvas, {
      data: {
        labels: Array.from({ length: dias }, (_, i) => i + 1),
        datasets: [
          { type: 'bar', label: 'Ingresos', data: ing, backgroundColor: COLOR.ingreso, borderRadius: 4, maxBarThickness: 14 },
          { type: 'bar', label: 'Gastos', data: gas.map((v) => -v), backgroundColor: COLOR.gasto, borderRadius: 4, maxBarThickness: 14 },
          { type: 'line', label: 'Saldo', data: saldo, borderColor: COLOR.gold, tension: 0.3, pointRadius: 0, borderWidth: 2.5, yAxisID: 'y1' }
        ]
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        plugins: { tooltip: { callbacks: { title: (c) => `Día ${c[0].label}`, label: (c) => ` ${c.dataset.label}: ${money(Math.abs(c.raw))}` } } },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, ticks: { callback: (v) => moneyShort(v) }, grid: { color: '#eef0f3' }, border: { display: false } },
          y1: { position: 'right', ticks: { callback: (v) => moneyShort(v) }, grid: { display: false }, border: { display: false } }
        }
      }
    });
  } else {
    const meses = Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, '0')}`);
    const serie = serieGeneral(data, meses);
    chart(canvas, {
      data: {
        labels: meses.map(mesCorto),
        datasets: [
          { type: 'bar', label: 'Ingresos', data: serie.map((x) => x.ingresos), backgroundColor: COLOR.ingreso, borderRadius: 6, maxBarThickness: 22 },
          { type: 'bar', label: 'Gastos', data: serie.map((x) => x.gastos), backgroundColor: COLOR.gasto, borderRadius: 6, maxBarThickness: 22 },
          { type: 'line', label: 'Saldo', data: serie.map((x) => x.saldo), borderColor: COLOR.gold, tension: 0.3, pointRadius: 3, yAxisID: 'y1' }
        ]
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${money(c.raw)}` } } },
        scales: { x: { grid: { display: false } }, y: { ticks: { callback: (v) => moneyShort(v) }, grid: { color: '#eef0f3' }, border: { display: false } }, y1: { position: 'right', ticks: { callback: (v) => moneyShort(v) }, grid: { display: false }, border: { display: false } } }
      }
    });
  }
}

function franjaPresupuesto(data, gastado, etiqueta, factor) {
  const lim = presupuestoGeneralMensual(data) * factor;
  if (!lim) {
    return `<section class="pres-strip"><div class="ps-txt"><span>${icon('wallet', 16)} Presupuesto ${etiqueta}</span><strong>Sin definir</strong><small>no hay límite de gasto</small></div>
      <div class="ps-bar"><p class="muted">Define el presupuesto mensual de la tesorería en Configuración → Presupuesto.</p><a class="btn btn-ghost btn-sm" href="#/admin" style="align-self:flex-start">${icon('settings', 15)} Definir presupuesto</a></div></section>`;
  }
  const pct = gastado / lim;
  const cls = pct > 1 ? 'over' : pct >= 0.9 ? 'near' : '';
  return `<section class="pres-strip ${cls}">
    <div class="ps-txt"><span>${icon('wallet', 16)} Presupuesto ${etiqueta}</span><strong>${money(lim)}</strong><small>todos los gastos, incluidos los ítems</small></div>
    <div class="ps-bar">
      <div class="progress"><span style="width:${Math.min(100, pct * 100)}%"></span></div>
      <div class="ps-nums"><span>Gastado <b>${money(gastado)}</b> (${Math.round(pct * 100)}%)</span><span>${lim >= gastado ? `Disponible <b>${money(lim - gastado)}</b>` : `<b class="gasto">Excedido en ${money(gastado - lim)}</b>`}</span></div>
    </div>
  </section>`;
}

function tarjetaTipos(movs, totalGastos, etiqueta) {
  const grupos = porGrupo(movs, 'gasto');
  if (!grupos.length) return '';
  const max = grupos[0][1];
  return `<article class="card">
    <header class="card-head"><div><h3>Gastos por tipo</h3><p class="muted">${etiqueta} · toca un tipo para ver sus movimientos</p></div></header>
    <ul class="tipos">
      ${grupos.map(([g, v, cats], i) => `
      <li>
        <button type="button" class="tipo-row" data-grupo="${esc(g)}">
          <span class="tipo-name"><i style="background:${PALETA[i % PALETA.length]}"></i>${esc(g)}</span>
          <span class="tipo-bar"><span style="width:${Math.max(2, (v / max) * 100)}%;background:${PALETA[i % PALETA.length]}"></span></span>
          <b>${money(v)}</b><small>${Math.round((v / totalGastos) * 100)}%</small>
        </button>
        <div class="tipo-cats">${cats.map(([c, cv]) => `<span>${esc(c)} <b>${money(cv)}</b></span>`).join('')}</div>
      </li>`).join('')}
    </ul>
  </article>`;
}
