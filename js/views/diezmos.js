// Control de diezmos por hermano (solo tesorero)
import { icon, esc, money, moneyShort, modal, formData, toast, confirmar, emptyState, fecha, chart, COLOR, pesos, formatoPesos, cap, mesLargo, fileToPayload, verArchivo, sinTildes, coincide } from '../ui.js';
import { isDemo } from '../api.js';
import { call } from '../api.js';
import { editarMiembro, inactivoEnAnio } from './miembros.js';
import { importarHistorialDiezmos } from './diezmosImportar.js';
import { abrirReportesWsp } from './diezmosWsp.js';

// Un diezmo cuenta para un hermano si lo dio él o su matrimonio
export const esDeMiembro = (d, mid) => d.miembroId === mid || d.conyugeId === mid;
// Diezmo especial: ingreso extraordinario (herencia, bono…). Entra a la caja pero no a la estadística del diezmo regular
export const esEspecial = (d) => d.especial === 'si';
export const diezmosRegulares = (data) => data.diezmos.filter((d) => !esEspecial(d));
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
    // año marcado como inactivo en su ficha (dejó de venir ese año): no se evalúa
    if (inactivoEnAnio(m, anio)) return 0;
    if (m.estado === 'activo') return 12;
    if (!m.fechaBaja) return 0;
    const y = +m.fechaBaja.slice(0, 4), mo = +m.fechaBaja.slice(5, 7);
    return y > anio ? 12 : y < anio ? 0 : mo - 1;
  };
  // Primer mes del año en que cuenta: desde que es miembro y desde que está habilitado para diezmar
  // (antes de habilitarse cuenta como no habilitado: no entra en el análisis)
  const desdeFecha = (f) => {
    if (!f) return 0;
    const y = +f.slice(0, 4), mo = +f.slice(5, 7);
    return y < anio ? 0 : y > anio ? 12 : mo - 1;
  };
  const mesDesde = (m) => Math.max(desdeFecha(m.fechaIngreso), m.habilitadoDiezmo !== 'no' ? desdeFecha(m.habilitadoDesde) : 0);
  const miembros = data.miembros.filter((m) => incluirInactivos || m.estado === 'activo' || mesesActivo(m) > 0);
  const ultimoDe = {};
  data.diezmos.forEach((d) => [d.miembroId, d.conyugeId].filter(Boolean).forEach((id) => { if (!ultimoDe[id] || d.fecha > ultimoDe[id]) ultimoDe[id] = d.fecha; }));
  const mesDe = (d) => d.mes || d.fecha.slice(0, 7);
  const regulares = diezmosRegulares(data);
  miembros.forEach((m) => {
    const meses = Array(12).fill(0);
    const pareja = Array(12).fill(false);
    regulares.forEach((d) => {
      // cuenta en el mes al que corresponde el diezmo (no en el que se dio)
      if (!esDeMiembro(d, m.id) || !mesDe(d).startsWith(String(anio))) return;
      const i = +mesDe(d).slice(5, 7) - 1;
      meses[i] += d.monto;
      if (d.conyugeId) pareja[i] = true;
    });
    // El mes en curso solo cuenta si ya tiene diezmo: mientras no termina, no es una falta
    const activoHasta = mesesActivo(m);
    const activoDesde = mesDesde(m);
    const finEval = Math.min(anio === hoyY && !meses[hoyM - 1] ? hoyM - 1 : mesesPeriodo, activoHasta);
    const evaluados = Math.max(0, finEval - activoDesde);
    const conDiezmo = meses.slice(activoDesde, Math.max(activoDesde, finEval)).filter((v) => v > 0).length;
    const total = meses.reduce((a, v) => a + v, 0);
    // Sin meses evaluables (año futuro o enero recién empezado) no hay categoría
    const cat = !evaluados ? null : conDiezmo === 0 ? 'sin' : conDiezmo / evaluados >= UMBRAL_CONSTANTE ? 'constante' : 'irregular';
    // meses seguidos sin diezmar hasta el último mes evaluado (dentro del año)
    let racha = 0;
    for (let i = finEval - 1; i >= activoDesde && !meses[i]; i--) racha++;
    // "En el período": estuvo activo algún mes transcurrido del año (entre su ingreso y su baja)
    const inactivoAnio = inactivoEnAnio(m, anio);
    const enPeriodo = evaluados > 0 || (m.estado === 'activo' && !inactivoAnio && activoDesde < Math.max(mesesPeriodo, 1) && mesesPeriodo > 0);
    const bajaEnAnio = m.estado !== 'activo' && m.fechaBaja && +m.fechaBaja.slice(0, 4) === anio ? +m.fechaBaja.slice(5, 7) : 0;
    // Los no habilitados para diezmar (estudiantes, sin ingresos) no se clasifican ni cuentan en la estadística
    const habilitado = m.habilitadoDiezmo !== 'no';
    porMiembro[m.id] = { m, meses, pareja, conDiezmo, total, cat: enPeriodo && habilitado ? cat : null, racha, enPeriodo, habilitado, inactivoAnio, activoDesde, activoHasta, bajaEnAnio, ultimo: ultimoDe[m.id] || '' };
  });
  return { mesesPeriodo, porMiembro };
}
// Categoría de una fila (persona o matrimonio) a partir de sus meses con diezmo
function categoriaFila(meses, desde, hasta, anio, hoy) {
  const hoyY = Number(hoy.slice(0, 4)), hoyM = Number(hoy.slice(5, 7));
  const mesesPeriodo = anio < hoyY ? 12 : anio === hoyY ? hoyM : 0;
  const fin = Math.min(anio === hoyY && !meses[hoyM - 1] ? hoyM - 1 : mesesPeriodo, hasta);
  const evaluados = Math.max(0, fin - desde);
  const con = meses.slice(desde, Math.max(desde, fin)).filter((v) => v > 0).length;
  let racha = 0;
  for (let i = fin - 1; i >= desde && !meses[i]; i--) racha++;
  return { cat: !evaluados ? null : con === 0 ? 'sin' : con / evaluados >= UMBRAL_CONSTANTE ? 'constante' : 'irregular', racha };
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

  // ---- Totales y participación de cada mes del año (solo diezmo regular; los especiales van aparte) ----
  const totales = Array(12).fill(0), registros = Array(12).fill(0);
  const mesDe = (d) => d.mes || d.fecha.slice(0, 7);
  const regulares = diezmosRegulares(data);
  const especiales = data.diezmos.filter(esEspecial);
  const especialesAnio = especiales.filter((d) => mesDe(d).startsWith(String(anio)));
  const totalEspAnio = especialesAnio.reduce((a, d) => a + d.monto, 0);
  regulares.forEach((d) => { if (mesDe(d).startsWith(String(anio))) { const i = +mesDe(d).slice(5, 7) - 1; totales[i] += d.monto; registros[i]++; } });
  const activoEn = (x, i) => x.activoDesde <= i && x.activoHasta > i;
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
  // diezmos de hermanos que ese mes aún no eran miembros (antes de su ingreso) o ya estaban de baja
  const fueraConDiezmo = todos.filter((x) => x.habilitado && !activoEn(x, mi) && x.meses[mi] > 0).length;
  const pctMes = elMes.length ? Math.round((diezmaron.length / elMes.length) * 100) : 0;
  const ant = mi ? `${anio}-${pad(mi)}` : `${anio - 1}-12`;
  const totalAnt = regulares.filter((d) => mesDe(d) === ant).reduce((a, d) => a + d.monto, 0);
  const totalMes = totales[mi];
  // Un mes futuro no tiene variación (aún no hay diezmos que comparar)
  const variacion = totalAnt && !futuro ? Math.round(((totalMes - totalAnt) / totalAnt) * 100) : null;
  // mismo mes del año anterior
  const antAnio = `${anio - 1}-${pad(mi + 1)}`;
  const totalAntAnio = regulares.filter((d) => mesDe(d) === antAnio).reduce((a, d) => a + d.monto, 0);
  const variacionAnio = totalAntAnio && !futuro ? Math.round(((totalMes - totalAntAnio) / totalAntAnio) * 100) : null;
  const lineaVar = (v, etiqueta, monto) => `<b class="${v >= 0 ? 'ingreso' : 'gasto'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v)}%</b> vs. ${etiqueta} (${money(monto)})`;
  const nombreReg = (d) => (d.conyugeId && nombreDe[d.conyugeId] ? `${nombreDe[d.miembroId] || '—'} y ${nombreDe[d.conyugeId]}` : (nombreDe[d.miembroId] || '—'));
  const espMes = especiales.filter((d) => mesDe(d) === mes).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const totalEspMes = espMes.reduce((a, d) => a + d.monto, 0);
  const regsMes = regulares.filter((d) => mesDe(d) === mes)
    .map((d) => ({ d, nombre: d.conyugeId && nombreDe[d.conyugeId] ? `${nombreDe[d.miembroId] || '—'} y ${nombreDe[d.conyugeId]}` : (nombreDe[d.miembroId] || '—') }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.d.fecha.localeCompare(b.d.fecha));
  // promedio por hermano: el diezmo de un matrimonio cuenta como 2
  const personasMes = regsMes.reduce((a, { d }) => a + (d.conyugeId ? 2 : 1), 0);
  const promedio = personasMes ? Math.round(totalMes / personasMes) : 0;
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
  data.diezmos.forEach((d) => anios.add(Number(mesDe(d).slice(0, 4))));
  const listaAnios = [...anios].sort((a, b) => b - a);

  const q = sinTildes(vista.q);
  // Filas: solo habilitados para diezmar; un matrimonio (ambos habilitados) en una sola fila
  const filasTabla = [];
  const usadosT = new Set();
  todos.filter((x) => x.habilitado).forEach((x) => {
    if (usadosT.has(x.m.id)) return;
    usadosT.add(x.m.id);
    const c = x.m.conyugeId && porMiembro[x.m.conyugeId];
    if (c && c.habilitado && c.m.conyugeId === x.m.id && !usadosT.has(c.m.id)) {
      usadosT.add(c.m.id);
      // meses del matrimonio: sus diezmos juntos (el del matrimonio se suma una vez)
      const meses = Array(12).fill(0), pareja = Array(12).fill(false);
      regulares.forEach((d) => {
        if (!(esDeMiembro(d, x.m.id) || esDeMiembro(d, c.m.id)) || !mesDe(d).startsWith(String(anio))) return;
        const i = +mesDe(d).slice(5, 7) - 1;
        meses[i] += d.monto;
        if (d.conyugeId) pareja[i] = true;
      });
      const desde = Math.min(x.activoDesde, c.activoDesde), hasta = Math.max(x.activoHasta, c.activoHasta);
      const { cat, racha } = categoriaFila(meses, desde, hasta, anio, data.hoy);
      filasTabla.push({ ...x, pareja, meses, total: meses.reduce((a, v) => a + v, 0), activoDesde: desde, activoHasta: hasta, cat: x.enPeriodo || c.enPeriodo ? cat : null, racha, enPeriodo: x.enPeriodo || c.enPeriodo, inactivoAnio: x.inactivoAnio && c.inactivoAnio, conyuge: c.m, bajaEnAnio: x.bajaEnAnio && c.bajaEnAnio ? Math.max(x.bajaEnAnio, c.bajaEnAnio) : 0, nombreFila: `${x.m.nombre} y ${c.m.nombre}` });
    } else filasTabla.push({ ...x, nombreFila: x.m.nombre });
  });
  filasTabla.sort((a, b) => a.nombreFila.localeCompare(b.nombreFila, 'es'));
  const lista = filasTabla.filter((x) => (vista.inactivos || x.enPeriodo) && (vista.filtro === 'todos' || (x.enPeriodo && x.cat === vista.filtro)) && (!q || coincide(x.nombreFila, q)));
  const noHabAnio = todos.filter((x) => !x.habilitado && x.m.estado === 'activo').length;
  const maxCelda = Math.max(1, ...filasTabla.flatMap((x) => x.meses));
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
      <button class="btn btn-ghost" data-wsp ${data.diezmos.length ? '' : 'disabled'}>${icon('send', 16)} Reportes por WhatsApp</button>
      <button class="btn btn-ghost" data-historial ${data.miembros.length ? '' : 'disabled'}>${icon('sheet', 16)} Importar historial</button>
      <button class="btn btn-primary" data-lote ${data.miembros.length ? '' : 'disabled'}>${icon('plus', 16)} Registrar diezmos</button>
    </div>
  </section>

  ${!data.miembros.length ? `<div class="note">${icon('users', 16)}<span>Para llevar el control de diezmos primero carga a los hermanos en <a class="link" href="#/miembros">Miembros</a> (puedes importar el listado en Excel).</span></div>` : ''}
  ${futuro ? `<div class="note">${icon('sparkle', 16)}<span>${nomMes} aún no llega: las cifras del mes aparecerán cuando se registren diezmos.</span></div>` : ''}

  <section class="kpis kpis-4">
    <article class="kpi"><span class="kpi-label">${icon('heart', 15)} Diezmado en ${MESES_L[mi].toLowerCase()}</span><strong class="kpi-value">${money(totalMes)}</strong><span class="kpi-sub">${variacion === null ? (futuro ? 'mes aún no transcurrido' : totalAnt ? '' : 'sin diezmos el mes anterior') : lineaVar(variacion, mesLargo(ant), totalAnt)}${variacionAnio !== null ? `<br>${lineaVar(variacionAnio, mesLargo(antAnio), totalAntAnio)}` : ''}${totalEspMes ? `<br>${icon('sparkle', 12)} además <b>${money(totalEspMes)}</b> en diezmos especiales` : ''}</span></article>
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:${CATEG_DIEZMO.constante.color}"></i> Diezmaron</span><strong class="kpi-value">${diezmaron.length} <small class="kpi-pct">${pctMes}%</small></strong><span class="kpi-sub">de ${elMes.length} hermanos habilitados para diezmar${noHabConDiezmo ? ` · además ${noHabConDiezmo} no habilitado${noHabConDiezmo > 1 ? 's' : ''}` : ''}${fueraConDiezmo ? ` · además ${fueraConDiezmo} fuera de su período (aún no era miembro o no estaba habilitado, o ya no es miembro)` : ''}</span></article>
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:${CATEG_DIEZMO.sin.color}"></i> No diezmaron</span><strong class="kpi-value">${futuro ? '—' : noDiezmaron.length}</strong><span class="kpi-sub">${futuro ? 'mes por venir' : 'habilitados sin diezmo registrado'}</span></article>
    <article class="kpi"><span class="kpi-label">${icon('receipt', 15)} Promedio por hermano</span><strong class="kpi-value">${money(promedio)}</strong><span class="kpi-sub">${regsMes.length} diezmo${regsMes.length === 1 ? '' : 's'} · por hermano (un matrimonio cuenta como 2)</span></article>
  </section>

  <section class="grid-2-1">
    <article class="card">
      <header class="card-head"><div><h3>Mes a mes · ${anio}</h3><p class="muted">Total del diezmo regular cada mes y % de hermanos habilitados que diezmó · total del año <b>${money(totalAnio)}</b>${totalEspAnio ? ` · diezmos especiales aparte: <b>${money(totalEspAnio)}</b>` : ''}</p></div></header>
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
        ${espMes.length ? `<h4 class="dm-tit dm-tit-esp">${icon('sparkle', 14)} Diezmos especiales <span class="tag tag-ambar">${espMes.length}</span></h4>
        <p class="muted small">Ingresos extraordinarios: entran a la caja pero no cuentan en el promedio, las comparaciones ni la constancia.</p>
        <ul class="dm-lista">${espMes.map((d) => `<li><button class="link-btn" data-abrir="${d.miembroId}">${d.conyugeId ? '💍 ' : ''}${esc(nombreReg(d))}</button><small class="muted">${fecha(d.fecha)}${d.notas ? ` · ${esc(d.notas)}` : ''}</small><b>${money(d.monto)}</b></li>`).join('')}</ul>
        <div class="dm-total"><span>Total especiales</span><b>${money(totalEspMes)}</b></div>` : ''}
      </section>
      <section>
        <h4 class="dm-tit">No diezmaron <span class="tag tag-gris">${futuro ? 0 : noDiezmaron.length}</span></h4>
        ${!futuro && noDiezmaronFilas.length ? `<div class="dm-chips">${noDiezmaronFilas.map((x) => `<button class="dm-chip" data-abrir="${x.id}" title="${x.cat ? CATEG_DIEZMO[x.cat].label + ' en ' + anio : ''}">${x.cat ? `<i style="background:${CATEG_DIEZMO[x.cat].color}"></i>` : ''}${esc(x.nombre)}</button>`).join('')}</div>` : emptyState(futuro ? 'Mes por venir' : elMes.length ? '¡Todos los hermanos habilitados diezmaron!' : 'Sin hermanos habilitados este mes', 'users')}
      </section>
    </div>
  </article>

  <article class="card">
    <header class="card-head wrap"><div><h3>Diezmos por hermano · ${anio}</h3><p class="muted">Toca una celda para registrar o editar el diezmo de ese mes. Cada diezmo se ve en el mes al que corresponde. 💍 = matrimonio (una sola fila; en el gráfico cuentan como 2 hermanos)${noHabAnio ? ` · ${noHabAnio} no habilitado${noHabAnio > 1 ? 's' : ''} para diezmar no aparece${noHabAnio > 1 ? 'n' : ''}` : ''}</p></div></header>
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
          <td class="dg-nombre">${x.conyuge ? `💍 <button class="link-btn dg-ficha" data-ficha="${x.m.id}">${esc(x.m.nombre)}</button> y <button class="link-btn dg-ficha" data-ficha="${x.conyuge.id}">${esc(x.conyuge.nombre)}</button>` : `<button class="link-btn dg-ficha" data-ficha="${x.m.id}">${esc(x.m.nombre)}</button>`}${x.m.estado === 'activo' && x.habilitado && x.cat !== 'sin' && x.racha >= 2 ? `<small class="dg-racha">${x.racha} meses sin diezmar</small>` : ''}</td>
          ${x.meses.map((v, i) => `<td class="num dg-celda ${i >= mesesPeriodo ? 'futuro' : ''} ${i === mi ? 'sel' : ''} ${(x.inactivoAnio || (x.m.estado !== 'activo' && i >= x.activoHasta) || i < x.activoDesde) && i < mesesPeriodo ? 'baja' : ''} ${v ? 'con' : ''} ${x.pareja[i] ? 'pareja' : ''}" data-celda="${x.m.id}" data-mes="${i + 1}" data-pareja="${x.conyuge ? 1 : 0}" ${v ? `style="--int:${(0.25 + 0.75 * (v / maxCelda)).toFixed(2)}"` : ''} title="${esc(x.m.nombre)} · ${MESES_C[i]}${v ? ': ' + money(v) + (x.pareja[i] ? ' (diezmo del matrimonio)' : '') : ''}">${v ? moneyShort(v) : i < mesesPeriodo ? '·' : ''}</td>`).join('')}
          <td class="num strong">${x.total ? money(x.total) : '—'}</td>
          <td>${x.cat ? `<span class="badge ${CATEG_DIEZMO[x.cat].cls}">${CATEG_DIEZMO[x.cat].label}</span>` : x.inactivoAnio && x.m.estado === 'activo' ? `<span class="badge st-open" title="Marcado como inactivo en ${anio} en su ficha: ese año no se evalúa">Inactivo en ${anio}</span>` : x.m.estado !== 'activo' ? `<span class="badge st-open">${{ trasladado: 'Trasladado', fallecido: 'Fallecido' }[x.m.estado] || 'Inactivo'}</span>` : !x.habilitado ? '<span class="tag tag-gris" title="Estudiante o sin ingresos: no se cuenta en la estadística">No habilitado</span>' : '<span class="muted">—</span>'}${x.bajaEnAnio ? `<small class="dg-baja">${{ trasladado: 'traslado', fallecido: 'fallecimiento' }[x.m.estado] || 'baja'} ${MESES_C[x.bajaEnAnio - 1].toLowerCase()}</small>` : ''}</td>
        </tr>`).join('')}</tbody>
      <tfoot><tr><td class="dg-nombre"><b>Total</b></td>${totales.map((v, i) => `<td class="num ${i === mi ? 'sel' : ''}"><b>${v ? moneyShort(v) : ''}</b></td>`).join('')}<td class="num"><b>${money(totalAnio)}</b></td><td></td></tr></tfoot>
    </table></div>` : emptyState(data.miembros.length ? 'Nadie coincide con los filtros' : 'Aún no hay miembros registrados', 'users')}
  </article>`;

  // eventos
  const limiteMes = (() => { const t = +hoyMes.slice(0, 4) * 12 + (+hoyMes.slice(5, 7) - 1) + 12; return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`; })();
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
  root.querySelector('[data-wsp]')?.addEventListener('click', () => abrirReportesWsp(ctx, anio));
  root.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', () => {
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
    if (m > limiteMes) return toast('Solo se pueden registrar diezmos hasta 12 meses adelante', 'err');
    // en la fila de un matrimonio se ven y corrigen los diezmos de los dos
    diezmoDelMes(ctx, porId[td.dataset.celda], m, { pareja: td.dataset.pareja === '1' });
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

