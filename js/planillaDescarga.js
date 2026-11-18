// Descarga de la planilla tipo (Excel profesional) con los datos actuales de la página.
import { toast, modal } from './ui.js';
import { saldoGeneralHasta } from './calc.js';
import { construirPlanilla } from './planilla.js';

const EXCELJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
const pad = (n) => String(n).padStart(2, '0');

export function cargarExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = EXCELJS_URL;
    s.onload = () => res(window.ExcelJS);
    s.onerror = () => rej(new Error('No se pudo cargar el generador de planillas. Revisa tu conexión.'));
    document.head.appendChild(s);
  });
}

function generadoAhora() {
  const d = new Date();
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Pregunta el año (solo si hay más de uno con datos)
function elegirAnio(data, movs) {
  const actual = Number(data.hoy.slice(0, 4));
  const anios = [...new Set([actual, ...movs.map((m) => Number(m.fecha.slice(0, 4)))])].filter((y) => y > 2000).sort((a, b) => b - a);
  if (anios.length === 1) return Promise.resolve(anios[0]);
  return modal({
    title: 'Descargar planilla',
    body: `<label class="field"><span>Año</span><select name="anio">${anios.map((y) => `<option ${y === actual ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
      <p class="muted small">La planilla incluye todos los movimientos de ese año, el resumen mensual y el flujo de caja.</p>`,
    submitLabel: 'Descargar',
    onSubmit: (f) => Number(f.anio.value)
  });
}

async function guardar(wb, nombre) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function descargarPlanillaGeneral(data) {
  const anio = await elegirAnio(data, data.movGenerales);
  if (!anio) return;
  toast('Generando planilla…');
  const ExcelJS = await cargarExcelJS();
  const desde = data.config.fechaSaldoInicial || '';
  const movs = data.movGenerales
    .filter((m) => m.fecha.startsWith(String(anio)) && (!desde || m.fecha >= desde))
    .map((m) => ({
      id: m.id, fecha: m.fecha, tipo: m.tipo, categoria: m.categoria, descripcion: m.descripcion, monto: m.monto, medio: m.medio,
      boleta: !!m.archivoId, observacion: m.origen === 'transferencia' ? 'Transferencia de ítem' : m.origen === 'importado' ? 'Importado del historial' : ''
    }));
  const wb = construirPlanilla(ExcelJS, {
    ambito: 'general', titulo: 'Tesorería general', iglesia: data.config.nombreIglesia, anio, generado: generadoAhora(),
    saldoInicial: saldoGeneralHasta(data, `${anio - 1}-12`), presupuestoMensual: data.config.presupuestoGeneral || 0,
    grupos: data.grupos, movimientos: movs
  });
  await guardar(wb, `Planilla Tesorería general ${anio}.xlsx`);
}

export async function descargarPlanillaMinisterio(data, mid) {
  const m = data.ministerios.find((x) => x.id === mid);
  if (!m) throw new Error('Ministerio no encontrado');
  const propios = data.movMinisterios.filter((x) => x.ministerioId === mid);
  const anio = await elegirAnio(data, propios);
  if (!anio) return;
  toast('Generando planilla…');
  const ExcelJS = await cargarExcelJS();
  const saldoInicial = propios.filter((x) => x.mes < `${anio}-01`).reduce((a, x) => a + (x.tipo === 'ingreso' ? x.monto : -x.monto), 0);
  const movs = propios.filter((x) => x.fecha.startsWith(String(anio))).map((x) => ({
    id: x.id, fecha: x.fecha, tipo: x.tipo, categoria: x.categoria, descripcion: x.descripcion, monto: x.monto,
    boleta: !!x.archivoId, observacion: x.origen === 'transferencia' ? 'Transferido por tesorería' : x.origen === 'importado' ? 'Importado del historial' : ''
  }));
  const rendiciones = Object.fromEntries(data.rendiciones.filter((r) => r.ministerioId === mid).map((r) => [r.mes, r.estado]));
  const wb = construirPlanilla(ExcelJS, {
    ambito: 'ministerio', titulo: m.nombre, ministerioId: m.id, iglesia: data.config.nombreIglesia, anio, generado: generadoAhora(),
    saldoInicial, presupuestoMensual: m.presupuestoMensual || 0, itemMensual: m.itemMensual || 0, color: m.color,
    categorias: data.categorias.ministerio, movimientos: movs, rendiciones
  });
  await guardar(wb, `Planilla ${m.nombre} ${anio}.xlsx`.replace(/[\\/:*?"<>|]/g, ''));
}

