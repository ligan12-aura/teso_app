// Importador del "LIBRO ENTRADAS Y SALIDAS" (una hoja por mes).
// Lee el Excel en el navegador, clasifica cada línea, verifica los totales
// contra los del libro y envía los movimientos a la tesorería general.
import { icon, esc, money, cap, mesLargo, fecha, toast, confirmar } from '../ui.js';
import { call } from '../api.js';
import { leerPlanilla } from '../planilla.js';
import { cargarExcelJS } from '../planillaDescarga.js';

const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const pad = (n) => String(n).padStart(2, '0');
let estado = null; // { meses: [...], items: [...] }  (libro antiguo)
let estadoPlanilla = null; // planilla tipo leída

function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = XLSX_URL; s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error('No se pudo cargar el lector de Excel'));
    document.head.appendChild(s);
  });
}

// ---------------- Clasificación automática ----------------
const REGLAS_GASTO = [
  [/SUELDO/, 'Sueldo pastoral'],
  [/IMPOSICION/, 'Imposiciones y previsión'],
  [/ASIGNACION FAMILIAR/, 'Asignación familiar'],
  [/INDEMNIZACION/, 'Fondo de indemnización'],
  [/AGUINALDO|BONO/, 'Aguinaldos y bonos'],
  [/GUARDATEMPLO|GURDATEMPLO/, 'Guardatemplo'],
  [/\bLUZ\b|ELECTRIC/, 'Luz'],
  [/\bAGUA\b/, 'Agua'],
  [/\bGAS\b|CILINDRO/, 'Gas'],
  [/INTERNET|TELEFONO|CELULAR/, 'Internet y teléfono'],
  [/ASEO|DISPENSADOR|LIMPIEZA/, 'Aseo y limpieza'],
  [/SEGURO|PERMISO DE CIRCULACION|REVISION TECNICA/, 'Seguro y permisos vehículo'],
  [/COMBUSTIBLE|BENCINA|PETROLEO/, 'Combustible'],
  [/FURGON|VEHICULO|REPUESTO/, 'Mantención vehículo'],
  [/REUNION|DIRECTORIO|COCINA/, 'Reuniones y directorio'],
  [/UNIBA|U NIBA|UBACH|CONVENCION|URPAB/, 'Aportes a la denominación'],
  [/HOGAR BAUTISTA|FUNDACION|DIVINO REFUGIO/, 'Aportes a instituciones'],
  [/DAMNIFICADO|INCENDIO/, 'Ofrendas solidarias'],
  [/AYUDA SOCIAL|CANASTA/, 'Ayuda social'],
  [/DEFUNCION|FLORES|CORONA|FUNERAL/, 'Condolencias'],
  [/\bITEM\b/, 'Asignación ministerios'],
  [/ESCUELA DOMINICAL|LITERATURA/, 'Escuela dominical'],
  [/MISION/, 'Misiones'],
  [/ANIVERSARIO|LLAVERO|BAUTISMO|NUEVOS MIEMBROS|CELEBRACION|PASEO/, 'Eventos y celebraciones'],
  [/ARRIENDO/, 'Arriendo'],
  [/MANTENCION|REPARACION|ARREGLO/, 'Mantención templo'],
  [/BANCO|COMISION/, 'Gastos bancarios'],
  [/VARIOS/, 'Gastos varios']
];
const REGLAS_INGRESO = [
  [/DAMNIFICADO|INCENDIO|SOLIDARI/, 'Ofrendas solidarias'],
  [/MISION/, 'Ofrenda misionera'],
  [/REINTEGRO|DEVOLUCION/, 'Reintegros'],
  [/DONACION/, 'Donaciones'],
  [/CUOTA|PASEO|ALMUERZO|VENTA|ACTIVIDAD|BINGO/, 'Actividades']
];
const sinTildes = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const clasificar = (tipo, txt) => {
  const T = sinTildes(txt);
  for (const [re, cat] of tipo === 'gasto' ? REGLAS_GASTO : REGLAS_INGRESO) if (re.test(T)) return cat;
  return tipo === 'gasto' ? 'Otros gastos' : 'Otros ingresos';
};