function diezmoDelMes(ctx, m, mes, { pareja = false } = {}) {
  const data = ctx.data;
  const conyugePareja = pareja && m.conyugeId ? m.conyugeId : '';
  const regs = data.diezmos.filter((d) => (esDeMiembro(d, m.id) || (conyugePareja && esDeMiembro(d, conyugePareja))) && (d.mes || d.fecha.slice(0, 7)) === mes).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const nombreDe = Object.fromEntries(data.miembros.map((x) => [x.id, x.nombre]));
  const conyuge = m.conyugeId && data.miembros.find((x) => x.id === m.conyugeId);
  // la fecha es cuando se entregó (hoy por defecto); el mes al que corresponde es el de la celda
  const fechaDef = data.hoy;
  return modal({
    title: `${esc(m.nombre)} · ${cap(mesLargo(mes))}`,
    body: `
      ${regs.length ? `<ul class="diezmo-regs">${regs.map((d) => `<li><span>${d.fecha.slice(0, 7) !== mes ? `Entregado el ${fecha(d.fecha)}` : fecha(d.fecha)}${d.medio ? ` · ${esc(d.medio)}` : ''} ${etiquetaCaja(data, d)}${d.conyugeId ? `<br><small class="muted">💍 Matrimonio: ${esc(nombreDe[d.miembroId] || '')} y ${esc(nombreDe[d.conyugeId] || '')}</small>` : ''}${conyugePareja && !d.conyugeId ? `<br><small class="muted">Diezmo de ${esc(nombreDe[d.miembroId] || '')}</small>` : ''}${d.notas ? `<br><small class="muted">${esc(d.notas)}</small>` : ''}${esEspecial(d) ? ' <span class="tag tag-ambar">Especial</span>' : ''}</span><b>${money(d.monto)}</b>${d.archivoId ? `<button type="button" class="chip-btn" data-ver="${d.id}">${icon('receipt', 14)} Comprobante</button>` : ''}<button type="button" class="icon-btn sm" data-editar="${d.id}" title="Corregir" aria-label="Corregir">${icon('edit', 15)}</button><button type="button" class="icon-btn sm danger" data-borrar="${d.id}" title="Eliminar">${icon('trash', 15)}</button></li>`).join('')}</ul>
        <p class="muted small">Total del mes: <b>${money(regs.reduce((a, d) => a + d.monto, 0))}</b>. Puedes agregar otro diezmo abajo o corregir uno con ${icon('edit', 12)}.</p>` : '<p class="muted">Sin diezmos registrados este mes.</p>'}
      <div class="note" data-editando hidden>${icon('edit', 16)}<span>Corrigiendo el diezmo del <b data-ed-fecha></b>. <button type="button" class="link-btn" data-cancelar-ed>Cancelar corrección</button></span></div>
      <div class="form-row">
        <label class="field"><span>Monto ($)</span><input name="monto" inputmode="numeric" class="input-money" placeholder="0" required></label>
        <label class="field"><span>Fecha en que lo entregó</span><input type="date" name="fecha" value="${fechaDef}" max="${data.hoy}" required></label>
      </div>
      <div class="field meses-diezmo">
        <span>¿A qué mes o meses corresponde? <small class="muted" data-meses-ayuda>Toca uno o más meses</small></span>
        <div class="md-anio"><button type="button" class="icon-btn sm" data-anio="-1" aria-label="Año anterior">${icon('chevL', 16)}</button><b data-anio-lbl></b><button type="button" class="icon-btn sm" data-anio="1" aria-label="Año siguiente">${icon('chevR', 16)}</button></div>
        <div class="md-grid" data-meses role="group" aria-label="Meses del diezmo"></div>
        <small class="hint" data-reparto></small>
      </div>
      ${conyuge ? `<label class="check pareja-check"><input type="checkbox" name="matrimonio" checked> <span>💍 <b>Diezmo del matrimonio</b> con ${esc(conyuge.nombre)}<br><small class="muted">Cuenta como diezmo de ambos hermanos.</small></span></label>` : ''}
      <label class="check especial-check"><input type="checkbox" name="especial"> <span>${icon('sparkle', 13)} <b>Diezmo especial</b> (ingreso extraordinario: herencia, bono, venta…)<br><small class="muted">Entra a la caja como “Diezmos especiales”, aparte del diezmo regular: no cuenta en promedios, comparaciones ni constancia. Es de un solo mes.</small></span></label>
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
      <label class="check caja-check"><input type="checkbox" name="sumarACaja" checked> <span><b>Sumar a la caja</b> (crea el ingreso en la tesorería general, en la fecha en que se entregó)<br><small class="muted">Desmárcalo solo si ese dinero ya se registró en la tesorería por otra vía.</small></span></label>`,
    submitLabel: 'Registrar diezmo',
    onOpen(f, { close }) {
      formatoPesos(f.monto);
      // ---- meses del diezmo: se tocan uno o más (también no seguidos); el monto se reparte en partes iguales ----
      const MES_C2 = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const MES_L2 = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      const tope = (() => { const t = +data.hoy.slice(0, 4) * 12 + (+data.hoy.slice(5, 7) - 1) + 12; return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`; })();
      // meses en que este hermano (o su matrimonio) ya tiene diezmo: se marcan con un punto
      const yaTiene = new Set(data.diezmos.filter((d) => esDeMiembro(d, m.id) || (conyuge && esDeMiembro(d, conyuge.id))).map((d) => d.mes || d.fecha.slice(0, 7)));
      const elegidos = new Set([mes]);
      let anioVista = +mes.slice(0, 4);
      const unSolo = () => f.especial.checked || !!f.dataset.editId; // especial o corrección: un solo mes
      const nombreMes = (mm) => `${MES_L2[+mm.slice(5, 7) - 1]}${mm.slice(0, 4) !== data.hoy.slice(0, 4) || [...elegidos].some((x) => x.slice(0, 4) !== mm.slice(0, 4)) ? ' ' + mm.slice(0, 4) : ''}`;
      const lista = () => [...elegidos].sort();
      const pintarMeses = () => {
        f.querySelector('[data-anio-lbl]').textContent = anioVista;
        f.querySelector('[data-anio="1"]').disabled = `${anioVista + 1}-01` > tope;
        f.querySelector('[data-meses]').innerHTML = MES_C2.map((c, i) => {
          const mm = `${anioVista}-${pad(i + 1)}`;
          const on = elegidos.has(mm), fuera = mm > tope;
          return `<button type="button" class="md-mes ${on ? 'on' : ''}" data-mes="${mm}" aria-pressed="${on}" ${fuera ? 'disabled' : ''} title="${MES_L2[i]} ${anioVista}${yaTiene.has(mm) ? ' · ya tiene diezmo' : ''}">${c}${yaTiene.has(mm) ? '<i class="md-ya" aria-hidden="true"></i>' : ''}</button>`;
        }).join('');
        const l = lista(), monto = pesos(f.monto.value);
        f.querySelector('[data-meses-ayuda]').innerHTML = `${unSolo() ? 'Toca el mes' : 'Toca uno o más meses'}${yaTiene.size ? ' · <i class="md-ya md-ya-ley" aria-hidden="true"></i> ya tiene diezmo' : ''}`;
        const txt = !l.length ? 'Elige al menos un mes.'
          : l.length === 1 ? `Diezmo de ${nombreMes(l[0])}${l[0] !== data.hoy.slice(0, 7) && monto ? ` · ${money(monto)}` : ''}.`
          : `Se reparte en ${l.length} meses (${l.map(nombreMes).join(', ').replace(/, ([^,]*)$/, ' y $1')})${monto ? `: ${money(Math.floor(monto / l.length))} por mes` : ''}.`;
        f.querySelector('[data-reparto]').textContent = txt;
      };
      f.querySelector('[data-meses]').addEventListener('click', (e) => {
        const b = e.target.closest('[data-mes]');
        if (!b || b.disabled) return;
        const mm = b.dataset.mes;
        if (unSolo()) { elegidos.clear(); elegidos.add(mm); }
        else if (elegidos.has(mm)) elegidos.delete(mm);
        else elegidos.add(mm);
        pintarMeses();
      });
      f.querySelectorAll('[data-anio]').forEach((b) => b.addEventListener('click', () => { anioVista += +b.dataset.anio; pintarMeses(); }));
      ['input', 'change'].forEach((ev) => f.monto.addEventListener(ev, pintarMeses));
      // un diezmo especial es de una sola vez: queda un solo mes (el primero elegido)
      f.especial.addEventListener('change', () => { if (unSolo() && elegidos.size > 1) { const p0 = lista()[0]; elegidos.clear(); elegidos.add(p0); } pintarMeses(); });
      pintarMeses();
      f._mesesElegidos = lista;
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
      // Corregir un diezmo ya registrado: se cargan sus datos en el formulario
      const btnGuardar = f.querySelector('button[type="submit"]');
      const cajaCheck = f.querySelector('.caja-check');
      const salirEdicion = () => {
        delete f.dataset.editId;
        f.querySelector('[data-editando]').hidden = true;
        cajaCheck.hidden = false;
        f.fecha.readOnly = false;
        f.monto.value = ''; f.notas.value = ''; f.fecha.value = fechaDef;
        f.especial.checked = false;
        elegidos.clear(); elegidos.add(mes); anioVista = +mes.slice(0, 4); pintarMeses();
        btnGuardar.textContent = 'Registrar diezmo';
      };
      f.querySelector('[data-cancelar-ed]').addEventListener('click', salirEdicion);
      f.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => {
        const reg = regs.find((x) => x.id === b.dataset.editar);
        if (!reg) return;
        f.dataset.editId = reg.id;
        f.monto.value = Number(reg.monto).toLocaleString('es-CL');
        f.fecha.value = reg.fecha;
        // al corregir se edita ese registro (un solo mes)
        const mr = reg.mes || reg.fecha.slice(0, 7);
        elegidos.clear(); elegidos.add(mr); anioVista = +mr.slice(0, 4);
        if ([...f.medio.options].some((o) => o.value === reg.medio)) f.medio.value = reg.medio;
        f.notas.value = reg.notas || '';
        f.especial.checked = esEspecial(reg);
        if (f.matrimonio) f.matrimonio.checked = !!reg.conyugeId;
        // el diezmo de un culto queda en la fecha del culto; "Sumar a la caja" no aplica al corregir
        const deCulto = reg.movGeneralId && data.movGenerales.some((x) => x.id === reg.movGeneralId && x.origen !== 'diezmo');
        f.fecha.readOnly = !!deCulto;
        cajaCheck.hidden = true;
        f.querySelector('[data-ed-fecha]').textContent = fecha(reg.fecha);
        f.querySelector('[data-editando]').hidden = false;
        pintarMeses();
        btnGuardar.textContent = 'Guardar corrección';
        f.monto.focus();
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
      d.especial = !!f.especial.checked;
      const meses = f._mesesElegidos();
      if (!meses.length) throw new Error('Elige el mes o los meses a los que corresponde el diezmo');
      const comp = f.archivo._payload;
      if (comp) d.archivo = { nombre: comp.nombre, mime: comp.mime, base64: comp.base64 };
      const editId = f.dataset.editId;
      if (editId) {
        const reg = regs.find((x) => x.id === editId);
        const titular = reg?.miembroId || m.id;
        const otro = titular === m.id ? conyuge?.id : m.id;
        const conyugeId = conyuge ? (f.matrimonio?.checked ? otro : '') : (reg?.conyugeId || '');
        delete d.sumarACaja;
        await call('saveDiezmo', { id: editId, miembroId: reg?.miembroId || m.id, conyugeId, ...d, mes: meses[0] });
        toast('Diezmo corregido');
        await ctx.refresh();
        return;
      }
      const r = await call('saveDiezmo', { miembroId: m.id, conyugeId: conyuge && f.matrimonio?.checked ? conyuge.id : '', ...d, mes: meses[0], mesesLista: meses, sumarACaja: !!f.sumarACaja.checked });
      toast(`${r?.creados > 1 ? `Diezmo repartido en ${r.creados} meses` : d.especial ? 'Diezmo especial registrado' : 'Diezmo registrado'}${f.sumarACaja.checked ? ' y sumado a la caja' : ''}`);
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
    body: `<p class="muted">Todos los diezmos se registran aquí (los sobres del culto, transferencias o depósitos). Solo se guardan las filas con monto.</p>
      <div class="form-row">
        <label class="field"><span>Fecha en que se entregó</span><input type="date" name="fecha" value="${data.hoy}" max="${data.hoy}" required></label>
        <label class="field"><span>Corresponde al mes de</span><input type="month" name="mes" value="${data.hoy.slice(0, 7)}" required></label>
        <label class="field"><span>Medio</span><select name="medio">${opcionesMedio(data)}</select></label>
      </div>
      <p class="muted small">Si a alguien le corresponde otro mes, o dio el diezmo de varios meses, regístralo tocando su nombre en la tabla de Diezmos. Marca <b>Especial</b> en la fila de quien entrega un diezmo por un ingreso fuera de lo normal (herencia, bono, venta…): va aparte del diezmo regular.</p>
      <label class="check caja-check"><input type="checkbox" name="sumarACaja" checked> <span><b>Sumar a la caja</b> (crea el ingreso en la tesorería general)<br><small class="muted">Desmárcalo solo si ese dinero ya se registró en la tesorería por otra vía.</small></span></label>
      <div class="search lote-buscar">${icon('search', 16)}<input type="search" placeholder="Buscar hermano…" data-buscar></div>
      <ul class="lote-lista">${activos.map((m) => `<li data-nombre="${esc(sinTildes(m.nombre))}"><span>${m.matrimonio ? '💍 ' : ''}${esc(m.nombre)}</span><label class="check lote-esp" title="Diezmo especial: ingreso extraordinario, aparte del diezmo regular"><input type="checkbox" data-esp="${m.id}"> Especial</label><input class="lote-monto" data-id="${m.id}" data-conyuge="${m.conyugeId}" inputmode="numeric" placeholder="$0" aria-label="Diezmo de ${esc(m.nombre)}"></li>`).join('')}</ul>
      <div class="culto-total"><span data-cant>0 hermanos</span> · Total: <strong data-total>$0</strong><span data-esp-total></span></div>`,
    submitLabel: 'Guardar diezmos',
    onOpen(f) {
      const inputs = [...f.querySelectorAll('.lote-monto')];
      const upd = () => {
        const llenos = inputs.filter((i) => pesos(i.value) > 0);
        f.querySelector('[data-total]').textContent = money(llenos.reduce((a, i) => a + pesos(i.value), 0));
        f.querySelector('[data-cant]').textContent = `${llenos.length} hermano${llenos.length === 1 ? '' : 's'}`;
        const esp = llenos.filter((i) => f.querySelector(`[data-esp="${i.dataset.id}"]`)?.checked).reduce((a, i) => a + pesos(i.value), 0);
        f.querySelector('[data-esp-total]').textContent = esp ? ` (de ellos ${money(esp)} en diezmos especiales)` : '';
      };
      f.querySelectorAll('[data-esp]').forEach((c) => c.addEventListener('change', upd));
      inputs.forEach((i) => { formatoPesos(i); i.addEventListener('input', upd); });
      f.querySelector('[data-buscar]').addEventListener('input', (e) => {
        const t = sinTildes(e.target.value);
        f.querySelectorAll('.lote-lista li').forEach((li) => { li.hidden = t && !coincide(li.dataset.nombre, t); });
      });
    },
    async onSubmit(f) {
      const d = formData(f);
      const items = [...f.querySelectorAll('.lote-monto')].map((i) => ({ miembroId: i.dataset.id, conyugeId: i.dataset.conyuge || '', monto: pesos(i.value), especial: !!f.querySelector(`[data-esp="${i.dataset.id}"]`)?.checked })).filter((x) => x.monto > 0);
      if (!items.length) throw new Error('Escribe al menos un monto');
      const r = await call('saveDiezmosLote', { fecha: d.fecha, mes: d.mes, medio: d.medio, items, sumarACaja: !!f.sumarACaja.checked });
      toast(`${r.creados} diezmo${r.creados > 1 ? 's' : ''} registrado${r.creados > 1 ? 's' : ''}${r.enCaja ? (r.creados > 1 ? ' y sumados' : ' y sumado') + ' a la caja' : ''}`);
      await ctx.refresh();
    }
  });
}
