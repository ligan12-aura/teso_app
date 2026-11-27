// Puntualidad del diezmo: cuánto se demoran los hermanos en entregar el diezmo de cada mes.
// Cada diezmo tiene la fecha en que se entregó y el mes al que corresponde; el desfase es la diferencia.
import { icon, esc, chart, COLOR, colorTema } from '../ui.js';
import { inactivoEnAnio } from './miembros.js';

export const DIA_PLAZO = 10; // mismo plazo de gracia que el análisis de diezmos (DIA_GRACIA)
const MESES_C = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const pad = (n) => String(n).padStart(2, '0');
export const sumarMes = (mes, n) => { const t = +mes.slice(0, 4) * 12 + (+mes.slice(5, 7) - 1) + n; return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`; };
const dia = (f) => Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)) / 86400000;

export const TRAMOS = {
  adelantado: { label: 'Adelantado', desc: 'en el mismo mes o antes', color: COLOR.navy },
  puntual: { label: 'Puntual', desc: `hasta el día ${DIA_PLAZO} del mes siguiente`, color: '#2f9e6e' },
  atrasado: { label: 'Atrasado', desc: `después del día ${DIA_PLAZO} del mes siguiente`, color: '#d99a1e' },
  muy: { label: 'Muy atrasado', desc: '2 meses después o más', color: '#d4515f' },
  pendiente: { label: 'Sin entregar', desc: 'el mes ya pasó y no hay diezmo', color: '#9aa3af' }
};

// Desfase de un diezmo: días desde que terminó el mes al que corresponde (0 si se dio antes) y su tramo
export function desfase(d) {
  const sig = sumarMes(d.mes, 1);
  if (d.fecha < `${sig}-01`) return { tramo: 'adelantado', dias: 0 };
  const dias = dia(d.fecha) - dia(`${sig}-01`) + 1;
  if (d.fecha <= `${sig}-${pad(DIA_PLAZO)}`) return { tramo: 'puntual', dias };
  return { tramo: d.fecha.slice(0, 7) === sig ? 'atrasado' : 'muy', dias };
}

// Los diezmos importados del historial (refId) no tienen la fecha real de entrega: no se miden
const conFechaReal = (d) => !d.refId;

// Hermano que debía diezmar ese mes: habilitado, ya era miembro, no estaba de baja ni marcado inactivo ese año
export function elegibleEn(m, mes) {
  if (m.habilitadoDiezmo === 'no' || inactivoEnAnio(m, mes.slice(0, 4))) return false;
  if (m.fechaIngreso && m.fechaIngreso.slice(0, 7) > mes) return false;
  if (m.habilitadoDesde && m.habilitadoDesde.slice(0, 7) > mes) return false;
  if (m.estado === 'activo') return true;
  return !!m.fechaBaja && m.fechaBaja.slice(0, 7) > mes;
}

const mediana = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : Math.round((s[k - 1] + s[k]) / 2);
};

// Cálculo de los últimos 12 meses ya vencidos (el mes anterior cuenta desde el día 11)
export function puntualidad(data, regulares) {
  const hoy = data.hoy, mesHoy = hoy.slice(0, 7);
  const mesPrev = sumarMes(mesHoy, -1);
  const enPlazo = +hoy.slice(8, 10) <= DIA_PLAZO; // el mes anterior aún está dentro del plazo
  const hasta = enPlazo ? sumarMes(mesPrev, -1) : mesPrev;
  regulares = regulares.map((d) => (d.mes ? d : { ...d, mes: d.fecha.slice(0, 7) }));
  // desde el primer mes con diezmos registrados (antes no hay datos, no es que nadie diezmara)
  const primero = regulares.reduce((a, d) => (!a || d.mes < a ? d.mes : a), '');
  const meses = Array.from({ length: 12 }, (_, i) => sumarMes(hasta, i - 11)).filter((m) => primero && m >= primero);
  // diezmos por persona y mes (un diezmo de matrimonio cuenta para los dos)
  const idx = {};
  regulares.forEach((d) => [d.miembroId, d.conyugeId].filter(Boolean).forEach((id) => { (idx[`${id}|${d.mes}`] ||= []).push(d); }));
  // estado de una persona (o matrimonio) en un mes: tramo y días, 'pendiente', o null si solo hay diezmos importados
  const estadoEn = (ids, mes) => {
    const ds = ids.flatMap((id) => idx[`${id}|${mes}`] || []);
    if (!ds.length) return { tramo: 'pendiente' };
    const reales = ds.filter(conFechaReal);
    if (!reales.length) return null;
    return desfase(reales.reduce((a, d) => (d.fecha < a.fecha ? d : a)));
  };
  const porMes = meses.map((mes) => {
    const c = { mes, adelantado: 0, puntual: 0, atrasado: 0, muy: 0, pendiente: 0, total: 0 };
    data.miembros.forEach((m) => {
      if (!elegibleEn(m, mes)) return;
      const e = estadoEn([m.id], mes);
      if (!e) return;
      c[e.tramo]++; c.total++;
    });
    return c;
  });
  const entregados = porMes.reduce((a, c) => a + c.adelantado + c.puntual + c.atrasado + c.muy, 0);
  const aTiempo = porMes.reduce((a, c) => a + c.adelantado + c.puntual, 0);
  const dias = [];
  meses.forEach((mes) => data.miembros.forEach((m) => {
    if (!elegibleEn(m, mes)) return;
    const e = estadoEn([m.id], mes);
    if (e && e.tramo !== 'pendiente') dias.push(e.dias);
  }));
  // quienes aún no entregan el diezmo del mes anterior (los matrimonios juntos)
  const sinPrev = data.miembros.filter((m) => elegibleEn(m, mesPrev) && !(idx[`${m.id}|${mesPrev}`] || []).length);
  const pendientesPrev = [];
  const vistos = new Set();
  const porId = Object.fromEntries(data.miembros.map((m) => [m.id, m]));
  sinPrev.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).forEach((m) => {
    if (vistos.has(m.id)) return;
    vistos.add(m.id);
    const c = m.conyugeId && porId[m.conyugeId];
    if (c && c.conyugeId === m.id && sinPrev.includes(c)) { vistos.add(c.id); pendientesPrev.push({ id: m.id, nombre: `${m.nombre} y ${c.nombre}` }); }
    else pendientesPrev.push({ id: m.id, nombre: m.nombre });
  });
  const importados = !!meses.length && regulares.some((d) => !conFechaReal(d) && d.mes >= meses[0] && d.mes <= hasta);
  // puntualidad habitual de una fila (persona o matrimonio) en esos 12 meses: mediana de días de atraso
  const deFila = (ids) => {
    const ds = meses.map((mes) => estadoEn(ids, mes)).filter((e) => e && e.tramo !== 'pendiente').map((e) => e.dias);
    if (ds.length < 2) return null;
    const med = mediana(ds);
    return { dias: med, puntual: med <= DIA_PLAZO, veces: ds.length };
  };
  return { meses, porMes, entregados, pctATiempo: entregados ? Math.round((aTiempo / entregados) * 100) : null, mediana: mediana(dias), mesPrev, enPlazo, pendientesPrev, importados, deFila };
}

const nombreMes = (mes) => `${MESES_L[+mes.slice(5, 7) - 1]} ${mes.slice(0, 4)}`;

export function tarjetaPuntualidad(p) {
  const hayDatos = p.entregados > 0;
  return `
  <article class="card">
    <header class="card-head"><div><h3>Puntualidad del diezmo</h3><p class="muted">Cuánto se demoran los hermanos en entregar el diezmo de cada mes · ${p.meses.length ? `${p.meses.length === 12 ? 'últimos 12 meses' : `últimos ${p.meses.length} mes${p.meses.length === 1 ? '' : 'es'}`} (${p.meses.length === 1 ? nombreMes(p.meses[0]) : `${nombreMes(p.meses[0])} a ${nombreMes(p.meses[p.meses.length - 1])}`})` : 'aún sin meses vencidos'} · <b>puntual</b> = hasta el día ${DIA_PLAZO} del mes siguiente</p></div></header>
    <div class="punt-stats">
      <div><span class="muted small">Entregados a tiempo</span><strong>${p.pctATiempo === null ? '—' : p.pctATiempo + '%'}</strong><small class="muted">adelantados o puntuales, de ${p.entregados} diezmo${p.entregados === 1 ? '' : 's'}</small></div>
      <div><span class="muted small">Demora habitual</span><strong>${p.mediana === null ? '—' : p.mediana === 0 ? 'Antes de fin de mes' : `${p.mediana} día${p.mediana === 1 ? '' : 's'}`}</strong><small class="muted">${p.mediana ? 'después de terminado el mes (mediana)' : 'mediana de todos los diezmos'}</small></div>
      <div><span class="muted small">Sin entregar ${MESES_L[+p.mesPrev.slice(5, 7) - 1]}</span><strong>${p.pendientesPrev.length}</strong><small class="muted">${p.enPlazo ? `aún en plazo (hasta el ${DIA_PLAZO})` : 'hermanos o matrimonios habilitados'}</small></div>
    </div>
    ${hayDatos ? `<div class="chart-box"><canvas id="ch-punt"></canvas></div>
    <ul class="legend legend-row">${Object.entries(TRAMOS).map(([, t]) => `<li title="${esc(t.desc)}"><i style="background:${colorTema(t.color)}"></i><span>${t.label}</span></li>`).join('')}</ul>` : `<p class="muted small">Aún no hay diezmos con fecha de entrega registrada en estos meses.</p>`}
    <h4 class="dm-tit punt-tit">${icon('clock', 14)} Sin entregar el diezmo de ${nombreMes(p.mesPrev)} <span class="tag ${p.pendientesPrev.length ? 'tag-ambar' : 'tag-verde'}">${p.pendientesPrev.length}</span></h4>
    ${p.pendientesPrev.length ? `<div class="dm-chips">${p.pendientesPrev.map((x) => `<button class="dm-chip" data-abrir-pend="${x.id}">${esc(x.nombre)}</button>`).join('')}</div>` : `<p class="muted small">Todos los hermanos habilitados entregaron el diezmo de ${nombreMes(p.mesPrev)}.</p>`}
    ${p.importados ? `<p class="muted small punt-nota">Los diezmos importados del historial no tienen la fecha real de entrega: no se cuentan en la puntualidad.</p>` : ''}
  </article>`;
}

export function graficoPuntualidad(canvas, p) {
  if (!canvas) return;
  const claves = Object.keys(TRAMOS);
  chart(canvas, {
    type: 'bar',
    data: {
      labels: p.meses.map((m) => `${MESES_C[+m.slice(5, 7) - 1]} ${m.slice(2, 4)}`),
      datasets: claves.map((k) => ({
        label: TRAMOS[k].label, backgroundColor: TRAMOS[k].color, maxBarThickness: 30,
        data: p.porMes.map((c) => (c.total ? Math.round((c[k] / c.total) * 1000) / 10 : 0))
      }))
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: (c) => `Diezmo de ${nombreMes(p.meses[c[0].dataIndex])}`,
          label: (c) => ` ${c.dataset.label}: ${p.porMes[c.dataIndex][claves[c.datasetIndex]]} (${c.raw}%)`
        } }
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, min: 0, max: 100, ticks: { callback: (v) => v + '%' }, border: { display: false } }
      }
    }
  });
}
