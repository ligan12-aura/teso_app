// Descarga una copia .xlsx con toda la información (usa SheetJS bajo demanda)
import { toast } from './ui.js';
import { serieGeneral, resumenMinisterio, porGrupo, grupoDe } from './calc.js';

const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = XLSX_URL;
    s.integrity = 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw'; s.crossOrigin = 'anonymous';
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
  if (data.miembros?.length) add('Miembros', data.miembros.map((m) => ({ Nombre: m.nombre, RUT: m.rut || '', Estado: m.estado, 'Miembro desde': m.fechaIngreso || '', 'Fecha de baja / traslado': m.fechaBaja || '', 'Trasladado a': m.trasladoA || '', Cónyuge: nombreDe[m.conyugeId] || '', 'Habilitado para diezmar': m.habilitadoDiezmo === 'no' ? 'No' : 'Sí', 'Habilitado desde': m.habilitadoDiezmo !== 'no' ? m.habilitadoDesde || '' : '', 'Fecha de nacimiento': m.fechaNacimiento, 'Estado civil': m.estadoCivil || '', Celular: m.celular, Correo: m.email, Domicilio: m.domicilio, Notas: m.notas })), [30, 13, 10, 13, 13, 24, 26, 12, 14, 16, 14, 18, 28, 36, 30]);
  if (data.diezmos?.length) add('Diezmos', [...data.diezmos].sort(byFecha).map((d) => ({ 'Fecha de entrega': d.fecha, 'Mes que corresponde': d.mes, Hermano: nombreDe[d.miembroId] || '', 'Cónyuge (matrimonio)': nombreDe[d.conyugeId] || '', Monto: d.monto, Especial: d.especial === 'si' ? 'Sí' : '', Medio: d.medio, 'En la caja': d.movGeneralId ? 'Sí' : 'No', Notas: d.notas })), [11, 8, 30, 26, 12, 9, 14, 10, 30]);

  // Asistencia y visitas
  const persona = {};
  (data.personasAsistencia || []).forEach((p) => { persona[p.id] = p; (p.alias || []).forEach((a) => { persona[a] = p; }); });
  if (data.asistencias?.length) add('Asistencia', [...data.asistencias].sort(byFecha).map((a) => {
    const ids = String(a.presentes || '').split(',').filter(Boolean);
    const nombres = [...new Set(ids.map((id) => persona[id]?.nombre || '(eliminado)'))];
    return { Fecha: a.fecha, Actividad: a.actividad, Presentes: nombres.length, Nombres: nombres.join(', '), Notas: a.notas };
  }), [11, 22, 10, 90, 30]);
  const visitas = (data.personasAsistencia || []).filter((p) => p.tipo === 'visita');
  if (visitas.length) add('Visitas', visitas.map((v) => ({ Nombre: v.nombre, Celular: v.celular, 'Desde': v.desde, Activa: v.activo ? 'Sí' : 'No', Notas: v.notas || '' })), [30, 18, 12, 8, 30]);

  // Discipulados en hogares
  if (data.gruposHogar?.length) {
    const grupo = Object.fromEntries(data.gruposHogar.map((g) => [g.id, g]));
    const ph = Object.fromEntries((data.personasHogar || []).map((x) => [x.id, x]));
    add('Discipulados', (data.personasHogar || []).map((x) => ({ Grupo: grupo[x.grupoId]?.nombre || '', Sector: grupo[x.grupoId]?.sector || '', Nombre: x.nombre, Tipo: x.tipo === 'visita' ? 'Visita' : x.esMiembro ? 'Miembro' : 'No miembro', Celular: x.celular, Activo: x.activo ? 'Sí' : 'No', Notas: x.notas })), [24, 16, 30, 12, 18, 8, 30]);
    add('Asistencia discipulados', [...(data.asistenciasHogar || [])].sort(byFecha).map((a) => {
      const nombres = String(a.presentes || '').split(',').filter(Boolean).map((id) => ph[id]?.nombre || '(eliminado)');
      return { Grupo: grupo[a.grupoId]?.nombre || '', Fecha: a.fecha, Actividad: a.actividad, Presentes: nombres.length, Nombres: nombres.join(', '), Notas: a.notas };
    }), [24, 11, 18, 10, 90, 30]);
  }

  // Listados de integrantes y actividades de los ministerios
  const integ = Object.fromEntries((data.integrantes || []).map((i) => [i.id, i]));
  if (data.integrantes?.length) add('Integrantes', data.integrantes.map((i) => ({ Ministerio: min[i.ministerioId] || '', Nombre: i.nombre, 'Miembro de la iglesia': i.esMiembro ? 'Sí' : 'No', 'Fecha de nacimiento': i.fechaNacimiento, Celular: i.celular, Correo: i.email, Activo: i.activo ? 'Sí' : 'No', Notas: i.notas })), [14, 30, 12, 16, 18, 28, 8, 30]);
  if (data.asistenciasMin?.length) add('Asistencia ministerios', [...data.asistenciasMin].sort(byFecha).map((a) => {
    const nombres = String(a.presentes || '').split(',').filter(Boolean).map((id) => integ[id]?.nombre || '(eliminado)');
    return { Ministerio: min[a.ministerioId] || '', Fecha: a.fecha, Actividad: a.actividad, Presentes: nombres.length, Nombres: nombres.join(', '), Notas: a.notas };
  }), [14, 11, 22, 10, 90, 30]);
  if (data.actividades?.length) {
    add('Actividades', data.actividades.map((a) => {
      // actividad de la tesorería general: sus cuotas y gastos están en el libro general
      const movs = (a.ministerioId ? data.movMinisterios : data.movGenerales || []).filter((x) => x.actividadId === a.id);
      const ing = movs.filter((x) => x.tipo === 'ingreso').reduce((s, x) => s + x.monto, 0);
      const gas = movs.filter((x) => x.tipo === 'gasto').reduce((s, x) => s + x.monto, 0);
      const ins = (data.inscripciones || []).filter((x) => x.actividadId === a.id);
      return { Ministerio: a.ministerioId ? min[a.ministerioId] || '' : 'Tesorería general', Actividad: a.nombre, Fecha: a.fecha, Cuota: a.cuota, Confirmados: ins.length, Pagaron: ins.filter((x) => x.movId).length, Entradas: ing, Salidas: gas, Resultado: ing - gas, Estado: a.estado };
    }), [14, 28, 11, 10, 12, 10, 12, 12, 12, 10]);
    add('Inscripciones', (data.inscripciones || []).map((x) => {
      const a = data.actividades.find((y) => y.id === x.actividadId);
      const nombreMb = (data.miembros || []).find((m) => m.id === x.miembroId)?.nombre;
      return { Actividad: a?.nombre || '', Inscrito: integ[x.integranteId]?.nombre || nombreMb || '', Pagó: x.movId ? 'Sí' : 'No', Monto: x.pagoMonto || '', 'Fecha de pago': x.fechaPago };
    }), [28, 30, 8, 12, 14]);
  }

  XLSX.writeFile(wb, `Administracion_ElRedentor_${data.hoy}.xlsx`);
}
