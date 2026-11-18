// Cálculos y agregaciones sobre los datos cargados
const sum = (arr) => arr.reduce((a, x) => a + (Number(x.monto) || 0), 0);
export const total = sum;

export function monthsBack(mes, n) {
  const out = [];
  let m = mes;
  for (let i = 0; i < n; i++) { out.unshift(m); m = TesoCore.prevMonth(m); }
  return out;
}

export function split(movs) {
  const ing = movs.filter((m) => m.tipo === 'ingreso');
  const gas = movs.filter((m) => m.tipo === 'gasto');
  return { ingresos: sum(ing), gastos: sum(gas), neto: sum(ing) - sum(gas) };
}

export function porCategoria(movs, tipo) {
  const map = new Map();
  movs.filter((m) => m.tipo === tipo).forEach((m) => map.set(m.categoria, (map.get(m.categoria) || 0) + m.monto));
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

// Agrupa por tipo de gasto/ingreso (grupo) → [[grupo, total, [[categoria, total], ...]], ...]
export function porGrupo(movs, tipo) {
  const map = new Map();
  movs.filter((m) => m.tipo === tipo).forEach((m) => {
    const g = TesoCore.grupoDe(tipo, m.categoria);
    if (!map.has(g)) map.set(g, { total: 0, cats: new Map() });
    const e = map.get(g);
    e.total += m.monto;
    e.cats.set(m.categoria, (e.cats.get(m.categoria) || 0) + m.monto);
  });
  return [...map.entries()].map(([g, e]) => [g, e.total, [...e.cats.entries()].sort((a, b) => b[1] - a[1])]).sort((a, b) => b[1] - a[1]);
}
export const grupoDe = (tipo, cat) => TesoCore.grupoDe(tipo, cat);

// ---------------- Tesorería general ----------------
function movsVigentes(data) {
  const desde = data.config.fechaSaldoInicial || '';
  return data.movGenerales.filter((m) => !desde || m.fecha >= desde);
}
export function saldoGeneralHasta(data, mes) {
  const movs = movsVigentes(data).filter((m) => m.mes <= mes);
  return (Number(data.config.saldoInicial) || 0) + split(movs).neto;
}
export function saldoGeneralActual(data) {
  return (Number(data.config.saldoInicial) || 0) + split(movsVigentes(data)).neto;
}
export function serieGeneral(data, meses) {
  return meses.map((mes) => {
    const movs = data.movGenerales.filter((m) => m.mes === mes);
    return { mes, ...split(movs), saldo: saldoGeneralHasta(data, mes) };
  });
}
export function movsGeneralesMes(data, mes) {
  return data.movGenerales.filter((m) => m.mes === mes);
}

// ---------------- Ministerios ----------------
export function movsMinisterio(data, mid) {
  return data.movMinisterios.filter((m) => m.ministerioId === mid);
}
// ---------------- Presupuestos ----------------
// Ministerio: presupuesto mensual fijo definido por el tesorero (independiente del ítem). 0 = sin límite
export function presupuestoMinisterio(data, mid, mes, excluirId = '') {
  const m = data.ministerios.find((x) => x.id === mid);
  const gastado = data.movMinisterios.reduce((a, x) => (x.ministerioId === mid && x.mes === mes && x.id !== excluirId && x.tipo === 'gasto' ? a + x.monto : a), 0);
  const limite = m ? Number(m.presupuestoMensual) || 0 : 0;
  return { limite, gastado, disponible: limite - gastado };
}
// Tesorería general: un presupuesto mensual para todos sus gastos, incluidos los ítems (0 = sin límite)
export const presupuestoGeneralMensual = (data) => Number(data.config.presupuestoGeneral) || 0;
export function presupuestoGeneral(data, mes, excluirId = '') {
  const limite = presupuestoGeneralMensual(data);
  const gastado = data.movGenerales.reduce((a, x) => (x.mes === mes && x.tipo === 'gasto' && x.id !== excluirId ? a + x.monto : a), 0);
  return { limite, gastado, disponible: limite - gastado };
}
export const totalItems = (data) => data.ministerios.filter((m) => m.activo).reduce((a, m) => a + m.itemMensual, 0);
export function gastoGeneralPromedio(data, meses) {
  return Math.round(meses.reduce((a, mm) => a + data.movGenerales.reduce((b, x) => (x.mes === mm && x.tipo === 'gasto' ? b + x.monto : b), 0), 0) / (meses.length || 1));
}

export function resumenMinisterio(data, mid, mes) {
  const movs = movsMinisterio(data, mid);
  const antes = movs.filter((m) => m.mes < mes);
  const delMes = movs.filter((m) => m.mes === mes);
  const saldoInicial = split(antes).neto;
  const s = split(delMes);
  const item = sum(delMes.filter((m) => m.origen === 'transferencia'));
  const sinBoleta = delMes.filter((m) => m.tipo === 'gasto' && !m.archivoId).length;
  const boletas = delMes.filter((m) => m.archivoId).length;
  const p = presupuestoMinisterio(data, mid, mes);
  return {
    movs: delMes, saldoInicial, ...s, item, sinBoleta, boletas,
    saldoFinal: saldoInicial + s.neto,
    presupuesto: p.limite, disponiblePres: p.disponible,
    sinPresupuesto: !p.limite,
    uso: p.limite > 0 ? s.gastos / p.limite : 0
  };
}
export function saldoMinisterio(data, mid) {
  return split(movsMinisterio(data, mid)).neto;
}
export function rendicionDe(data, mid, mes) {
  return data.rendiciones.find((r) => r.ministerioId === mid && r.mes === mes) || null;
}
export const estadoDe = (data, mid, mes) => rendicionDe(data, mid, mes)?.estado || 'abierta';
export function transferenciaDe(data, mid, mes) {
  return data.transferencias.find((t) => t.ministerioId === mid && t.mes === mes) || null;
}
export function liderDe(data, mid) {
  return data.usuarios.find((u) => u.rol === 'lider' && u.ministerioId === mid && u.activo) || null;
}
