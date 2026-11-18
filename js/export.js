// Descarga una copia .xlsx con toda la información (usa SheetJS bajo demanda)
import { toast } from './ui.js';
import { serieGeneral, resumenMinisterio, porGrupo, grupoDe } from './calc.js';

const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = XLSX_URL;
    s.onload = () => res(window.XLSX);
    s.onerror = () => rej(new Error('No se pudo cargar el generador de Excel'));
    document.head.appendChild(s);
  });
}

export async function exportarExcel(data) {
  toast('Generando Excel…');
  const XLSX = await loadXLSX();
  const min = Object.fromEntries(data.ministerios.map((m) => [m.id, m.nombre]));
  const usr = Object.fromEntries(data.usuarios.map((u) => [u.id, u.nombre]));
  const wb = XLSX.utils.book_new();
  const add = (name, rows, widths) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  const byFecha = (a, b) => a.fecha.localeCompare(b.fecha);

  const meses = [...new Set(data.movGenerales.map((m) => m.mes))].sort();
  add('Resumen mensual', serieGeneral(data, meses).map((s) => ({ Mes: s.mes, Ingresos: s.ingresos, Gastos: s.gastos, Resultado: s.neto, 'Saldo al cierre': s.saldo })), [10, 14, 14, 14, 16]);

  add('Tesorería general', [...data.movGenerales].sort(byFecha).map((m) => ({
    Fecha: m.fecha, Mes: m.mes, Tipo: m.tipo, 'Tipo de gasto/ingreso': grupoDe(m.tipo, m.categoria), Categoría: m.categoria, Descripción: m.descripcion, Medio: m.medio,
    Ingreso: m.tipo === 'ingreso' ? m.monto : '', Gasto: m.tipo === 'gasto' ? m.monto : '',
    Ministerio: min[m.ministerioId] || '', Comprobante: m.archivoId ? 'Sí' : '', 'Registrado por': usr[m.creadoPor] || ''
  })), [11, 8, 8, 26, 22, 34, 13, 12, 12, 14, 12, 18]);

  const filasTipo = [];
  porGrupo(data.movGenerales, 'gasto').forEach(([g, , cats]) => {
    const fila = { 'Tipo de gasto': g };
    meses.forEach((mes) => { fila[mes] = data.movGenerales.filter((m) => m.tipo === 'gasto' && m.mes === mes && grupoDe('gasto', m.categoria) === g).reduce((a, m) => a + m.monto, 0); });
    fila.Total = meses.reduce((a, mes) => a + fila[mes], 0);
    filasTipo.push(fila);
  });
  add('Gastos por tipo', filasTipo, [28, ...meses.map(() => 12), 14]);

  add('Ministerios', [...data.movMinisterios].sort(byFecha).map((m) => ({
    Ministerio: min[m.ministerioId] || '', Fecha: m.fecha, Mes: m.mes, Tipo: m.tipo, Categoría: m.categoria, Descripción: m.descripcion,
    Ingreso: m.tipo === 'ingreso' ? m.monto : '', Gasto: m.tipo === 'gasto' ? m.monto : '', Boleta: m.archivoId ? 'Sí' : 'No', 'Registrado por': usr[m.creadoPor] || ''
  })), [14, 11, 8, 8, 20, 34, 12, 12, 8, 18]);

  const mesesMin = [...new Set(data.movMinisterios.map((m) => m.mes))].sort();
  const resumenMin = [];
  data.ministerios.forEach((m) => mesesMin.forEach((mes) => {
    const r = resumenMinisterio(data, m.id, mes);
    if (!r.movs.length) return;
    const rend = data.rendiciones.find((x) => x.ministerioId === m.id && x.mes === mes);
    resumenMin.push({ Ministerio: m.nombre, Mes: mes, 'Saldo inicial': r.saldoInicial, Ingresos: r.ingresos, Gastos: r.gastos, 'Saldo final': r.saldoFinal, 'Gastos sin boleta': r.sinBoleta, Rendición: rend?.estado || 'abierta' });
  }));
  add('Resumen ministerios', resumenMin, [14, 8, 13, 12, 12, 12, 16, 12]);

  add('Rendiciones', data.rendiciones.map((r) => ({
    Ministerio: min[r.ministerioId] || '', Mes: r.mes, Estado: r.estado, 'Enviada': r.fechaEnvio.slice(0, 10), 'Comentario líder': r.comentarioLider,
    'Revisada': r.fechaRevision.slice(0, 10), 'Comentario tesorero': r.comentarioTesorero
  })), [14, 8, 11, 11, 30, 11, 30]);

  add('Transferencias ítem', data.transferencias.map((t) => ({ Ministerio: min[t.ministerioId] || '', 'Ítem del mes': t.mes, Monto: t.monto, 'Fecha transferencia': t.fecha })), [14, 12, 12, 18]);

  const nombreDe = Object.fromEntries((data.miembros || []).map((m) => [m.id, m.nombre]));
  if (data.miembros?.length) add('Miembros', data.miembros.map((m) => ({ Nombre: m.nombre, Estado: m.estado, 'Fecha de nacimiento': m.fechaNacimiento, Celular: m.celular, Correo: m.email, Domicilio: m.domicilio, Notas: m.notas })), [30, 10, 16, 18, 28, 36, 30]);
  if (data.diezmos?.length) add('Diezmos', [...data.diezmos].sort(byFecha).map((d) => ({ Fecha: d.fecha, Mes: d.mes, Hermano: nombreDe[d.miembroId] || '', Monto: d.monto, Medio: d.medio, Notas: d.notas })), [11, 8, 30, 12, 14, 30]);

  XLSX.writeFile(wb, `Tesoreria_ElRedentor_${data.hoy}.xlsx`);
}