// Texto en mayúsculas → "Oración con nombres propios"
const SIGLAS = ['UNIBA', 'UBACH', 'URPAB', 'SOAP'];
function bonito(t) {
  let s = String(t).replace(/\s+/g, ' ').replace(/[,.\s]+$/, '').trim().toLowerCase();
  s = s.charAt(0).toUpperCase() + s.slice(1);
  s = s.replace(/\b(hna\.|hno\.|hermana|hermano|sra\.|sr\.|fam\.|pastor)\s+(.+)$/i, (m, a, rest) => `${a} ${rest.replace(/\b([a-záéíóúñ])([a-záéíóúñ]{2,})/g, (w, f, r) => f.toUpperCase() + r)}`);
  s = s.replace(/\bu niba\b/gi, 'UNIBA').replace(/\bgurdatemplo\b/gi, 'guardatemplo');
  SIGLAS.forEach((g) => { s = s.replace(new RegExp(`\\b${g}\\b`, 'gi'), g); });
  Object.entries(PALABRAS).forEach(([a, b]) => { s = s.replace(new RegExp(`(^|[^a-záéíóúñ])${a}(?![a-záéíóúñ])`, 'gi'), (m, pre, off) => pre + (off === 0 && !pre ? b.charAt(0).toUpperCase() + b.slice(1) : b)); });
  return s.replace(/\bbol\.?\s*(?=\d)/i, 'boleta ').replace(/\bf\.patrias\b/i, 'Fiestas Patrias');
}
// Tildes y nombres propios frecuentes en el libro
const PALABRAS = {
  'hogar bautista': 'Hogar Bautista', 'divino refugio': 'Divino Refugio', 'union femenil': 'Unión Femenil', 'union de jovenes': 'Unión de Jóvenes',
  'programa cooperativo': 'Programa Cooperativo', 'escuela dominical': 'Escuela Dominical', 'fiestas patrias': 'Fiestas Patrias',
  fundacion: 'fundación', asignacion: 'asignación', recepcion: 'recepción', union: 'unión', jovenes: 'jóvenes', mantencion: 'mantención',
  furgon: 'furgón', reunion: 'reunión', cautin: 'Cautín', indemnizacion: 'indemnización', adoracion: 'adoración', telefono: 'teléfono',
  defuncion: 'defunción', convencion: 'convención', item: 'ítem', puren: 'Purén', pitraco: 'Pitraco', boyeco: 'Boyeco', rodriguez: 'Rodríguez',
  imposicion: 'imposición', celebracion: 'celebración', reparacion: 'reparación', vehiculo: 'vehículo', anexo: 'anexo', construccion: 'construcción'
};

