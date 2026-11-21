// Importar historial de diezmos desde Excel (por ejemplo, el cuaderno de la tesorera anterior).
// Columnas reconocidas (fila de encabezados): Fecha · Monto · Hermano · Cónyuge · Nombre en el cuaderno · Medio · Observación
// No suma a la caja: esos meses ya están en la tesorería general.
import { icon, esc, money, modal, toast, fecha } from '../ui.js';
import { call } from '../api.js';
import { cargarExcelJS } from '../planillaDescarga.js';

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
// Clave de familia según cómo aparece en el cuaderno: "Fam. Aravena-Vega", "Aravena-Vega (efectivo)" → ARAVENAVEGA
export const familia = (t) => norm(String(t || '').replace(/\(.*?\)/g, ' ')).replace(/^(FAM|FAMILIA|HNA|HNO|HNAS|HNOS|HERMANA|HERMANO|MATRIMONIO)\s+/, '').replace(/[^A-Z]/g, '');
const hash = (t) => { let h = 2166136261; for (const c of String(t)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

// Busca un miembro por nombre: exacto, o todas las palabras contenidas (único)
export function buscarMiembro(miembros, nombre) {
  const n = norm(nombre);
  if (!n) return { id: '', ambiguo: false };
  const exactos = miembros.filter((m) => norm(m.nombre) === n);
  if (exactos.length === 1) return { id: exactos[0].id, ambiguo: false };
  if (exactos.length > 1) return { id: '', ambiguo: true };
  const pal = n.split(' ');
  const parciales = miembros.filter((m) => { const t = norm(m.nombre).split(' '); return pal.every((p) => t.includes(p)); });
  if (parciales.length === 1) return { id: parciales[0].id, ambiguo: false };
  return { id: '', ambiguo: parciales.length > 1 };
}

async function leer(file) {
  const ExcelJS = await cargarExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const txt = (v) => (v == null ? '' : v instanceof Date ? v : typeof v === 'object' ? (v.richText ? v.richText.map((t) => t.text).join('') : v.text ?? v.result ?? '') : v);
  const aFecha = (v) => {
    if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
    // número de serie de Excel (fecha guardada como número)
    if (typeof v === 'number' && v > 20000 && v < 80000) return aFecha(new Date(Math.round((v - 25569) * 86400000)));
    const s = String(v || '').trim(); let r;
    if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return `${r[1]}-${r[2].padStart(2, '0')}-${r[3].padStart(2, '0')}`;
    // dd-mm-aaaa o dd/mm/aa (año de 2 dígitos = 20aa)
    if ((r = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/.exec(s))) return `${r[3].length === 2 ? '20' + r[3] : r[3]}-${r[2].padStart(2, '0')}-${r[1].padStart(2, '0')}`;
    return '';
  };
  // Fecha que existe de verdad (rechaza 30-02, 31-04, mes 13…)
  const fechaReal = (f) => { if (!f) return false; const [y, m, d] = f.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d; };
  // Montos: número de Excel tal cual; texto al estilo es-CL ("15.000", "$ 1.500.000", "1500,5" → 1500)
  const aMonto = (v) => {
    if (v == null || v === '') return { n: 0, err: '' };
    if (typeof v === 'number') return v < 0 ? { n: 0, err: 'monto negativo' } : { n: Math.round(v), err: '' };
    const s = String(v).trim();
    if (!s) return { n: 0, err: '' };
    if (!/^-?\s*\$?\s*[\d.\s]+(,\d*)?$/.test(s)) return { n: 0, err: `monto no válido “${s.slice(0, 20)}”` };
    if (s.includes('-')) return { n: 0, err: 'monto negativo' };
    return { n: Number(s.split(',')[0].replace(/\D/g, '')) || 0, err: '' };
  };
  const filas = [];
  wb.worksheets.forEach((ws) => {
    if (ws.state && ws.state !== 'visible') return;
    let cols = null;
    ws.eachRow((row, i) => {
      const vals = [];
      row.eachCell({ includeEmpty: true }, (c, j) => { vals[j] = txt(c.value); });
      if (!cols) {
        const h = vals.map((v) => norm(v));
        if (h.includes('FECHA') && h.includes('MONTO')) {
          cols = {};
          h.forEach((t, j) => {
            if (t === 'FECHA') cols.fecha = j;
            else if (t === 'MONTO') cols.monto = j;
            else if (t.startsWith('HERMANO')) cols.hermano = j;
            else if (t.startsWith('CONYUGE')) cols.conyuge = j;
            else if (t.includes('CUADERNO') || t === 'NOMBRE') cols.cuaderno = j;
            else if (t === 'MEDIO') cols.medio = j;
            else if (t.startsWith('OBSERVACION')) cols.obs = j;
          });
        }
        return;
      }
      const crudoMonto = vals[cols.monto], crudoFecha = vals[cols.fecha];
      const vacio = (v) => v == null || (!(v instanceof Date) && String(v).trim() === '');
      if (vacio(crudoMonto) && vacio(crudoFecha)) return; // fila en blanco
      // fila de total al pie (sin fecha y con "Total…" escrito): no es un diezmo
      if (vacio(crudoFecha) && vals.some((v) => typeof v === 'string' && /^\s*total\b/i.test(v))) return;
      const pm = aMonto(crudoMonto);
      const f = aFecha(crudoFecha);
      // Las filas con problemas no se descartan en silencio: se muestran y no se importan
      const error = pm.err || (!pm.n ? 'sin monto' : '') || (!fechaReal(f) ? 'fecha no válida' : '');
      filas.push({
        hoja: ws.name, fila: i, fecha: fechaReal(f) ? f : '', monto: pm.n, error,
        hermano: String(vals[cols.hermano] ?? '').trim(), conyuge: String(vals[cols.conyuge] ?? '').trim(),
        cuaderno: String(vals[cols.cuaderno] ?? '').trim(), medio: String(vals[cols.medio] ?? '').trim(), obs: String(vals[cols.obs] ?? '').trim()
      });
    });
  });
  return filas;
}

// Completa una fila con la familia conocida: si no tiene hermano, o si su hermano es parte
// de esa pareja pero le falta el cónyuge
function aplicarFamilia(x, fam) {
  if (!fam || x.existe) return;
  const parte = x.miembroId && (x.miembroId === fam.miembroId || x.miembroId === fam.conyugeId);
  if (!x.miembroId || (parte && !x.conyugeId && fam.conyugeId)) {
    const cambia = x.miembroId !== fam.miembroId || x.conyugeId !== fam.conyugeId;
    x.miembroId = fam.miembroId;
    x.conyugeId = fam.conyugeId;
    x.ambiguo = false;
    if (cambia) x.porFamilia = true;
  }
}

export function importarHistorialDiezmos(ctx) {
  const data = ctx.data;
  const miembros = [...data.miembros].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const existentes = new Set(data.diezmos.map((d) => d.refId).filter(Boolean));
  let filas = [];
  const opciones = (sel) => `<option value="">— Sin asignar —</option>${miembros.map((m) => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.nombre)}${m.estado !== 'activo' ? ` (${m.estado})` : ''}</option>`).join('')}`;
  return modal({
    title: 'Importar historial de diezmos',
    wide: true,
    body: `<p class="muted">Carga un Excel con una fila por diezmo y las columnas <b>Fecha</b>, <b>Monto</b>, <b>Hermano</b> y, si es de un matrimonio, <b>Cónyuge</b>. Revisa abajo a quién corresponde cada fila antes de importar. <b>No se suma a la caja</b>: esos meses ya están registrados en la tesorería general.</p>
      <label class="upload"><input type="file" accept=".xlsx" data-file><div class="upload-ui"><div class="upload-cta">${icon('sheet', 22)}<span><strong>Elegir archivo Excel</strong><small>.xlsx · se lee en tu navegador</small></span></div></div></label>
      <div data-prev></div>`,
    submitLabel: 'Importar diezmos',
    onOpen(f) {
      const prev = f.querySelector('[data-prev]');
      const pintar = () => {
        const validas = filas.filter((x) => !x.error);
        const conError = filas.length - validas.length;
        const pendientes = validas.filter((x) => !x.miembroId && !x.existe).length;
        const total = validas.reduce((a, x) => a + x.monto, 0);
        const meses = [...new Set(validas.map((x) => x.fecha.slice(0, 7)))];
        prev.innerHTML = `
          <div class="imp-resumen">
            <div><b>${validas.length}</b><span>diezmos en el archivo</span></div>
            <div><b>${money(total)}</b><span>total ${meses.length === 1 ? meses[0] : ''}</span></div>
            <div><b>${filas.filter((x) => x.conyugeId).length}</b><span>de matrimonios</span></div>
            <div><b class="${pendientes ? 'gasto' : ''}">${pendientes}</b><span>sin asignar</span></div>
          </div>
          ${conError ? `<div class="note warn">${icon('alert', 16)}<span>${conError} fila${conError > 1 ? 's' : ''} no se importará${conError > 1 ? 'n' : ''} por tener datos inválidos: ${filas.filter((x) => x.error).slice(0, 5).map((x) => `fila ${x.fila} (${esc(x.error)})`).join(', ')}${conError > 5 ? '…' : ''}. Corrígelas en el Excel y vuelve a cargarlo.</span></div>` : ''}
          ${pendientes ? `<div class="note warn">${icon('alert', 16)}<span>Elige a qué hermano corresponde cada fila marcada. Las filas sin asignar no se importan.</span></div>` : ''}
          ${filas.some((x) => x.porFamilia) ? `<div class="note">${icon('sparkle', 16)}<span>Las filas marcadas <b>misma familia</b> se asignaron igual que otra anotación con el mismo nombre en el cuaderno (de este archivo o importada antes). Al elegir un hermano en una fila, las demás de esa familia se actualizan solas.</span></div>` : ''}
          <label class="check saldo-check"><input type="checkbox" data-vincular checked> <span>Registrar como <b>matrimonio</b> en Miembros a las parejas asignadas (si aún no tienen cónyuge)</span></label>
          <div class="table-wrap imp-lista diezmo-imp"><table class="table">
            <thead><tr><th>Fecha</th><th>En el cuaderno</th><th class="num">Monto</th><th>Hermano</th><th>Cónyuge (matrimonio)</th></tr></thead>
            <tbody>${filas.map((x, i) => `
              <tr class="${x.error ? 'fila-pendiente' : x.existe ? 'inactive' : !x.miembroId ? 'fila-pendiente' : ''}">
                <td class="nowrap">${x.fecha ? fecha(x.fecha) : '—'}</td>
                <td>${esc(x.cuaderno || x.hermano)}${x.error ? `<br><small class="gasto">Fila ${x.fila}: ${esc(x.error)} · no se importará</small>` : ''}${x.existe ? ' <span class="tag">ya importado</span>' : ''}${x.obs ? `<br><small class="muted">${esc(x.obs)}</small>` : ''}${x.porFamilia ? ' <span class="tag tag-verde" title="Asignado igual que otra anotación de la misma familia">misma familia</span>' : ''}${x.ambiguo ? '<br><small class="gasto">Nombre repetido en Miembros: elige cuál</small>' : ''}</td>
                <td class="num strong">${money(x.monto)}</td>
                <td><select class="cat-sel" data-i="${i}" data-campo="miembroId" ${x.existe || x.error ? 'disabled' : ''}>${opciones(x.miembroId)}</select></td>
                <td><select class="cat-sel" data-i="${i}" data-campo="conyugeId" ${x.existe || x.error ? 'disabled' : ''}>${opciones(x.conyugeId)}</select></td>
              </tr>`).join('')}</tbody>
          </table></div>`;
        prev.querySelectorAll('select[data-i]').forEach((s) => s.addEventListener('change', () => {
          const x = filas[+s.dataset.i];
          x[s.dataset.campo] = s.value;
          x.porFamilia = false;
          x.manual = true;
          // al elegir a un hermano con cónyuge registrado, se propone el matrimonio
          if (s.dataset.campo === 'miembroId' && s.value && !x.conyugeId && x.esMatrimonio) {
            const m = miembros.find((y) => y.id === s.value);
            if (m?.conyugeId) x.conyugeId = m.conyugeId;
          }
          // la misma familia en otros meses del archivo queda igual (salvo lo que ya elegiste a mano)
          if (x.clave) {
            filas.forEach((y) => {
              if (y === x || y.existe || y.error || y.manual || y.clave !== x.clave) return;
              if (!y.miembroId || y.porFamilia) { y.miembroId = x.miembroId; y.conyugeId = x.conyugeId; y.ambiguo = false; y.porFamilia = !!x.miembroId; }
              // ya tenía a uno de los dos (sugerido por el nombre): se completa el matrimonio igual que aquí
              else if (x.miembroId && x.conyugeId && !y.conyugeId && [x.miembroId, x.conyugeId].includes(y.miembroId)) {
                y.miembroId = x.miembroId; y.conyugeId = x.conyugeId; y.ambiguo = false; y.porFamilia = true;
              }
            });
          }
          pintar();
        }));
      };
      f.querySelector('[data-file]').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        prev.innerHTML = '<div class="spinner sm"></div>';
        try {
          const crudas = await leer(file);
          if (!crudas.length) throw new Error('No encontré filas con Fecha y Monto. Revisa que la primera fila de la tabla tenga esos encabezados.');
          const vistos = {};
          const porContenido = {};
          const listaContenido = {};
          const porRef = {};
          data.diezmos.forEach((d) => {
            if (d.refId) porRef[d.refId] = d;
            const m = /Cuaderno: ([^·]+)/.exec(d.notas || '');
            if (m) { const k = `${d.fecha}|${d.monto}|${norm(m[1])}`; porContenido[k] = (porContenido[k] || 0) + 1; (listaContenido[k] ||= []).push(d); }
          });
          filas = crudas.map((x) => {
            if (x.error) return { ...x, miembroId: '', conyugeId: '', refId: '', clave: '', existe: false };
            const h = buscarMiembro(miembros, x.hermano);
            const c = buscarMiembro(miembros, x.conyuge);
            const esMatrimonio = !!x.conyuge || /^(FAM|MATRIMONIO)\b/.test(norm(x.cuaderno)) || /\w-\w/.test(x.cuaderno);
            let conyugeId = c.id;
            if (!conyugeId && h.id && esMatrimonio) conyugeId = miembros.find((m) => m.id === h.id)?.conyugeId || '';
            // Identificador estable (no depende de la fila, para poder agregar meses al mismo archivo)
            const base = `historial:${x.fecha}:${x.monto}:${hash(norm(x.cuaderno || x.hermano))}`;
            vistos[base] = (vistos[base] || 0) + 1;
            const refId = vistos[base] > 1 ? `${base}#${vistos[base]}` : base;
            // También se reconoce lo importado antes por fecha, monto y nombre del cuaderno
            const kc = `${x.fecha}|${x.monto}|${norm(x.cuaderno || x.hermano)}`;
            const yaPorContenido = (porContenido[kc] || 0) >= vistos[base];
            const existe = existentes.has(refId) || yaPorContenido;
            // Lo ya importado muestra a quién quedó asignado, no lo que propone el nombre
            const previo = existe ? (porRef[refId] || (listaContenido[kc] || [])[vistos[base] - 1] || (listaContenido[kc] || [])[0]) : null;
            if (previo) return { ...x, miembroId: previo.miembroId, conyugeId: previo.conyugeId || '', ambiguo: false, esMatrimonio, refId, clave: familia(x.cuaderno || x.hermano), existe };
            return { ...x, miembroId: h.id, conyugeId, ambiguo: h.ambiguo, esMatrimonio, refId, clave: familia(x.cuaderno || x.hermano), existe };
          });
          // Familias ya conocidas: primero lo importado antes, luego lo escrito en este archivo (manda el archivo)
          const conocidas = {};
          const anotar = (k, miembroId, conyugeId) => {
            if (!k || !miembroId) return;
            const ya = conocidas[k];
            if (!ya || (!ya.conyugeId && conyugeId)) conocidas[k] = { miembroId, conyugeId: conyugeId || '' };
          };
          data.diezmos.forEach((d) => { const m = /Cuaderno: ([^·]+)/.exec(d.notas || ''); if (m) anotar(familia(m[1]), d.miembroId, d.conyugeId); });
          const delArchivo = {};
          filas.forEach((x) => {
            if (!x.miembroId || x.error) return;
            const ya = delArchivo[x.clave];
            if (!ya || (!ya.conyugeId && x.conyugeId)) delArchivo[x.clave] = { miembroId: x.miembroId, conyugeId: x.conyugeId };
          });
          Object.assign(conocidas, delArchivo);
          filas.forEach((x) => aplicarFamilia(x, conocidas[x.clave]));
          pintar();
        } catch (er) {
          prev.innerHTML = `<div class="note warn">${icon('alert', 16)} ${esc(er.message || 'No se pudo leer el archivo')}</div>`;
        }
      });
    },
    async onSubmit(f) {
      if (!filas.length) throw new Error('Primero elige el archivo');
      const items = filas.filter((x) => !x.existe && !x.error && x.miembroId).map((x) => ({
        refId: x.refId, fecha: x.fecha, miembroId: x.miembroId, conyugeId: x.conyugeId && x.conyugeId !== x.miembroId ? x.conyugeId : '',
        monto: x.monto, medio: x.medio, notas: [x.cuaderno ? `Cuaderno: ${x.cuaderno}` : '', x.obs].filter(Boolean).join(' · ').slice(0, 200)
      }));
      if (!items.length) throw new Error('No hay filas asignadas para importar');
      const r = await call('importarDiezmos', { items, vincularMatrimonios: !!f.querySelector('[data-vincular]')?.checked });
      toast(`${r.importados} diezmos importados${r.matrimonios ? ` · ${r.matrimonios} matrimonio${r.matrimonios > 1 ? 's' : ''} registrado${r.matrimonios > 1 ? 's' : ''}` : ''}${r.omitidos ? ` · ${r.omitidos} ya existían` : ''}`);
      await ctx.refresh();
    }
  });
}
