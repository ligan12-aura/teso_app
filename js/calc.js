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
export function resumenMinisterio(data, mid, mes) {
  const movs = movsMinisterio(data, mid);
  const antes = movs.filter((m) => m.mes < mes);
  const delMes = movs.filter((m) => m.mes === mes);
  const saldoInicial = split(antes).neto;
  const s = split(delMes);
  const item = sum(delMes.filter((m) => m.origen === 'transferencia'));
  const sinBoleta = delMes.filter((m) => m.tipo === 'gasto' && !m.archivoId).length;
  const boletas = delMes.filter((m) => m.archivoId).length;
  const disponible = saldoInicial + s.ingresos;
  return {
    movs: delMes, saldoInicial, ...s, item, sinBoleta, boletas,
    saldoFinal: saldoInicial + s.neto,
    uso: disponible > 0 ? s.gastos / disponible : (s.gastos > 0 ? 1.01 : 0)
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
