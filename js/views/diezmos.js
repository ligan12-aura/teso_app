// Control de diezmos por hermano (solo tesorero)
import { icon, esc, money, moneyShort, modal, formData, toast, confirmar, emptyState, fecha, chart, COLOR, pesos, formatoPesos, cap, mesLargo, fileToPayload, verArchivo } from '../ui.js';
import { isDemo } from '../api.js';
import { call } from '../api.js';
import { editarMiembro } from './miembros.js';
import { importarHistorialDiezmos } from './diezmosImportar.js';

// Un diezmo cuenta para un hermano si lo dio él o su matrimonio
export const esDeMiembro = (d, mid) => d.miembroId === mid || d.conyugeId === mid;
// Lista para registrar: los matrimonios activos aparecen en una sola fila
export function filasDiezmantes(miembros) {
  const activos = miembros.filter((m) => m.estado === 'activo').sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const porId = Object.fromEntries(miembros.map((m) => [m.id, m]));
  const usados = new Set();
  const filas = [];
  activos.forEach((m) => {
    if (usados.has(m.id)) return;
    const c = m.conyugeId && porId[m.conyugeId];
    if (c && c.conyugeId === m.id && c.estado === 'activo') {
      usados.add(m.id); usados.add(c.id);
      filas.push({ id: m.id, conyugeId: c.id, nombre: `${m.nombre} y ${c.nombre}`, matrimonio: true });
    } else {
      usados.add(m.id);
      filas.push({ id: m.id, conyugeId: '', nombre: m.nombre, matrimonio: false });
    }
  });
  return filas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

const MESES_L = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_C = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const pad = (n) => String(n).padStart(2, '0');
// Constante: diezmó en al menos el 80% de los meses transcurridos del año
const UMBRAL_CONSTANTE = 0.8;
export const CATEG_DIEZMO = {
  constante: { label: 'Constante', cls: 'st-ok', color: '#2f9e6e', desc: `diezma en al menos el ${UMBRAL_CONSTANTE * 100}% de los meses` },
  irregular: { label: 'Irregular', cls: 'st-obs', color: '#d99a1e', desc: 'diezma algunos meses' },
  sin: { label: 'No diezma', cls: 'st-sin', color: '#d4515f', desc: 'sin diezmos en el período' }
};
const vista = { filtro: 'todos', inactivos: false, q: '' };

// Resumen del año: meses transcurridos y categoría de cada miembro
export function resumenDiezmos(data, anio, incluirInactivos = false) {
  const hoyY = Number(data.hoy.slice(0, 4)), hoyM = Number(data.hoy.slice(5, 7));
  const mesesPeriodo = anio < hoyY ? 12 : anio === hoyY ? hoyM : 0;
  const porMiembro = {};
  // Meses del año en que el hermano estuvo activo: todos si sigue activo; si se dio de baja,
  // hasta el mes anterior a la baja; inactivo sin fecha de baja = no cuenta en el año
  const mesesActivo = (m) => {
    if (m.estado === 'activo') return 12;
    if (!m.fechaBaja) return 0;
    const y = +m.fechaBaja.slice(0, 4), mo = +m.fechaBaja.slice(5, 7);
    return y > anio ? 12 : y < anio ? 0 : mo - 1;
  };
  const miembros = data.miembros.filter((m) => incluirInactivos || m.estado === 'activo' || mesesActivo(m) > 0);
  const ultimoDe = {};
  data.diezmos.forEach((d) => [d.miembroId, d.conyugeId].filter(Boolean).forEach((id) => { if (!ultimoDe[id] || d.fecha > ultimoDe[id]) ultimoDe[id] = d.fecha; }));
  miembros.forEach((m) => {
    const meses = Array(12).fill(0);
    const pareja = Array(12).fill(false);
    data.diezmos.forEach((d) => {
      if (!esDeMiembro(d, m.id) || !d.fecha.startsWith(String(anio))) return;
      const i = +d.fecha.slice(5, 7) - 1;
      meses[i] += d.monto;
      if (d.conyugeId) pareja[i] = true;
    });
    // El mes en curso solo cuenta si ya tiene diezmo: mientras no termina, no es una falta
    const activoHasta = mesesActivo(m);
    const evaluados = Math.min(anio === hoyY && !meses[hoyM - 1] ? hoyM - 1 : mesesPeriodo, activoHasta);
    const conDiezmo = meses.slice(0, evaluados).filter((v) => v > 0).length;
    const total = meses.reduce((a, v) => a + v, 0);
    // Sin meses evaluables (año futuro o enero recién empezado) no hay categoría
    const cat = !evaluados ? null : conDiezmo === 0 ? 'sin' : conDiezmo / evaluados >= UMBRAL_CONSTANTE ? 'constante' : 'irregular';
    // meses seguidos sin diezmar hasta el último mes evaluado (dentro del año)
    let racha = 0;
    for (let i = evaluados - 1; i >= 0 && !meses[i]; i--) racha++;
    // "En el período": activo hoy, o que estuvo activo algún mes evaluado del año antes de su baja
    const enPeriodo = m.estado === 'activo' || evaluados > 0;
    const bajaEnAnio = m.estado !== 'activo' && m.fechaBaja && +m.fechaBaja.slice(0, 4) === anio ? +m.fechaBaja.slice(5, 7) : 0;
    // Los no habilitados para diezmar (estudiantes, sin ingresos) no se clasifican ni cuentan en la estadística
    const habilitado = m.habilitadoDiezmo !== 'no';
    porMiembro[m.id] = { m, meses, pareja, conDiezmo, total, cat: enPeriodo && habilitado ? cat : null, racha, enPeriodo, habilitado, activoHasta, bajaEnAnio, ultimo: ultimoDe[m.id] || '' };
  });
  return { mesesPeriodo, porMiembro };
}

export function render(root, ctx) {
  const { data } = ctx;
  const hoyMes = data.hoy.slice(0, 7);
  const mes = ctx.mes || hoyMes;
  const anio = Number(mes.slice(0, 4));
  const mi = Number(mes.slice(5, 7)) - 1;
  const { mesesPeriodo, porMiembro } = resumenDiezmos(data, anio, true);
  const todos = Object.values(porMiembro).sort((a, b) => a.m.nombre.localeCompare(b.m.nombre, 'es'));
  const activos = todos.filter((x) => x.enPeriodo && x.habilitado);
  const cuenta = (c) => activos.filter((x) => x.cat === c).length;
  const nombreDe = Object.fromEntries(data.miembros.map((m) => [m.id, m.nombre]));
  const porId = Object.fromEntries(data.miembros.map((m) => [m.id, m]));

  // ---- Totales y participación de cada mes del año ----
  const totales = Array(12).fill(0), registros = Array(12).fill(0);
  data.diezmos.forEach((d) => { if (d.fecha.startsWith(String(anio))) { const i = +d.fecha.slice(5, 7) - 1; totales[i] += d.monto; registros[i]++; } });
  const activoEn = (x, i) => x.activoHasta > i;
  // Solo cuentan los hermanos activos ese mes y habilitados para diezmar
  const elegibles = (i) => todos.filter((x) => x.habilitado && activoEn(x, i));
  const participacion = totales.map((_, i) => {
    const el = elegibles(i);
    const con = el.filter((x) => x.meses[i] > 0).length;
    return el.length ? Math.round((con / el.length) * 100) : 0;
  });
  const totalAnio = totales.reduce((a, v) => a + v, 0);

  // ---- Mes seleccionado ----
  const futuro = mes > hoyMes;
  const elMes = elegibles(mi);
  const diezmaron = elMes.filter((x) => x.meses[mi] > 0);
  const noDiezmaron = elMes.filter((x) => !x.meses[mi]);
  const noHabMes = todos.filter((x) => !x.habilitado && activoEn(x, mi));
  const noHabConDiezmo = noHabMes.filter((x) => x.meses[mi] > 0).length;
  const pctMes = elMes.length ? Math.round((diezmaron.length / elMes.length) * 100) : 0;
  const ant = mi ? `${anio}-${pad(mi)}` : `${anio - 1}-12`;
  const totalAnt = data.diezmos.filter((d) => d.fecha.slice(0, 7) === ant).reduce((a, d) => a + d.monto, 0);
  const totalMes = totales[mi];
  const variacion = totalAnt ? Math.round(((totalMes - totalAnt) / totalAnt) * 100) : null;
  const regsMes = data.diezmos.filter((d) => d.fecha.slice(0, 7) === mes)
    .map((d) => ({ d, nombre: d.conyugeId && nombreDe[d.conyugeId] ? `${nombreDe[d.miembroId] || '—'} y ${nombreDe[d.conyugeId]}` : (nombreDe[d.miembroId] || '—') }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.d.fecha.localeCompare(b.d.fecha));
  const promedio = regsMes.length ? Math.round(totalMes / regsMes.length) : 0;
  // los matrimonios que no diezmaron aparecen juntos
  const noDiezmaronFilas = [];
  const vistos = new Set();
  noDiezmaron.forEach((x) => {
    if (vistos.has(x.m.id)) return;
    vistos.add(x.m.id);
    const c = x.m.conyugeId && porMiembro[x.m.conyugeId];
    if (c && c.m.conyugeId === x.m.id && noDiezmaron.includes(c)) { vistos.add(c.m.id); noDiezmaronFilas.push({ id: x.m.id, nombre: `${x.m.nombre} y ${c.m.nombre}`, cat: x.cat }); }
    else noDiezmaronFilas.push({ id: x.m.id, nombre: x.m.nombre, cat: x.cat });
  });

  // años que se pueden elegir
  const anios = new Set([Number(hoyMes.slice(0, 4)), anio]);
  data.diezmos.forEach((d) => anios.add(Number(d.fecha.slice(0, 4))));
  const listaAnios = [...anios].sort((a, b) => b - a);

  const q = vista.q.toLowerCase();
  const lista = todos.filter((x) => (vista.inactivos || x.enPeriodo) && (vista.filtro === 'todos' || (x.enPeriodo && x.cat === vista.filtro)) && (!q || x.m.nombre.toLowerCase().includes(q)));
  const maxCelda = Math.max(1, ...todos.flatMap((x) => x.meses));
  const nomMes = cap(mesLargo(mes));

  root.innerHTML = `
  <section class="page-head">
    <div><span class="eyebrow">Mayordomía</span><h1>Diezmos</h1></div>
    <div class="head-actions">
      <div class="month-picker mp-doble" id="mp-diezmo">
        <button type="button" class="icon-btn" data-dir="-1" aria-label="Mes anterior">${icon('chevL')}</button>
        <select class="mp-select" data-sel-mes aria-label="Mes">${MESES_L.map((m, i) => `<option value="${i + 1}" ${i === mi ? 'selected' : ''}>${m}</option>`).join('')}</select>
        <select class="mp-select" data-sel-anio aria-label="Año">${listaAnios.map((y) => `<option ${y === anio ? 'selected' : ''}>${y}</option>`).join('')}</select>
        <button type="button" class="icon-btn" data-dir="1" aria-label="Mes siguiente">${icon('chevR')}</button>
      </div>
      <button class="btn btn-ghost" data-historial ${data.miembros.length ? '' : 'disabled'}>${icon('sheet', 16)} Importar historial</button>
      <button class="btn btn-primary" data-lote ${data.miembros.length ? '' : 'disabled'}>${icon('plus', 16)} Registrar diezmos</button>
    </div>
  </section>

  ${!data.miembros.length ? `<div class="note">${icon('users', 16)}<span>Para llevar el control de diezmos primero carga a los hermanos en <a class="link" href="#/miembros">Miembros</a> (puedes importar el listado en Excel).</span></div>` : ''}
  ${futuro ? `<div class="note">${icon('sparkle', 16)}<span>${nomMes} aún no llega: las cifras del mes aparecerán cuando se registren diezmos.</span></div>` : ''}

  <section class="kpis kpis-4">
    <article class="kpi"><span class="kpi-label">${icon('heart', 15)} Diezmado en ${MESES_L[mi].toLowerCase()}</span><strong class="kpi-value">${money(totalMes)}</strong><span class="kpi-sub">${variacion === null ? (totalAnt ? '' : 'sin diezmos el mes anterior') : `<b class="${variacion >= 0 ? 'ingreso' : 'gasto'}">${variacion >= 0 ? '▲' : '▼'} ${Math.abs(variacion)}%</b> vs. ${mesLargo(ant)} (${money(totalAnt)})`}</span></article>
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:${CATEG_DIEZMO.constante.color}"></i> Diezmaron</span><strong class="kpi-value">${diezmaron.length} <small class="kpi-pct">${pctMes}%</small></strong><span class="kpi-sub">de ${elMes.length} hermanos habilitados para diezmar${noHabConDiezmo ? ` · además ${noHabConDiezmo} no habilitado${noHabConDiezmo > 1 ? 's' : ''}` : ''}</span></article>
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:${CATEG_DIEZMO.sin.color}"></i> No diezmaron</span><strong class="kpi-value">${futuro ? '—' : noDiezmaron.length}</strong><span class="kpi-sub">${futuro ? 'mes por venir' : 'habilitados sin diezmo registrado'}</span></article>
    <article class="kpi"><span class="kpi-label">${icon('receipt', 15)} Promedio por diezmo</span><strong class="kpi-value">${money(promedio)}</strong><span class="kpi-sub">${regsMes.length} diezmo${regsMes.length === 1 ? '' : 's'} registrado${regsMes.length === 1 ? '' : 's'} (matrimonio = 1)</span></article>
  </section>

  <section class="grid-2-1">
    <article class="card">
      <header class="card-head"><div><h3>Mes a mes · ${anio}</h3><p class="muted">Total diezmado cada mes y % de hermanos habilitados que diezmó · total del año <b>${money(totalAnio)}</b></p></div></header>
      <div class="chart-box"><canvas id="ch-mes"></canvas></div>
    </article>
    <article class="card">
      <header class="card-head"><div><h3>Hermanos en ${anio}</h3><p class="muted">Habilitados para diezmar, según los meses con diezmo en el año</p></div></header>
      ${activos.length ? `<div class="donut-wrap"><div class="chart-box donut"><canvas id="ch-cat"></canvas><div class="donut-center"><span>Habilitados</span><strong>${activos.length}</strong></div></div>
      <ul class="legend">${Object.entries(CATEG_DIEZMO).map(([k, c]) => `<li><i style="background:${c.color}"></i><span>${c.label}</span><b>${cuenta(k)}</b></li>`).join('')}</ul></div>` : emptyState('Sin hermanos habilitados para diezmar')}
    </article>
  </section>

  <article class="card">
    <header class="card-head wrap"><div><h3>${nomMes}</h3><p class="muted">Toca un nombre para ver, registrar o editar su diezmo de este mes${noHabMes.length ? ` · ${noHabMes.length} hermano${noHabMes.length > 1 ? 's' : ''} no habilitado${noHabMes.length > 1 ? 's' : ''} para diezmar no se cuenta${noHabMes.length > 1 ? 'n' : ''}` : ''}</p></div></header>
    <div class="dm-cols">
      <section>
        <h4 class="dm-tit">Diezmaron <span class="tag tag-verde">${regsMes.length}</span></h4>
        ${regsMes.length ? `<ul class="dm-lista">${regsMes.map(({ d, nombre }) => `<li><button class="link-btn" data-abrir="${d.miembroId}">${d.conyugeId ? '💍 ' : ''}${esc(nombre)}</button><small class="muted">${fecha(d.fecha)}${d.medio ? ` · ${esc(d.medio)}` : ''}</small><b>${money(d.monto)}</b></li>`).join('')}</ul>
        <div class="dm-total"><span>Total del mes</span><b>${money(totalMes)}</b></div>` : emptyState(futuro ? 'Mes por venir' : 'Sin diezmos registrados este mes', 'heart')}
      </section>
      <section>
        <h4 class="dm-tit">No diezmaron <span class="tag tag-gris">${futuro ? 0 : noDiezmaron.length}</span></h4>
        ${!futuro && noDiezmaronFilas.length ? `<div class="dm-chips">${noDiezmaronFilas.map((x) => `<button class="dm-chip" data-abrir="${x.id}" title="${x.cat ? CATEG_DIEZMO[x.cat].label + ' en ' + anio : ''}">${x.cat ? `<i style="background:${CATEG_DIEZMO[x.cat].color}"></i>` : ''}${esc(x.nombre)}</button>`).join('')}</div>` : emptyState(futuro ? 'Mes por venir' : elMes.length ? '¡Todos los hermanos habilitados diezmaron!' : 'Sin hermanos habilitados este mes', 'users')}
      </section>
    </div>
  </article>

  <article class="card">
    <header class="card-head wrap"><div><h3>Diezmos por hermano · ${anio}</h3><p class="muted">Toca una celda para registrar o editar el diezmo de ese mes. 💍 = diezmo del matrimonio (cuenta para ambos y se suma una sola vez en el total)</p></div></header>
    <div class="filters">
      <div class="search">${icon('search', 16)}<input type="search" placeholder="Buscar hermano…" value="${esc(vista.q)}" data-q></div>
      <div class="seg seg-sm">
        ${[['todos', 'Todos'], ['constante', 'Constantes'], ['irregular', 'Irregulares'], ['sin', 'No diezman']].map(([k, l]) => `<label><input type="radio" name="fcat" value="${k}" ${vista.filtro === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}
      </div>
      <label class="check"><input type="checkbox" data-inactivos ${vista.inactivos ? 'checked' : ''}> Mostrar inactivos</label>
    </div>
    ${lista.length ? `<div class="table-wrap diezmo-wrap"><table class="table diezmo-grid">
      <thead><tr><th class="dg-nombre">Hermano</th>${MESES_C.map((m, i) => `<th class="num ${i >= mesesPeriodo ? 'futuro' : ''} ${i === mi ? 'sel' : ''}">${m}</th>`).join('')}<th class="num">Total</th><th>Estado</th></tr></thead>
      <tbody>${lista.map((x) => `
        <tr class="${!x.enPeriodo || !x.habilitado ? 'inactive' : ''}">
          <td class="dg-nombre"><button class="link-btn dg-ficha" data-ficha="${x.m.id}">${esc(x.m.nombre)}</button>${x.m.conyugeId && nombreDe[x.m.conyugeId] ? `<small class="dg-pareja">💍 ${esc(nombreDe[x.m.conyugeId])}</small>` : ''}${x.m.estado === 'activo' && x.habilitado && x.cat !== 'sin' && x.racha >= 2 ? `<small class="dg-racha">${x.racha} meses sin diezmar</small>` : ''}</td>
          ${x.meses.map((v, i) => `<td class="num dg-celda ${i >= mesesPeriodo ? 'futuro' : ''} ${i === mi ? 'sel' : ''} ${x.m.estado !== 'activo' && i >= x.activoHasta && i < mesesPeriodo ? 'baja' : ''} ${v ? 'con' : ''} ${x.pareja[i] ? 'pareja' : ''}" data-celda="${x.m.id}" data-mes="${i + 1}" ${v ? `style="--int:${(0.25 + 0.75 * (v / maxCelda)).toFixed(2)}"` : ''} title="${esc(x.m.nombre)} · ${MESES_C[i]}${v ? ': ' + money(v) + (x.pareja[i] ? ' (diezmo del matrimonio)' : '') : ''}">${v ? moneyShort(v) : i < mesesPeriodo ? '·' : ''}</td>`).join('')}
          <td class="num strong">${x.total ? money(x.total) : '—'}</td>
          <td>${x.cat ? `<span class="badge ${CATEG_DIEZMO[x.cat].cls}">${CATEG_DIEZMO[x.cat].label}</span>` : x.m.estado !== 'activo' ? '<span class="badge st-open">Inactivo</span>' : !x.habilitado ? '<span class="tag tag-gris" title="Estudiante o sin ingresos: no se cuenta en la estadística">No habilitado</span>' : '<span class="muted">—</span>'}${x.bajaEnAnio ? `<small class="dg-baja">baja ${MESES_C[x.bajaEnAnio - 1].toLowerCase()}</small>` : ''}</td>
        </tr>`).join('')}</tbody>
      <tfoot><tr><td class="dg-nombre"><b>Total</b></td>${totales.map((v, i) => `<td class="num ${i === mi ? 'sel' : ''}"><b>${v ? moneyShort(v) : ''}</b></td>`).join('')}<td class="num"><b>${money(totalAnio)}</b></td><td></td></tr></tfoot>
    </table></div>` : emptyState(data.miembros.length ? 'Nadie coincide con los filtros' : 'Aún no hay miembros registrados', 'users')}
  </article>`;

  // eventos
  const mp = root.querySelector('#mp-diezmo');
  const irA = (y, m) => ctx.setMes(`${y}-${pad(m)}`);
  mp.querySelectorAll('[data-dir]').forEach((b) => b.addEventListener('click', () => {
    let y = anio, m = mi + 1 + Number(b.dataset.dir);
    if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
    irA(y, m);
  }));
  mp.querySelector('[data-sel-mes]').addEventListener('change', (e) => irA(anio, +e.target.value));
  mp.querySelector('[data-sel-anio]').addEventListener('change', (e) => irA(+e.target.value, mi + 1));
  root.querySelector('[data-lote]')?.addEventListener('click', () => registrarLote(ctx));
  root.querySelector('[data-historial]')?.addEventListener('click', () => importarHistorialDiezmos(ctx));
  root.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', () => {
    if (futuro) return toast('Ese mes aún no llega', 'err');
    const m = porId[b.dataset.abrir];
    if (m) diezmoDelMes(ctx, m, mes);
  }));
  root.querySelectorAll('[name=fcat]').forEach((r) => r.addEventListener('change', () => { vista.filtro = r.value; render(root, ctx); }));
  root.querySelector('[data-inactivos]')?.addEventListener('change', (e) => { vista.inactivos = e.target.checked; render(root, ctx); });
  const qi = root.querySelector('[data-q]');
  qi?.addEventListener('input', () => {
    clearTimeout(qi._t);
    qi._t = setTimeout(() => { vista.q = qi.value; render(root, ctx); const n = root.querySelector('[data-q]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250);
  });
  root.querySelectorAll('[data-ficha]').forEach((b) => b.addEventListener('click', () => editarMiembro(ctx, porId[b.dataset.ficha])));
  root.querySelectorAll('[data-celda]').forEach((td) => td.addEventListener('click', () => {
    const m = `${anio}-${pad(td.dataset.mes)}`;
    if (m > hoyMes) return toast('Ese mes aún no llega', 'err');
    diezmoDelMes(ctx, porId[td.dataset.celda], m);
  }));

  // gráficos
  const n = Math.max(mesesPeriodo, mi + 1, 1);
  const labels = MESES_C.slice(0, n);
  chart(root.querySelector('#ch-mes'), {
    type: 'bar',
    data: { labels, datasets: [
      { type: 'line', label: '% que diezmó', data: participacion.slice(0, n).map((v, i) => (i < mesesPeriodo ? v : null)), yAxisID: 'y2', borderColor: COLOR.ingreso, backgroundColor: COLOR.ingreso, pointRadius: 3, tension: 0.3, order: 0 },
      { label: 'Total diezmado', data: totales.slice(0, n), backgroundColor: labels.map((_, i) => (i === mi ? COLOR.gold : COLOR.navy)), borderRadius: 5, maxBarThickness: 26, order: 1 }
    ] },
    options: {
      interaction: { mode: 'index', intersect: false },
      onClick: (_, els) => { if (els.length) irA(anio, els[0].index + 1); },
      plugins: { tooltip: { callbacks: { label: (c) => (c.dataset.yAxisID === 'y2' ? ` ${c.dataset.label}: ${c.raw}%` : ` ${c.dataset.label}: ${money(c.raw)} · ${registros[c.dataIndex]} diezmos`) } } },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: (v) => moneyShort(v) }, border: { display: false } },
        y2: { position: 'right', min: 0, max: 100, grid: { display: false }, ticks: { callback: (v) => v + '%' }, border: { display: false } }
      }
    }
  });
  if (activos.length) {
    chart(root.querySelector('#ch-cat'), {
      type: 'doughnut',
      data: { labels: Object.values(CATEG_DIEZMO).map((c) => c.label), datasets: [{ data: Object.keys(CATEG_DIEZMO).map(cuenta), backgroundColor: Object.values(CATEG_DIEZMO).map((c) => c.color), borderWidth: 2, borderColor: getComputedStyle(document.body).getPropertyValue('--surface') || '#fff' }] },
      options: { cutout: '70%', plugins: { legend: { display: false } } }
    });
  }
}

// ---------------- Diezmo de un hermano en un mes ----------------
const opcionesMedio = (data) => data.medios.map((x) => `<option ${x === 'Transferencia' ? 'selected' : ''}>${x}</option>`).join('');
function etiquetaCaja(data, d) {
  const g = d.movGeneralId && data.movGenerales.find((x) => x.id === d.movGeneralId);
  if (!g) return '<span class="tag tag-gris">solo registro</span>';
  return g.origen === 'diezmo' ? '<span class="tag tag-verde">en caja</span>' : '<span class="tag">culto</span>';
}

function diezmoDelMes(ctx, m, mes) {
  const data = ctx.data;
  const regs = data.diezmos.filter((d) => esDeMiembro(d, m.id) && d.mes === mes).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const nombreDe = Object.fromEntries(data.miembros.map((x) => [x.id, x.nombre]));
  const conyuge = m.conyugeId && data.miembros.find((x) => x.id === m.conyugeId);
  const ultimo = new Date(+mes.slice(0, 4), +mes.slice(5, 7), 0).getDate();
  const fechaDef = mes === data.hoy.slice(0, 7) ? data.hoy : `${mes}-${pad(ultimo)}`;
  return modal({
    title: `${esc(m.nombre)} · ${cap(mesLargo(mes))}`,
    body: `
      ${regs.length ? `<ul class="diezmo-regs">${regs.map((d) => `<li><span>${fecha(d.fecha)}${d.medio ? ` · ${esc(d.medio)}` : ''} ${etiquetaCaja(data, d)}${d.conyugeId ? `<br><small class="muted">💍 Matrimonio: ${esc(nombreDe[d.miembroId] || '')} y ${esc(nombreDe[d.conyugeId] || '')}</small>` : ''}${d.notas ? `<br><small class="muted">${esc(d.notas)}</small>` : ''}</span><b>${money(d.monto)}</b>${d.archivoId ? `<button type="button" class="chip-btn" data-ver="${d.id}">${icon('receipt', 14)} Comprobante</button>` : ''}<button type="button" class="icon-btn sm danger" data-borrar="${d.id}" title="Eliminar">${icon('trash', 15)}</button></li>`).join('')}</ul>
        <p class="muted small">Total del mes: <b>${money(regs.reduce((a, d) => a + d.monto, 0))}</b>. Puedes agregar otro diezmo abajo.</p>` : '<p class="muted">Sin diezmos registrados este mes.</p>'}
      <div class="form-row">
        <label class="field"><span>Monto ($)</span><input name="monto" inputmode="numeric" class="input-money" placeholder="0" required></label>
        <label class="field"><span>Fecha</span><input type="date" name="fecha" value="${fechaDef}" min="${mes}-01" max="${mes === data.hoy.slice(0, 7) ? data.hoy : `${mes}-${pad(ultimo)}`}" required></label>
      </div>
      <div class="form-row">
        <label class="field"><span>Medio</span><select name="medio">${opcionesMedio(data)}</select></label>
        <label class="field"><span>Nota (opcional)</span><input name="notas" maxlength="200"></label>
      </div>
      <div class="field">
        <span>Comprobante (opcional)</span>
        <label class="upload">
          <input type="file" name="archivo" accept="image/*,application/pdf">
          <div class="upload-ui">
            <div class="upload-preview" hidden></div>
            <div class="upload-cta">${icon('camera', 22)}<span><strong>Foto o captura de la transferencia</strong><small>JPG, PNG o PDF · queda guardado como respaldo</small></span></div>
          </div>
        </label>
      </div>
      ${conyuge ? `<label class="check pareja-check"><input type="checkbox" name="matrimonio" checked> <span>💍 <b>Diezmo del matrimonio</b> con ${esc(conyuge.nombre)}<br><small class="muted">Cuenta como diezmo de ambos hermanos.</small></span></label>` : ''}
      <label class="check caja-check"><input type="checkbox" name="sumarACaja" checked> <span><b>Sumar a la caja</b> (crea el ingreso en la tesorería general)<br><small class="muted">Desmárcalo solo si este dinero ya está incluido en un culto registrado.</small></span></label>`,
    submitLabel: 'Registrar diezmo',
    onOpen(f, { close }) {
      formatoPesos(f.monto);
      const file = f.archivo;
      const prev = f.querySelector('.upload-preview');
      file.addEventListener('change', async () => {
        const fl = file.files[0];
        if (!fl) return;
        prev.hidden = false;
        prev.innerHTML = '<div class="spinner sm"></div>';
        try {
          const p = await fileToPayload(fl, isDemo ? 900 : 1600, isDemo ? 0.6 : 0.78);
          file._payload = p;
          prev.innerHTML = p.preview ? `<img src="${p.preview}" alt="Vista previa del comprobante">` : `<span class="has-file">${icon('file', 20)} ${esc(fl.name)}</span>`;
        } catch (e) { prev.innerHTML = `<span class="err">${esc(e.message)}</span>`; file.value = ''; file._payload = null; }
      });
      f.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => {
        const reg = regs.find((x) => x.id === b.dataset.ver);
        if (reg) verArchivo(reg.archivoId, `Comprobante · ${m.nombre} · ${money(reg.monto)}`);
      }));
      f.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
        close(null);
        const reg = regs.find((x) => x.id === b.dataset.borrar);
        const enCaja = reg && data.movGenerales.some((x) => x.id === reg.movGeneralId && x.origen === 'diezmo');
        if (!(await confirmar(`¿Eliminar este diezmo del registro?${enCaja ? '<br><span class="muted">También se eliminará su ingreso en la tesorería general.</span>' : ''}`, { boton: 'Eliminar', danger: true }))) return;
        try { await call('deleteDiezmo', { id: b.dataset.borrar }); toast('Diezmo eliminado'); await ctx.refresh(); } catch (e) { toast(e.message, 'err'); }
      }));
    },
    async onSubmit(f) {
      const d = formData(f);
      d.monto = pesos(d.monto);
      if (!d.monto) throw new Error('Ingresa el monto');
      delete d.matrimonio;
      const comp = f.archivo._payload;
      if (comp) d.archivo = { nombre: comp.nombre, mime: comp.mime, base64: comp.base64 };
      await call('saveDiezmo', { miembroId: m.id, conyugeId: conyuge && f.matrimonio?.checked ? conyuge.id : '', ...d, sumarACaja: !!f.sumarACaja.checked });
      toast(f.sumarACaja.checked ? 'Diezmo registrado y sumado a la caja' : 'Diezmo registrado');
      await ctx.refresh();
    }
  });
}

// ---------------- Registro rápido de varios hermanos (por ejemplo, sobres del domingo) ----------------
function registrarLote(ctx) {
  const data = ctx.data;
  const activos = filasDiezmantes(data.miembros);
  return modal({
    title: 'Registrar diezmos',
    wide: true,
    body: `<p class="muted">Para diezmos recibidos fuera del culto (transferencias, depósitos). Los del culto se detallan en <b>Tesorería → Registrar culto</b>. Solo se guardan las filas con monto.</p>
      <div class="form-row">
        <label class="field"><span>Fecha</span><input type="date" name="fecha" value="${data.hoy}" max="${data.hoy}" required></label>
        <label class="field"><span>Medio</span><select name="medio">${opcionesMedio(data)}</select></label>
      </div>
      <label class="check caja-check"><input type="checkbox" name="sumarACaja" checked> <span><b>Sumar a la caja</b> (crea el ingreso en la tesorería general)<br><small class="muted">Desmárcalo solo si este dinero ya está incluido en un culto registrado.</small></span></label>
      <div class="search lote-buscar">${icon('search', 16)}<input type="search" placeholder="Buscar hermano…" data-buscar></div>
      <ul class="lote-lista">${activos.map((m) => `<li data-nombre="${esc(m.nombre.toLowerCase())}"><span>${m.matrimonio ? '💍 ' : ''}${esc(m.nombre)}</span><input class="lote-monto" data-id="${m.id}" data-conyuge="${m.conyugeId}" inputmode="numeric" placeholder="$0" aria-label="Diezmo de ${esc(m.nombre)}"></li>`).join('')}</ul>
      <div class="culto-total"><span data-cant>0 hermanos</span> · Total: <strong data-total>$0</strong></div>`,
    submitLabel: 'Guardar diezmos',
    onOpen(f) {
      const inputs = [...f.querySelectorAll('.lote-monto')];
      const upd = () => {
        const llenos = inputs.filter((i) => pesos(i.value) > 0);
        f.querySelector('[data-total]').textContent = money(llenos.reduce((a, i) => a + pesos(i.value), 0));
        f.querySelector('[data-cant]').textContent = `${llenos.length} hermano${llenos.length === 1 ? '' : 's'}`;
      };
      inputs.forEach((i) => { formatoPesos(i); i.addEventListener('input', upd); });
      f.querySelector('[data-buscar]').addEventListener('input', (e) => {
        const t = e.target.value.toLowerCase();
        f.querySelectorAll('.lote-lista li').forEach((li) => { li.hidden = t && !li.dataset.nombre.includes(t); });
      });
    },
    async onSubmit(f) {
      const d = formData(f);
      const items = [...f.querySelectorAll('.lote-monto')].map((i) => ({ miembroId: i.dataset.id, conyugeId: i.dataset.conyuge || '', monto: pesos(i.value) })).filter((x) => x.monto > 0);
      if (!items.length) throw new Error('Escribe al menos un monto');
      const r = await call('saveDiezmosLote', { fecha: d.fecha, medio: d.medio, items, sumarACaja: !!f.sumarACaja.checked });
      toast(`${r.creados} diezmo${r.creados > 1 ? 's' : ''} registrado${r.creados > 1 ? 's' : ''}${r.enCaja ? (r.creados > 1 ? ' y sumados' : ' y sumado') + ' a la caja' : ''}`);
      await ctx.refresh();
    }
  });
}