// ---------------- Lectura del libro ----------------
function leerLibro(XLSX, wb, existentes) {
  const meses = [];
  const items = [];
  wb.SheetNames.forEach((name) => {
    const m = /^\s*([a-záéíóú]+)\s+(\d{4})\s*$/i.exec(name);
    if (!m) return;
    const mi = MESES.indexOf(m[1].toLowerCase());
    if (mi < 0) return;
    const y = +m[2], mes = `${y}-${pad(mi + 1)}`;
    const ultimo = new Date(y, mi + 1, 0).getDate();
    const ws = wb.Sheets[name];
    if (!ws['!ref']) return;
    const rango = XLSX.utils.decode_range(ws['!ref']);
    const val = (c, r) => { const cell = ws[XLSX.utils.encode_cell({ c, r })]; return cell ? cell.v : null; };
    const txt = (c, r) => { const v = val(c, r); return typeof v === 'string' ? v.trim() : ''; };
    const num = (c, r) => { const v = val(c, r); return typeof v === 'number' ? Math.round(v) : 0; };

    let header = -1, totalE = -1;
    for (let r = rango.s.r; r <= rango.e.r; r++) {
      const a = sinTildes(txt(0, r) + ' ' + txt(1, r));
      if (header < 0 && a.includes('ENTRADAS MES')) header = r;
      if (a.startsWith('TOTAL ENTRADAS')) { totalE = r; break; }
    }
    if (header < 0 || totalE < 0) return;
    const resumen = { mes, nombre: name, totalEntradas: num(5, totalE), totalSalidas: 0, saldoAnterior: null, saldoFinal: null, filas: [] };
    for (let r = totalE + 1; r <= Math.min(totalE + 6, rango.e.r); r++) {
      const a = sinTildes(txt(0, r));
      if (a.startsWith('TOTAL SALIDAS')) resumen.totalSalidas = num(5, r);
      else if (a.startsWith('SALDO EN CAJA')) resumen.saldoFinal = num(5, r);
      else if (a.startsWith('SALDO DE')) { resumen.saldoAnterior = num(5, r); resumen.etiquetaSaldo = txt(0, r); }
    }
    const fechaDe = (t) => {
      const ms = [...String(t).matchAll(/(\d{1,2})[.,/-](\d{1,2})[.,/-](\d{2,4})/g)];
      if (!ms.length) return null;
      const [, d, mo] = ms[ms.length - 1];
      if (+mo !== mi + 1) return `${mes}-${pad(ultimo)}`;
      return `${mes}-${pad(Math.min(+d, ultimo))}`;
    };
    const vistos = {};
    const agregar = (it, fila) => {
      const base = `libro:${mes}:${it.tipo}:${it.fecha}:${it.monto}:${sinTildes(it.descripcion).replace(/[^A-Z0-9]/g, '').slice(0, 40)}`;
      vistos[base] = (vistos[base] || 0) + 1;
      it.refId = vistos[base] > 1 ? `${base}#${vistos[base]}` : base;
      it.fila = fila;
      it.yaImportado = existentes.has(it.refId);
      it.medio = it.medio || (it.tipo === 'ingreso' ? 'Efectivo' : 'Transferencia');
      items.push(it); resumen.filas.push(it);
    };

    // Entradas (columnas A = detalle, E = monto)
    let seccion = '';
    for (let r = header + 1; r < totalE; r++) {
      const a = txt(0, r);
      const A = sinTildes(a);
      if (A.startsWith('DIEZMO')) { seccion = 'Diezmos'; continue; }
      if (A.startsWith('OFRENDA CULTO')) { seccion = 'Ofrendas'; continue; }
      const monto = num(4, r);
      if (!a || monto <= 0) continue;
      const f = fechaDe(a);
      if (seccion && f) {
        agregar({ tipo: 'ingreso', fecha: f, monto, categoria: seccion, descripcion: seccion === 'Diezmos' ? `Diezmos ${a.toLowerCase().replace(/,/g, '.')}` : `Ofrenda culto ${a.replace(/,/g, '.')}` }, r + 1);
      } else {
        seccion = '';
        agregar({ tipo: 'ingreso', fecha: f || `${mes}-${pad(ultimo)}`, monto, categoria: clasificar('ingreso', a), descripcion: bonito(a) }, r + 1);
      }
    }
    // Salidas (columnas H..M = detalle que empieza con el día, N = monto)
    for (let r = header + 1; r < totalE; r++) {
      let d = '';
      for (let c = 7; c <= 12 && !d; c++) { const t = txt(c, r); if (t && /[a-z]/i.test(t)) d = t; }
      const monto = num(13, r);
      if (!d || monto <= 0 || sinTildes(d).startsWith('TOTAL')) continue;
      const dm = /^(\d{1,2})\s+(.*)$/.exec(d);
      const dia = dm ? Math.min(Math.max(+dm[1], 1), ultimo) : ultimo;
      const texto = dm ? dm[2] : d;
      agregar({ tipo: 'gasto', fecha: `${mes}-${pad(dia)}`, monto, categoria: clasificar('gasto', texto), descripcion: bonito(texto) }, r + 1);
    }
    if (!resumen.filas.length) return;
    const sum = (t) => resumen.filas.filter((x) => x.tipo === t).reduce((s, x) => s + x.monto, 0);
    resumen.entradas = sum('ingreso');
    resumen.salidas = sum('gasto');
    resumen.okE = resumen.entradas === resumen.totalEntradas;
    resumen.okS = resumen.salidas === resumen.totalSalidas;
    resumen.okSaldo = resumen.saldoAnterior === null || resumen.saldoFinal === null || resumen.saldoAnterior + resumen.entradas - resumen.salidas === resumen.saldoFinal;
    meses.push(resumen);
  });
  meses.sort((a, b) => a.mes.localeCompare(b.mes));
  return { meses, items };
}

// ---------------- Pantalla ----------------
export function renderImportar(body, ctx) {
  const { data } = ctx;
  body.innerHTML = `
  <article class="card">
    <header class="card-head"><div><h3>Importar historial</h3><p class="muted">Carga movimientos anteriores desde una <b>planilla tipo</b> (tesorería general o un ministerio) o desde el libro antiguo “Entradas y salidas” de la tesorería general.</p></div></header>
    <ol class="hp-steps">
      <li><span class="hp-n">1</span><div>Elige el archivo Excel. Se lee en tu navegador; el archivo no se sube a ninguna parte.</div></li>
      <li><span class="hp-n">2</span><div>La app reconoce el formato y muestra un resumen por mes. En una planilla de ministerio, elige a qué ministerio corresponde.</div></li>
      <li><span class="hp-n">3</span><div>Revisa las categorías y presiona <b>Importar</b>.</div></li>
    </ol>
    <label class="upload" style="margin-top:14px">
      <input type="file" accept=".xlsx,.xls" data-xls>
      <div class="upload-ui"><div class="upload-cta">${icon('sheet', 22)}<span><strong>Elegir archivo Excel</strong><small>Planilla tipo descargada de la página, o libro con hojas “Enero 2026”, “Febrero 2026”…</small></span></div></div>
    </label>
    ${tipNoDuplica()}
  </article>
  <div data-preview></div>`;
  const prev = body.querySelector('[data-preview]');
  body.querySelector('[data-xls]').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    prev.innerHTML = '<div class="card"><div class="spinner"></div></div>';
    try {
      const buf = await f.arrayBuffer();
      let plan = null;
      try {
        const ExcelJS = await cargarExcelJS();
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf.slice(0));
        plan = leerPlanilla(wb);
      } catch { plan = null; }
      if (plan) { estado = null; estadoPlanilla = plan; pintarPlanilla(prev, ctx); return; }
      estadoPlanilla = null;
      estado = await analizar(buf, data);
      pintar(prev, ctx);
    } catch (er) {
      prev.innerHTML = `<div class="note warn">${icon('alert', 16)} ${esc(er.message)}</div>`;
    }
  });
  if (estadoPlanilla) pintarPlanilla(prev, ctx);
  else if (estado) pintar(prev, ctx);
}

