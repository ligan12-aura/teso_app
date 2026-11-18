// Control de diezmos por hermano (solo tesorero)
import { icon, esc, money, moneyShort, modal, formData, toast, confirmar, emptyState, fecha, chart, COLOR, pesos, formatoPesos, cap, mesLargo } from '../ui.js';
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

const MESES_C = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const pad = (n) => String(n).padStart(2, '0');
// Constante: diezmó en al menos el 80% de los meses transcurridos del año
const UMBRAL_CONSTANTE = 0.8;
export const CATEG_DIEZMO = {
  constante: { label: 'Constante', cls: 'st-ok', color: '#2f9e6e', desc: `diezma en al menos el ${UMBRAL_CONSTANTE * 100}% de los meses` },
  irregular: { label: 'Irregular', cls: 'st-obs', color: '#d99a1e', desc: 'diezma algunos meses' },
  sin: { label: 'No diezma', cls: 'st-sin', color: '#d4515f', desc: 'sin diezmos en el período' }
};
const vista = { anio: null, filtro: 'todos', inactivos: false, q: '' };

// Resumen del año: meses transcurridos y categoría de cada miembro
export function resumenDiezmos(data, anio, incluirInactivos = false) {
  const hoyY = Number(data.hoy.slice(0, 4)), hoyM = Number(data.hoy.slice(5, 7));
  const mesesPeriodo = anio < hoyY ? 12 : anio === hoyY ? hoyM : 0;
  const porMiembro = {};
  const miembros = data.miembros.filter((m) => incluirInactivos || m.estado === 'activo');
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
    const evaluados = anio === hoyY && !meses[hoyM - 1] ? hoyM - 1 : mesesPeriodo;
    const conDiezmo = meses.slice(0, evaluados).filter((v) => v > 0).length;
    const total = meses.reduce((a, v) => a + v, 0);
    // Sin meses evaluables (año futuro o enero recién empezado) no hay categoría
    const cat = !evaluados ? null : conDiezmo === 0 ? 'sin' : conDiezmo / evaluados >= UMBRAL_CONSTANTE ? 'constante' : 'irregular';
    // meses seguidos sin diezmar hasta el último mes evaluado (dentro del año)
    let racha = 0;
    for (let i = evaluados - 1; i >= 0 && !meses[i]; i--) racha++;
    porMiembro[m.id] = { m, meses, pareja, conDiezmo, total, cat, racha, ultimo: ultimoDe[m.id] || '' };
  });
  return { mesesPeriodo, porMiembro };
}