const tipNoDuplica = () => `<div class="note" style="margin-top:14px">${icon('sparkle', 16)}<span>Puedes volver a importar el mismo libro cuando agregues meses nuevos: las líneas que ya se importaron se reconocen y <b>no se duplican</b>.</span></div>`;

export async function analizar(fileOrBuffer, data) {
  const XLSX = await loadXLSX();
  const buf = fileOrBuffer instanceof ArrayBuffer ? fileOrBuffer : await fileOrBuffer.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const existentes = new Set(data.movGenerales.map((m) => m.refId).filter(Boolean));
  const r = leerLibro(XLSX, wb, existentes);
  if (!r.meses.length) throw new Error('No encontré hojas con movimientos (nombres como “Enero 2026” y una fila “TOTAL ENTRADAS”).');
  return r;
}

function opcionesCategoria(data, tipo, sel) {
  const grupos = data.grupos[tipo];
  // Una categoría personalizada (creada con "Otra…") se muestra tal cual, para que lo visto sea lo que se importa
  const conocida = !sel || grupos.some(([, cs]) => cs.includes(sel));
  const otras = conocida ? '' : `<optgroup label="Otras"><option selected>${esc(sel)}</option></optgroup>`;
  return otras + grupos.map(([g, cs]) => `<optgroup label="${esc(g)}">${cs.map((c) => `<option ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('')}</optgroup>`).join('');
}

function pintar(prev, ctx) {
  const { data } = ctx;
  const { meses, items } = estado;
  const nuevos = items.filter((i) => !i.yaImportado);
  const primero = meses[0];
  const ok = (b) => b ? `<span class="ok-mark">${icon('checkCircle', 15)}</span>` : `<span class="bad-mark">${icon('alert', 15)}</span>`;
  const sugerirSaldo = primero.saldoAnterior !== null && !items.some((i) => i.yaImportado);
  const cfg = data.config || {};
  const saldoActual = Number(cfg.saldoInicial) || 0;
  const saldoDistinto = sugerirSaldo && (saldoActual !== primero.saldoAnterior || (cfg.fechaSaldoInicial || '') !== `${primero.mes}-01`);
  // Solo se marca sola si aún no hay saldo inicial configurado
  const marcarSaldo = saldoDistinto && !saldoActual;
  // Movimientos que ya existen en esos meses y no vienen del libro (posibles duplicados)
  const mesesLibro = new Set(meses.map((m) => m.mes));
  const enMeses = data.movGenerales.filter((m) => mesesLibro.has(m.mes) && m.origen !== 'importado' && m.origen !== 'transferencia');
  const mesesConDatos = [...new Set(enMeses.map((m) => mesLargo(m.mes)))].join(', ');
  prev.innerHTML = `
  <article class="card">
    <header class="card-head wrap"><div><h3>Resumen del libro</h3><p class="muted">${items.length} líneas en ${meses.length} mes${meses.length > 1 ? 'es' : ''} · ${nuevos.length} por importar</p></div></header>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Mes</th><th class="num">Entradas</th><th class="num">Salidas</th><th class="num">Saldo final</th><th class="num">Líneas</th></tr></thead>
      <tbody>${meses.map((m) => `
        <tr><td><b>${cap(mesLargo(m.mes))}</b></td>
          <td class="num">${money(m.entradas)} ${ok(m.okE)}${m.okE ? '' : `<br><small class="muted">libro: ${money(m.totalEntradas)}</small>`}</td>
          <td class="num">${money(m.salidas)} ${ok(m.okS)}${m.okS ? '' : `<br><small class="muted">libro: ${money(m.totalSalidas)}</small>`}</td>
          <td class="num">${m.saldoFinal !== null ? `${money(m.saldoFinal)} ${ok(m.okSaldo)}` : '—'}</td>
          <td class="num">${m.filas.length}${m.filas.some((f) => f.yaImportado) ? `<br><small class="muted">${m.filas.filter((f) => f.yaImportado).length} ya importadas</small>` : ''}</td></tr>`).join('')}
      </tbody></table></div>
    ${enMeses.length ? `<div class="note warn" style="margin-top:14px">${icon('alert', 16)}<span>Ya hay <b>${enMeses.length} movimiento${enMeses.length > 1 ? 's' : ''}</b> en la app en ${esc(mesesConDatos)} que no vienen de este libro. Revisa que no sean los mismos antes de importar, para no duplicarlos.</span></div>` : ''}
    ${saldoDistinto ? `<label class="check saldo-check"><input type="checkbox" data-saldo ${marcarSaldo ? 'checked' : ''}> <span>Usar <b>${money(primero.saldoAnterior)}</b> (${esc(primero.etiquetaSaldo || 'saldo anterior')}) como saldo inicial de caja al ${fecha(primero.mes + '-01')}${saldoActual ? `<br><small class="muted">Hoy está configurado ${money(saldoActual)}${cfg.fechaSaldoInicial ? ` desde el ${fecha(cfg.fechaSaldoInicial)}` : ''}. Al marcarlo se reemplaza.</small>` : ''}</span></label>` : ''}
  </article>
  ${meses.map((m) => `
  <details class="card imp-mes">
    <summary><b>${cap(mesLargo(m.mes))}</b> <span class="muted">${m.filas.length} líneas</span>${icon('chevR', 16)}</summary>
    <div class="table-wrap"><table class="table imp-table">
      <thead><tr><th>Fecha</th><th>Detalle</th><th class="num">Monto</th><th>Categoría</th></tr></thead>
      <tbody>${m.filas.map((f) => `
        <tr class="${f.yaImportado ? 'inactive' : ''}">
          <td class="nowrap">${fecha(f.fecha)}</td>
          <td class="desc">${esc(f.descripcion)}${f.yaImportado ? ' <span class="tag">ya importado</span>' : ''}</td>
          <td class="num strong ${f.tipo}">${f.tipo === 'ingreso' ? '+' : '−'}${money(f.monto)}</td>
          <td><select class="cat-sel" data-ref="${esc(f.refId)}" ${f.yaImportado ? 'disabled' : ''}>${opcionesCategoria(data, f.tipo, f.categoria)}</select></td>
        </tr>`).join('')}</tbody>
    </table></div>
  </details>`).join('')}
  <div class="imp-actions">
    <button class="btn btn-ghost" data-cancel>Cancelar</button>
    <button class="btn btn-primary" data-importar ${nuevos.length ? '' : 'disabled'}>${icon('download', 16)} Importar ${nuevos.length} movimiento${nuevos.length === 1 ? '' : 's'}</button>
  </div>`;

  prev.querySelectorAll('.cat-sel').forEach((s) => s.addEventListener('change', () => {
    const it = items.find((i) => i.refId === s.dataset.ref);
    if (it) it.categoria = s.value;
  }));
  prev.querySelector('[data-cancel]').addEventListener('click', () => { estado = null; prev.innerHTML = ''; });
  prev.querySelector('[data-importar]').addEventListener('click', async (e) => {
    const btn = e.currentTarget; // se lee antes de cualquier await (después queda en null)
    const malos = meses.filter((m) => !m.okE || !m.okS);
    if (malos.length && !(await confirmar(`Los totales de ${malos.map((m) => mesLargo(m.mes)).join(', ')} no cuadran con el libro. ¿Importar de todas formas?`, { boton: 'Importar igual' }))) return;
    if (enMeses.length && !(await confirmar(`Ya hay <b>${enMeses.length} movimiento${enMeses.length > 1 ? 's' : ''}</b> registrado${enMeses.length > 1 ? 's' : ''} en la app en ${mesesConDatos} que no vienen de este libro. Si son los mismos del Excel, quedarán duplicados.<br><br>¿Importar de todas formas?`, { titulo: 'Posibles duplicados', boton: 'Importar igual' }))) return;
    btn.disabled = true; btn.classList.add('loading');
    const usarSaldo = prev.querySelector('[data-saldo]')?.checked;
    const payloadItems = nuevos.map(({ fecha: f, tipo, monto, categoria, descripcion, medio, refId }) => ({ fecha: f, tipo, monto, categoria, descripcion, medio, refId }));
    let importados = 0, omitidos = 0;
    try {
      for (let i = 0; i < payloadItems.length; i += 300) {
        const extra = i === 0 && usarSaldo ? { saldoInicial: primero.saldoAnterior, fechaSaldoInicial: `${primero.mes}-01` } : {};
        const r = await call('importarMovimientos', { items: payloadItems.slice(i, i + 300), ...extra });
        importados += r.importados; omitidos += r.omitidos;
      }
      estado = null;
      toast(`${importados} movimientos importados${omitidos ? ` (${omitidos} ya existían)` : ''}`);
      await ctx.refresh();
      ctx.setMesSilent(primero.mes);
      ctx.go('general');
    } catch (er) {
      toast(er.message, 'err');
      btn.disabled = false; btn.classList.remove('loading');
    }
  });
}


// =====================================================================
// Planilla tipo (tesorería general o ministerio)
// =====================================================================
const hash = (t) => { let h = 2166136261; for (const c of String(t)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const normal = (t) => sinTildes(String(t || '')).replace(/[^A-Z0-9 ]/g, '').trim();

function pintarPlanilla(prev, ctx) {
  const { data } = ctx;
  const p = estadoPlanilla;
  const general = p.ambito === 'general';
  const minis = data.ministerios;
  if (!general && !minis.length) {
    prev.innerHTML = `<div class="note warn">${icon('alert', 16)}<span>Esta es una planilla de ministerio. Primero crea el ministerio en <b>Configuración → Ministerios</b> y vuelve a elegir el archivo.</span></div>`;
    return;
  }
  // ministerio de destino: por id guardado en la planilla o por nombre parecido
  let destino = '';
  if (!general) {
    const porId = minis.find((m) => m.id === p.ministerioId);
    const t = normal(p.titulo);
    const porNombre = minis.find((m) => { const n = normal(m.nombre); return t && n && (n.includes(t) || t.includes(n)); });
    destino = (prev._destino && minis.some((m) => m.id === prev._destino) ? prev._destino : null) || porId?.id || porNombre?.id || minis[0].id;
  }
  const m = general ? null : minis.find((x) => x.id === destino);
  const existentes = new Set();
  (general ? data.movGenerales : data.movMinisterios.filter((x) => x.ministerioId === destino)).forEach((x) => { existentes.add(x.id); if (x.refId) existentes.add(x.refId); });
  const filas = p.movimientos.map((x) => {
    const refId = x.id ? `planilla:${x.id}` : `planilla:${p.anio}:${hash([x.fecha, x.tipo, x.monto, x.descripcion, x.fila].join('|'))}`;
    const error = x.error || (!x.fecha ? 'sin fecha' : !x.categoria ? 'sin categoría' : '');
    return { ...x, refId, idOriginal: x.id, error, yaImportado: existentes.has(refId) || (x.id && existentes.has(x.id)) };
  });
  const validas = filas.filter((f) => !f.error);
  const nuevas = validas.filter((f) => !f.yaImportado);
  const malas = filas.filter((f) => f.error);
  const meses = [...new Set(validas.map((f) => f.fecha.slice(0, 7)))].sort();
  let saldo = p.saldoInicial;
  const resumen = meses.map((mm) => {
    const fs = validas.filter((f) => f.fecha.startsWith(mm));
    const ent = fs.filter((f) => f.tipo === 'ingreso').reduce((a, f) => a + f.monto, 0);
    const sal = fs.filter((f) => f.tipo === 'gasto').reduce((a, f) => a + f.monto, 0);
    saldo += ent - sal;
    return { mes: mm, filas: fs, ent, sal, saldo };
  });
  // opciones
  const tieneAntes = general ? false : data.movMinisterios.some((x) => x.ministerioId === destino && x.mes < `${p.anio}-01`);
  const cfg = data.config;
  const saldoGeneralConfigurado = (Number(cfg.saldoInicial) || 0) > 0;
  const opcSaldo = p.saldoInicial > 0 && (general ? true : !tieneAntes);
  const marcarSaldo = general ? !saldoGeneralConfigurado : true;
  const opcItem = !general && p.item > 0 && p.item !== m.itemMensual;
  const opcPres = !general && p.presupuesto > 0 && p.presupuesto !== (m.presupuestoMensual || 0);
  const catsDe = (tipo, sel) => {
    if (general) return opcionesCategoria(data, tipo, sel);
    const lista = data.categorias.ministerio[tipo];
    return [...lista, ...(lista.includes(sel) ? [] : [sel])].map((c) => `<option ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('');
  };

  prev.innerHTML = `
  <article class="card">
    <header class="card-head wrap"><div><h3>Planilla de ${general ? 'la tesorería general' : `ministerio · ${esc(p.titulo)}`} ${p.anio}</h3><p class="muted">${filas.length} movimientos · ${nuevas.length} por importar${filas.length - malas.length - nuevas.length ? ` · ${filas.length - malas.length - nuevas.length} ya existen` : ''}</p></div></header>
    ${general ? '' : `<label class="field" style="max-width:360px"><span>Importar en el ministerio</span><select data-destino>${minis.map((x) => `<option value="${x.id}" ${x.id === destino ? 'selected' : ''}>${esc(x.icono)} ${esc(x.nombre)}</option>`).join('')}</select></label>`}
    <div class="table-wrap" style="margin-top:12px"><table class="table">
      <thead><tr><th>Mes</th><th class="num">Ingresos</th><th class="num">Egresos</th><th class="num">Saldo final</th><th class="num">Líneas</th></tr></thead>
      <tbody>
        <tr><td class="muted">Saldo al 1 de enero</td><td></td><td></td><td class="num strong">${money(p.saldoInicial)}</td><td></td></tr>
        ${resumen.map((r) => `<tr><td><b>${cap(mesLargo(r.mes))}</b></td><td class="num ingreso">${money(r.ent)}</td><td class="num gasto">${money(r.sal)}</td><td class="num strong">${money(r.saldo)}</td><td class="num">${r.filas.length}${r.filas.some((f) => f.yaImportado) ? `<br><small class="muted">${r.filas.filter((f) => f.yaImportado).length} ya existen</small>` : ''}</td></tr>`).join('')}
      </tbody></table></div>
    ${malas.length ? `<div class="note warn" style="margin-top:12px">${icon('alert', 16)}<span>${malas.length} fila${malas.length > 1 ? 's' : ''} no se importará${malas.length > 1 ? 'n' : ''} por tener datos incompletos o inválidos: ${malas.slice(0, 5).map((f) => `fila ${f.fila} (${f.error})`).join(', ')}${malas.length > 5 ? '…' : ''}.</span></div>` : ''}
    <div class="imp-opciones">
      ${opcSaldo ? `<label class="check saldo-check"><input type="checkbox" data-opc-saldo ${marcarSaldo ? 'checked' : ''}> <span>Registrar el saldo al 1 de enero de <b>${money(p.saldoInicial)}</b>${general ? `<br><small class="muted">${saldoGeneralConfigurado ? `Hoy el saldo inicial de caja es ${money(cfg.saldoInicial)}${cfg.fechaSaldoInicial ? ` desde el ${fecha(cfg.fechaSaldoInicial)}` : ''}. Al marcarlo se reemplaza.` : 'Se usará como saldo inicial de caja.'}</small>` : ''}</span></label>` : ''}
      ${!general && p.saldoInicial > 0 && tieneAntes ? `<div class="note" style="margin-top:10px">${icon('sparkle', 16)}<span>El ministerio ya tiene movimientos anteriores a ${p.anio}, así que su saldo de arrastre ya existe y no se vuelve a registrar.</span></div>` : ''}
      ${opcItem ? `<label class="check saldo-check"><input type="checkbox" data-opc-item ${!m.itemMensual ? 'checked' : ''}> <span>Usar el ítem mensual de la planilla: <b>${money(p.item)}</b> <small class="muted">(hoy ${money(m.itemMensual)})</small></span></label>` : ''}
      ${opcPres ? `<label class="check saldo-check"><input type="checkbox" data-opc-pres ${!m.presupuestoMensual ? 'checked' : ''}> <span>Usar el presupuesto mensual de la planilla: <b>${money(p.presupuesto)}</b></span></label>` : ''}
    </div>
    ${!general ? `<p class="muted small" style="margin-top:12px">Los ítems mensuales importados quedan registrados como ya transferidos, y los meses anteriores al actual quedan con la rendición aprobada.</p>` : ''}
  </article>
  ${resumen.map((r) => `
  <details class="card imp-mes">
    <summary><b>${cap(mesLargo(r.mes))}</b> <span class="muted">${r.filas.length} líneas</span>${icon('chevR', 16)}</summary>
    <div class="table-wrap"><table class="table imp-table">
      <thead><tr><th>Fecha</th><th>Descripción</th><th class="num">Monto</th><th>Categoría</th></tr></thead>
      <tbody>${r.filas.map((f) => `
        <tr class="${f.yaImportado ? 'inactive' : ''}">
          <td class="nowrap">${fecha(f.fecha)}</td>
          <td class="desc">${esc(f.descripcion)}${f.yaImportado ? ' <span class="tag">ya existe</span>' : ''}${f.observacion ? `<br><small class="muted">${esc(f.observacion)}</small>` : ''}</td>
          <td class="num strong ${f.tipo}">${f.tipo === 'ingreso' ? '+' : '−'}${money(f.monto)}</td>
          <td><select class="cat-sel" data-ref="${esc(f.refId)}" ${f.yaImportado ? 'disabled' : ''}>${catsDe(f.tipo, f.categoria)}</select></td>
        </tr>`).join('')}</tbody>
    </table></div>
  </details>`).join('')}
  <div class="imp-actions">
    <button class="btn btn-ghost" data-cancel>Cancelar</button>
    <button class="btn btn-primary" data-importar-planilla ${nuevas.length || opcSaldo ? '' : 'disabled'}>${icon('download', 16)} Importar ${nuevas.length} movimiento${nuevas.length === 1 ? '' : 's'}</button>
  </div>`;

  prev.querySelector('[data-destino]')?.addEventListener('change', (e) => { prev._destino = e.target.value; pintarPlanilla(prev, ctx); });
  prev.querySelectorAll('.cat-sel').forEach((sel) => sel.addEventListener('change', () => {
    p.movimientos.forEach((x) => { if ((x.id ? `planilla:${x.id}` : null) === sel.dataset.ref) x.categoria = sel.value; });
    const f = filas.find((x) => x.refId === sel.dataset.ref); if (f) { f.categoria = sel.value; const orig = p.movimientos.find((x) => x.fila === f.fila); if (orig) orig.categoria = sel.value; }
  }));
  prev.querySelector('[data-cancel]').addEventListener('click', () => { estadoPlanilla = null; prev._destino = null; prev.innerHTML = ''; });
  prev.querySelector('[data-importar-planilla]').addEventListener('click', async (e) => {
    const btn = e.currentTarget; // antes de cualquier await
    const usarSaldo = !!prev.querySelector('[data-opc-saldo]')?.checked;
    const usarItem = !!prev.querySelector('[data-opc-item]')?.checked;
    const usarPres = !!prev.querySelector('[data-opc-pres]')?.checked;
    if (general && usarSaldo && saldoGeneralConfigurado && !(await confirmar(`Se reemplazará el saldo inicial de caja por ${money(p.saldoInicial)} al 1 de enero de ${p.anio}. ¿Continuar?`, { boton: 'Reemplazar' }))) return;
    btn.disabled = true; btn.classList.add('loading');
    const items = nuevas.map((f) => ({ refId: f.refId, idOriginal: f.idOriginal, fecha: f.fecha, tipo: f.tipo, monto: f.monto, categoria: f.categoria, descripcion: f.descripcion, medio: f.medio }));
    let importados = 0, omitidos = 0;
    try {
      if (!items.length && usarSaldo) items.length = 0;
      const lotes = items.length ? Math.ceil(items.length / 300) : 1;
      for (let i = 0; i < lotes; i++) {
        const lote = items.slice(i * 300, i * 300 + 300);
        let r;
        if (general) {
          const extra = i === 0 && usarSaldo ? { saldoInicial: p.saldoInicial, fechaSaldoInicial: `${p.anio}-01-01` } : {};
          r = lote.length ? await call('importarMovimientos', { items: lote, ...extra }) : (await call('saveConfig', { saldoInicial: p.saldoInicial, fechaSaldoInicial: `${p.anio}-01-01` }), { importados: 0, omitidos: 0 });
        } else {
          r = await call('importarMovimientosMinisterio', {
            ministerioId: destino, anio: p.anio, items: lote,
            ...(i === 0 && usarSaldo ? { saldoInicial: p.saldoInicial } : {}),
            ...(i === 0 && usarItem ? { itemMensual: p.item } : {}),
            ...(i === 0 && usarPres ? { presupuestoMensual: p.presupuesto } : {})
          });
        }
        importados += r.importados; omitidos += r.omitidos;
      }
      estadoPlanilla = null; prev._destino = null;
      toast(`${importados} movimientos importados${omitidos ? ` (${omitidos} ya existían)` : ''}`);
      await ctx.refresh();
      if (general) { ctx.setMesSilent(meses[meses.length - 1] || ctx.mes); ctx.go('general'); }
      else { ctx.setMesSilent(meses[meses.length - 1] || ctx.mes); ctx.go(`ministerio/${destino}`); }
    } catch (er) {
      toast(er.message, 'err');
      btn.disabled = false; btn.classList.remove('loading');
    }
  });
}