export function render(root, ctx) {
  const { data } = ctx;
  const hoyY = Number(data.hoy.slice(0, 4));
  if (!vista.anio) vista.anio = hoyY;
  const anio = vista.anio;
  const { mesesPeriodo, porMiembro } = resumenDiezmos(data, anio, true);
  const todos = Object.values(porMiembro).sort((a, b) => a.m.nombre.localeCompare(b.m.nombre, 'es'));
  const activos = todos.filter((x) => x.m.estado === 'activo');
  const cuenta = (c) => activos.filter((x) => x.cat === c).length;
  const pct = (n) => (activos.length ? Math.round((n / activos.length) * 100) : 0);
  const identificado = Array(12).fill(0), tesoreria = Array(12).fill(0);
  data.diezmos.forEach((d) => { if (d.fecha.startsWith(String(anio))) identificado[+d.fecha.slice(5, 7) - 1] += d.monto; });
  data.movGenerales.forEach((m) => { if (m.tipo === 'ingreso' && m.categoria === 'Diezmos' && m.fecha.startsWith(String(anio))) tesoreria[+m.fecha.slice(5, 7) - 1] += m.monto; });
  const totId = identificado.reduce((a, v) => a + v, 0), totTes = tesoreria.reduce((a, v) => a + v, 0);
  const q = vista.q.toLowerCase();
  const lista = todos.filter((x) => (vista.inactivos || x.m.estado === 'activo') && (vista.filtro === 'todos' || (x.m.estado === 'activo' && x.cat === vista.filtro)) && (!q || x.m.nombre.toLowerCase().includes(q)));
  const maxCelda = Math.max(1, ...todos.flatMap((x) => x.meses));
  const nombreDe = Object.fromEntries(data.miembros.map((m) => [m.id, m.nombre]));

  root.innerHTML = `
  <section class="page-head">
    <div><span class="eyebrow">Mayordomía</span><h1>Diezmos</h1></div>
    <div class="head-actions">
      <div class="month-picker"><button class="icon-btn" data-y="-1" aria-label="Año anterior">${icon('chevL')}</button><span class="mp-label">Año ${anio}</span><button class="icon-btn" data-y="1" aria-label="Año siguiente">${icon('chevR')}</button></div>
      <button class="btn btn-ghost" data-historial ${data.miembros.length ? '' : 'disabled'}>${icon('sheet', 16)} Importar historial</button>
      <button class="btn btn-primary" data-lote ${data.miembros.length ? '' : 'disabled'}>${icon('plus', 16)} Registrar diezmos</button>
    </div>
  </section>

  ${!data.miembros.length ? `<div class="note">${icon('users', 16)}<span>Para llevar el control de diezmos primero carga a los hermanos en <a class="link" href="#/miembros">Miembros</a> (puedes importar el listado en Excel).</span></div>` : ''}

  <section class="kpis kpis-4">
    <article class="kpi"><span class="kpi-label">${icon('users', 15)} Hermanos activos</span><strong class="kpi-value">${activos.length}</strong><span class="kpi-sub">${mesesPeriodo ? `${mesesPeriodo} mes${mesesPeriodo > 1 ? 'es' : ''} considerados de ${anio}` : 'año sin meses transcurridos'}</span></article>
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:${CATEG_DIEZMO.constante.color}"></i> Constantes</span><strong class="kpi-value">${cuenta('constante')} <small class="kpi-pct">${pct(cuenta('constante'))}%</small></strong><span class="kpi-sub">${CATEG_DIEZMO.constante.desc}</span></article>
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:${CATEG_DIEZMO.irregular.color}"></i> Irregulares</span><strong class="kpi-value">${cuenta('irregular')} <small class="kpi-pct">${pct(cuenta('irregular'))}%</small></strong><span class="kpi-sub">${CATEG_DIEZMO.irregular.desc}</span></article>
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:${CATEG_DIEZMO.sin.color}"></i> No diezman</span><strong class="kpi-value">${cuenta('sin')} <small class="kpi-pct">${pct(cuenta('sin'))}%</small></strong><span class="kpi-sub">${CATEG_DIEZMO.sin.desc}</span></article>
  </section>

  <section class="grid-2-1">
    <article class="card">
      <header class="card-head"><div><h3>Diezmos identificados vs. tesorería</h3><p class="muted">Lo registrado por hermano frente a los diezmos ingresados en la tesorería general</p></div></header>
      <div class="chart-box"><canvas id="ch-conc"></canvas></div>
      <div class="conc-tot"><span>Identificado <b>${money(totId)}</b></span><span>Tesorería <b>${money(totTes)}</b></span><span>${totTes ? `${Math.round((totId / totTes) * 100)}% identificado` : ''}${totTes > totId ? ` · sin identificar <b>${money(totTes - totId)}</b>` : ''}</span></div>
    </article>
    <article class="card">
      <header class="card-head"><div><h3>Hermanos activos</h3><p class="muted">Según los meses con diezmo en ${anio}</p></div></header>
      ${activos.length ? `<div class="donut-wrap"><div class="chart-box donut"><canvas id="ch-cat"></canvas><div class="donut-center"><span>Activos</span><strong>${activos.length}</strong></div></div>
      <ul class="legend">${Object.entries(CATEG_DIEZMO).map(([k, c]) => `<li><i style="background:${c.color}"></i><span>${c.label}</span><b>${cuenta(k)}</b></li>`).join('')}</ul></div>` : emptyState('Sin hermanos activos')}
    </article>
  </section>

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
      <thead><tr><th class="dg-nombre">Hermano</th>${MESES_C.map((m, i) => `<th class="num ${i >= mesesPeriodo ? 'futuro' : ''}">${m}</th>`).join('')}<th class="num">Total</th><th>Estado</th></tr></thead>
      <tbody>${lista.map((x) => `
        <tr class="${x.m.estado === 'inactivo' ? 'inactive' : ''}">
          <td class="dg-nombre"><button class="link-btn dg-ficha" data-ficha="${x.m.id}">${esc(x.m.nombre)}</button>${x.m.conyugeId && nombreDe[x.m.conyugeId] ? `<small class="dg-pareja">💍 ${esc(nombreDe[x.m.conyugeId])}</small>` : ''}${x.m.estado === 'activo' && x.cat !== 'sin' && x.racha >= 2 ? `<small class="dg-racha">${x.racha} meses sin diezmar</small>` : ''}</td>
          ${x.meses.map((v, i) => `<td class="num dg-celda ${i >= mesesPeriodo ? 'futuro' : ''} ${v ? 'con' : ''} ${x.pareja[i] ? 'pareja' : ''}" data-celda="${x.m.id}" data-mes="${i + 1}" ${v ? `style="--int:${(0.25 + 0.75 * (v / maxCelda)).toFixed(2)}"` : ''} title="${esc(x.m.nombre)} · ${MESES_C[i]}${v ? ': ' + money(v) + (x.pareja[i] ? ' (diezmo del matrimonio)' : '') : ''}">${v ? moneyShort(v) : i < mesesPeriodo ? '·' : ''}</td>`).join('')}
          <td class="num strong">${x.total ? money(x.total) : '—'}</td>
          <td>${x.m.estado !== 'activo' ? '<span class="badge st-open">Inactivo</span>' : x.cat ? `<span class="badge ${CATEG_DIEZMO[x.cat].cls}">${CATEG_DIEZMO[x.cat].label}</span>` : '<span class="muted">—</span>'}</td>
        </tr>`).join('')}</tbody>
      <tfoot><tr><td class="dg-nombre"><b>Total identificado</b></td>${identificado.map((v) => `<td class="num"><b>${v ? moneyShort(v) : ''}</b></td>`).join('')}<td class="num"><b>${money(totId)}</b></td><td></td></tr></tfoot>
    </table></div>` : emptyState(data.miembros.length ? 'Nadie coincide con los filtros' : 'Aún no hay miembros registrados', 'users')}
  </article>`;

  // eventos
  root.querySelectorAll('[data-y]').forEach((b) => b.addEventListener('click', () => { vista.anio += Number(b.dataset.y); render(root, ctx); }));
  root.querySelector('[data-lote]')?.addEventListener('click', () => registrarLote(ctx));
  root.querySelector('[data-historial]')?.addEventListener('click', () => importarHistorialDiezmos(ctx));
  root.querySelectorAll('[name=fcat]').forEach((r) => r.addEventListener('change', () => { vista.filtro = r.value; render(root, ctx); }));
  root.querySelector('[data-inactivos]')?.addEventListener('change', (e) => { vista.inactivos = e.target.checked; render(root, ctx); });
  const qi = root.querySelector('[data-q]');
  qi?.addEventListener('input', () => {
    clearTimeout(qi._t);
    qi._t = setTimeout(() => { vista.q = qi.value; render(root, ctx); const n = root.querySelector('[data-q]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250);
  });
  root.querySelectorAll('[data-ficha]').forEach((b) => b.addEventListener('click', () => editarMiembro(ctx, data.miembros.find((m) => m.id === b.dataset.ficha))));
  root.querySelectorAll('[data-celda]').forEach((td) => td.addEventListener('click', () => {
    const mes = `${anio}-${pad(td.dataset.mes)}`;
    if (mes > data.hoy.slice(0, 7)) return toast('Ese mes aún no llega', 'err');
    diezmoDelMes(ctx, data.miembros.find((m) => m.id === td.dataset.celda), mes);
  }));

  // gráficos
  const labels = MESES_C.slice(0, Math.max(mesesPeriodo, 1));
  chart(root.querySelector('#ch-conc'), {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Identificado por hermano', data: identificado.slice(0, labels.length), backgroundColor: COLOR.gold, borderRadius: 5, maxBarThickness: 16 },
      { label: 'Diezmos en tesorería', data: tesoreria.slice(0, labels.length), backgroundColor: COLOR.navy, borderRadius: 5, maxBarThickness: 16 }
    ] },
    options: { interaction: { mode: 'index', intersect: false }, plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${money(c.raw)}` } } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: (v) => moneyShort(v) }, border: { display: false } } } }
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
      ${regs.length ? `<ul class="diezmo-regs">${regs.map((d) => `<li><span>${fecha(d.fecha)}${d.medio ? ` · ${esc(d.medio)}` : ''} ${etiquetaCaja(data, d)}${d.conyugeId ? `<br><small class="muted">💍 Matrimonio: ${esc(nombreDe[d.miembroId] || '')} y ${esc(nombreDe[d.conyugeId] || '')}</small>` : ''}${d.notas ? `<br><small class="muted">${esc(d.notas)}</small>` : ''}</span><b>${money(d.monto)}</b><button type="button" class="icon-btn sm danger" data-borrar="${d.id}" title="Eliminar">${icon('trash', 15)}</button></li>`).join('')}</ul>
        <p class="muted small">Total del mes: <b>${money(regs.reduce((a, d) => a + d.monto, 0))}</b>. Puedes agregar otro diezmo abajo.</p>` : '<p class="muted">Sin diezmos registrados este mes.</p>'}
      <div class="form-row">
        <label class="field"><span>Monto ($)</span><input name="monto" inputmode="numeric" class="input-money" placeholder="0" required></label>
        <label class="field"><span>Fecha</span><input type="date" name="fecha" value="${fechaDef}" min="${mes}-01" max="${mes === data.hoy.slice(0, 7) ? data.hoy : `${mes}-${pad(ultimo)}`}" required></label>
      </div>
      <div class="form-row">
        <label class="field"><span>Medio</span><select name="medio">${opcionesMedio(data)}</select></label>
        <label class="field"><span>Nota (opcional)</span><input name="notas" maxlength="200"></label>
      </div>
      ${conyuge ? `<label class="check pareja-check"><input type="checkbox" name="matrimonio" checked> <span>💍 <b>Diezmo del matrimonio</b> con ${esc(conyuge.nombre)}<br><small class="muted">Cuenta como diezmo de ambos hermanos.</small></span></label>` : ''}
      <label class="check caja-check"><input type="checkbox" name="sumarACaja" checked> <span><b>Sumar a la caja</b> (crea el ingreso en la tesorería general)<br><small class="muted">Desmárcalo solo si este dinero ya está incluido en un culto registrado.</small></span></label>`,
    submitLabel: 'Registrar diezmo',
    onOpen(f, { close }) {
      formatoPesos(f.monto);
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
