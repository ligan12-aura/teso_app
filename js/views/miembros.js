// Registro de miembros de la iglesia (solo tesorero): estado y datos de contacto
import { icon, esc, modal, formData, toast, confirmar, emptyState, fecha, esAdmin } from '../ui.js';
import { call } from '../api.js';
import { cargarExcelJS } from '../planillaDescarga.js';

const filtros = { estado: 'todos', q: '' };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const normalNombre = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const nombrePropio = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase()
  .replace(/(^|[\s-])([a-záéíóúñü])/g, (m, p, c) => p + c.toUpperCase())
  .replace(/\b(De|Del|La|Las|Los|Y)\b/g, (w, x, i) => (i === 0 ? w : w.toLowerCase()));

export function edad(fn, hoy) {
  if (!fn) return null;
  const [y, m, d] = fn.split('-').map(Number);
  const [hy, hm, hd] = hoy.split('-').map(Number);
  return hy - y - (hm < m || (hm === m && hd < d) ? 1 : 0);
}
export const ESTADOS_CIVILES = [['soltero', 'Soltero/a'], ['casado', 'Casado/a'], ['conviviente', 'Conviviente civil'], ['separado', 'Separado/a'], ['divorciado', 'Divorciado/a'], ['viudo', 'Viudo/a']];
export const estadoCivilTexto = (v) => (ESTADOS_CIVILES.find(([k]) => k === v) || [, ''])[1];
const fichaCompleta = (m) => !!(m.fechaNacimiento && m.celular && m.email && m.domicilio);

export function render(root, ctx) {
  const { data } = ctx;
  const hoy = data.hoy;
  const miembros = [...data.miembros].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const activos = miembros.filter((m) => m.estado === 'activo');
  const completas = miembros.filter(fichaCompleta).length;
  const nombreDe = Object.fromEntries(data.miembros.map((x) => [x.id, x.nombre]));
  const mesHoy = +hoy.slice(5, 7);
  const cumple = miembros.filter((m) => m.estado === 'activo' && m.fechaNacimiento && +m.fechaNacimiento.slice(5, 7) === mesHoy)
    .sort((a, b) => a.fechaNacimiento.slice(8).localeCompare(b.fechaNacimiento.slice(8)));
  const q = filtros.q.toLowerCase();
  const lista = miembros.filter((m) => {
    if (filtros.estado === 'activos' && m.estado !== 'activo') return false;
    if (filtros.estado === 'inactivos' && m.estado !== 'inactivo') return false;
    if (filtros.estado === 'incompletas' && fichaCompleta(m)) return false;
    if (filtros.estado === 'nohab' && m.habilitadoDiezmo !== 'no') return false;
    return !q || `${m.nombre} ${m.celular} ${m.email} ${m.domicilio} ${m.notas}`.toLowerCase().includes(q);
  });

  root.innerHTML = `
  <section class="page-head">
    <div><span class="eyebrow">Iglesia</span><h1>Miembros</h1></div>
    <div class="head-actions">
      <button class="btn btn-ghost" data-importar>${icon('sheet', 16)} Importar listado</button>
      <button class="btn btn-primary" data-nuevo>${icon('plus', 16)} Nuevo miembro</button>
    </div>
  </section>

  <section class="kpis kpis-4">
    <article class="kpi"><span class="kpi-label">${icon('users', 15)} Miembros</span><strong class="kpi-value">${miembros.length}</strong><span class="kpi-sub">en el registro</span></article>
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:var(--green)"></i> Activos</span><strong class="kpi-value">${activos.length}</strong><span class="kpi-sub">${miembros.length ? Math.round((activos.length / miembros.length) * 100) : 0}% del total</span></article>
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:#9aa3b2"></i> Inactivos</span><strong class="kpi-value">${miembros.length - activos.length}</strong><span class="kpi-sub">alejados</span></article>
    <article class="kpi"><span class="kpi-label">${icon('checkCircle', 15)} Fichas completas</span><strong class="kpi-value">${miembros.length ? Math.round((completas / miembros.length) * 100) : 0}%</strong><span class="kpi-sub">${completas} de ${miembros.length} con nacimiento, celular, correo y domicilio</span></article>
  </section>

  ${cumple.length ? `<article class="card cumple-card">
    <header class="card-head"><div><h3>${icon('gift', 17)} Cumpleaños de ${MESES[mesHoy - 1]}</h3></div></header>
    <ul class="cumple-list">${cumple.map((m) => { const dia = +m.fechaNacimiento.slice(8, 10); const e = edad(m.fechaNacimiento, `${hoy.slice(0, 4)}-${hoy.slice(5, 7)}-${String(dia).padStart(2, '0')}`); return `<li class="${dia === +hoy.slice(8, 10) ? 'hoy' : ''}"><b>${dia}</b><span>${esc(m.nombre)}</span><small>${e} años</small></li>`; }).join('')}</ul>
  </article>` : ''}

  <article class="card">
    <header class="card-head wrap">
      <div><h3>Listado</h3><p class="muted">${lista.length} de ${miembros.length}</p></div>
    </header>
    <div class="filters">
      <div class="search">${icon('search', 16)}<input type="search" placeholder="Buscar por nombre, celular, correo…" value="${esc(filtros.q)}" data-q></div>
      <div class="seg seg-sm">
        ${[['todos', 'Todos'], ['activos', 'Activos'], ['inactivos', 'Inactivos'], ['incompletas', 'Ficha incompleta'], ['nohab', 'No habilitados']].map(([k, l]) => `<label><input type="radio" name="fest" value="${k}" ${filtros.estado === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}
      </div>
    </div>
    ${miembros.length ? (lista.length ? `<div class="table-wrap"><table class="table miembros-table">
      <thead><tr><th>Nombre</th><th>Estado</th><th>Nacimiento</th><th>Celular</th><th class="hide-sm">Correo</th><th class="hide-sm">Domicilio</th><th></th></tr></thead>
      <tbody>${lista.map((m) => {
        const e = edad(m.fechaNacimiento, hoy);
        return `<tr class="${m.estado === 'inactivo' ? 'inactive' : ''}">
          <td><b>${esc(m.nombre)}</b>${m.estadoCivil ? ` <small class="muted">· ${estadoCivilTexto(m.estadoCivil)}</small>` : ''}${m.conyugeId && nombreDe[m.conyugeId] ? `<br><small class="pareja-tag">💍 Matrimonio con ${esc(nombreDe[m.conyugeId])}</small>` : ''}${m.habilitadoDiezmo === 'no' ? '<br><span class="tag tag-gris">No habilitado para diezmar</span>' : ''}${m.notas ? `<br><small class="muted">${esc(m.notas)}</small>` : ''}</td>
          <td>${m.estado === 'activo' ? `<span class="badge st-ok">Activo</span>${m.fechaIngreso ? `<br><small class="muted">desde ${fecha(m.fechaIngreso)}</small>` : ''}` : `<span class="badge st-open">Inactivo</span>${m.fechaBaja ? `<br><small class="muted">desde ${fecha(m.fechaBaja)}</small>` : ''}`}</td>
          <td class="nowrap">${m.fechaNacimiento ? `${fecha(m.fechaNacimiento)}<br><small class="muted">${e} años</small>` : '<span class="falta">—</span>'}</td>
          <td class="nowrap">${m.celular ? `<a class="link" href="tel:${esc(m.celular.replace(/[^\d+]/g, ''))}">${esc(m.celular)}</a>` : '<span class="falta">—</span>'}</td>
          <td class="hide-sm">${m.email ? `<a class="link" href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : '<span class="falta">—</span>'}</td>
          <td class="hide-sm desc">${m.domicilio ? esc(m.domicilio) : '<span class="falta">—</span>'}</td>
          <td class="row-actions"><button class="icon-btn sm" data-edit="${m.id}" title="Editar ficha">${icon('edit', 16)}</button></td>
        </tr>`;
      }).join('')}</tbody></table></div>` : emptyState('Ningún miembro coincide con la búsqueda', 'search'))
    : emptyState('Aún no hay miembros. Usa <b>Importar listado</b> para cargar el Excel o agrégalos uno a uno.', 'users')}
  </article>`;

  root.querySelector('[data-nuevo]').addEventListener('click', () => editarMiembro(ctx));
  root.querySelector('[data-importar]').addEventListener('click', () => importarListado(ctx));
  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editarMiembro(ctx, data.miembros.find((m) => m.id === b.dataset.edit))));
  root.querySelectorAll('[name=fest]').forEach((r) => r.addEventListener('change', () => { filtros.estado = r.value; render(root, ctx); }));
  const qi = root.querySelector('[data-q]');
  qi.addEventListener('input', () => {
    clearTimeout(qi._t);
    qi._t = setTimeout(() => { filtros.q = qi.value; render(root, ctx); const n = root.querySelector('[data-q]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250);
  });
}

export function editarMiembro(ctx, m = null) {
  // Personas de los listados de ministerios (p. ej. Jóvenes) que aún no son miembros: al elegir una,
  // queda enlazada a esta ficha y no hay que ir a cambiarla al listado
  const minNom = Object.fromEntries((ctx.data.ministerios || []).map((x) => [x.id, x.nombre]));
  const yaEnlazado = new Set((ctx.data.integrantes || []).filter((i) => m && i.esMiembro && i.miembroId === m.id).map((i) => i.ministerioId));
  const candidatos = (ctx.data.integrantes || []).filter((i) => !i.esMiembro && !yaEnlazado.has(i.ministerioId)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const enlazadoEn = (ctx.data.integrantes || []).filter((i) => m && i.esMiembro && i.miembroId === m.id).map((i) => minNom[i.ministerioId]).filter(Boolean);
  return modal({
    title: m ? 'Ficha del miembro' : 'Nuevo miembro',
    body: `
      ${candidatos.length && esAdmin(ctx.user) ? `<label class="field"><span>¿Ya está en un listado de ministerio? <small class="muted">(opcional)</small></span><select name="integranteId"><option value="">— No —</option>${candidatos.map((i) => `<option value="${i.id}">${esc(i.nombre)} · ${esc(minNom[i.ministerioId] || '')}</option>`).join('')}</select><small class="hint">Al elegirlo, queda marcado como miembro en ese listado${m ? '' : ' y se copian sus datos'}.</small></label>` : ''}
      ${enlazadoEn.length ? `<p class="muted small">${icon('users', 13)} También está en el listado de ${esc(enlazadoEn.join(', '))}.</p>` : ''}
      <label class="field"><span>Nombre y apellidos</span><input name="nombre" value="${esc(m?.nombre || '')}" required maxlength="80"></label>
      <div class="form-row">
        <label class="field"><span>Estado</span><select name="estado"><option value="activo" ${m?.estado !== 'inactivo' ? 'selected' : ''}>Activo</option><option value="inactivo" ${m?.estado === 'inactivo' ? 'selected' : ''}>Inactivo (alejado)</option></select></label>
        <label class="field"><span>Miembro desde <small class="muted">(opcional)</small></span><input type="date" name="fechaIngreso" value="${esc(m?.fechaIngreso || '')}" max="${ctx.data.hoy}"><small class="hint">Déjalo vacío si ya era miembro: sus diezmos anteriores siguen contando.</small></label>
        <label class="field" data-baja ${m?.estado === 'inactivo' ? '' : 'hidden'}><span>Fecha de baja (desde cuándo no asiste)</span><input type="date" name="fechaBaja" value="${esc(m?.fechaBaja || '')}" max="${ctx.data.hoy}"></label>
        <label class="field"><span>Fecha de nacimiento</span><input type="date" name="fechaNacimiento" value="${esc(m?.fechaNacimiento || '')}" max="${ctx.data.hoy}"></label>
        <label class="field"><span>Estado civil</span><select name="estadoCivil"><option value="">— Sin dato —</option>${ESTADOS_CIVILES.map(([k, l]) => `<option value="${k}" ${m?.estadoCivil === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="form-row">
        <label class="field"><span>Celular</span><input name="celular" inputmode="tel" placeholder="+56 9 1234 5678" value="${esc(m?.celular || '')}"></label>
        <label class="field"><span>Correo</span><input type="email" name="email" placeholder="nombre@correo.cl" value="${esc(m?.email || '')}"></label>
      </div>
      <label class="field"><span>Domicilio</span><input name="domicilio" placeholder="Calle, número, comuna" value="${esc(m?.domicilio || '')}"></label>
      <label class="field"><span>💍 Cónyuge (diezman como matrimonio)</span><select name="conyugeId"><option value="">— Sin cónyuge registrado —</option>${[...ctx.data.miembros].filter((x) => x.id !== m?.id).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((x) => `<option value="${x.id}" ${x.id === m?.conyugeId ? 'selected' : ''}>${esc(x.nombre)}${x.conyugeId && x.conyugeId !== m?.id ? ' (ya tiene cónyuge)' : ''}${x.estado === 'inactivo' ? ' · inactivo' : ''}</option>`).join('')}</select></label>
      <label class="field"><span>Habilitado para diezmar</span><select name="habilitadoDiezmo"><option value="si" ${m?.habilitadoDiezmo !== 'no' ? 'selected' : ''}>Sí · trabaja o tiene ingresos</option><option value="no" ${m?.habilitadoDiezmo === 'no' ? 'selected' : ''}>No · estudiante o sin ingresos</option></select><small class="hint">Los no habilitados no se cuentan en la estadística de diezmos.</small></label>
      <label class="field"><span>Notas</span><input name="notas" maxlength="300" value="${esc(m?.notas || '')}"></label>
      ${m && ctx.user?.rol !== 'secretaria' ? `<button type="button" class="link-btn danger-link" data-borrar>${icon('trash', 14)} Eliminar miembro</button>` : ''}`,
    submitLabel: m ? 'Guardar ficha' : 'Agregar',
    onOpen(f, { close }) {
      // al elegir a alguien del listado de un ministerio, se completan los datos vacíos
      f.integranteId?.addEventListener('change', () => {
        const it = candidatos.find((i) => i.id === f.integranteId.value);
        if (!it) return;
        if (!f.nombre.value.trim()) f.nombre.value = it.nombre;
        ['celular', 'email', 'fechaNacimiento'].forEach((k) => { if (!f[k].value && it[k]) f[k].value = it[k]; });
        if (!m && !f.fechaIngreso.value) f.fechaIngreso.value = ctx.data.hoy;
      });
      // la fecha de baja solo aplica a inactivos; al marcarlo inactivo se propone hoy
      f.estado.addEventListener('change', () => {
        const inactivo = f.estado.value === 'inactivo';
        f.querySelector('[data-baja]').hidden = !inactivo;
        if (inactivo && !f.fechaBaja.value) f.fechaBaja.value = ctx.data.hoy;
      });
      f.querySelector('[data-borrar]')?.addEventListener('click', async () => {
        close(null);
        if (!(await confirmar(`¿Eliminar a <b>${esc(m.nombre)}</b> del registro?<br><span class="muted">Elimina solo si fue un error al ingresarlo: desaparece también de los análisis de meses pasados. Si dejó la iglesia, márcalo <b>inactivo</b> con su fecha de baja y su historial se conserva.</span>`, { boton: 'Eliminar', danger: true }))) return;
        try { await call('deleteMiembro', { id: m.id }); toast('Miembro eliminado'); await ctx.refresh(); } catch (e) { toast(e.message, 'err'); }
      });
    },
    async onSubmit(f) {
      const d = formData(f);
      if (m) d.id = m.id;
      const r = await call('saveMiembro', d);
      const enl = r?.enlazados?.length ? ` · enlazado en el listado (${r.enlazados.join(', ')})` : '';
      toast((m ? 'Ficha actualizada' : 'Miembro agregado') + enl);
      await ctx.refresh();
    }
  });
}

// ---------------- Importar el listado desde Excel ----------------
const txtCelda = (v) => (v == null ? '' : v instanceof Date ? '' : typeof v === 'object' ? (v.richText ? v.richText.map((t) => t.text).join('') : v.text ?? v.result ?? '') : String(v)).trim();
const fechaCelda = (v, hoy, min = '1900-01-01') => {
  let f = '';
  if (v instanceof Date && !isNaN(v)) f = v.toISOString().slice(0, 10);
  else if (typeof v === 'number' && v >= 1900 && v <= 2100) f = `${v}-01-01`;
  else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) f = v.trim().slice(0, 10);
  else if (typeof v === 'string' && /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(v.trim())) { const [d, m, y] = v.trim().split(/[-/]/); f = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; }
  return f && f <= hoy && f >= min ? f : '';
};
const toks = (n) => normalNombre(n).replace(/[.,]/g, ' ').split(' ').filter(Boolean);
// el nombre corto (p. ej. "Amelia Cumín") calza con el completo ("Amelia Cumín Mardones"); admite iniciales
function contenido(corto, largo) {
  const a = toks(corto), b = toks(largo);
  if (a.length < 2 || !b.length || a[0] !== b[0]) return false;
  return a.every((t) => (t.length === 1 ? b.some((x) => x[0] === t) : b.includes(t)));
}
const parecido = (x, y) => contenido(x, y) || contenido(y, x);
// mismo primer nombre y al menos un apellido en común (solo para sugerir, nunca automático)
const lejano = (x, y) => { const a = toks(x), b = toks(y); return a[0] === b[0] && a.slice(1).some((t) => t.length > 2 && b.slice(1).includes(t)); };

async function leerListado(file, hoy) {
  const ExcelJS = await cargarExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const hojaAct = wb.worksheets.find((w) => /activos/i.test(w.name));
  const hojaHist = wb.worksheets.find((w) => /hist/i.test(w.name));
  if (hojaAct && hojaHist) return { tipo: 'completo', filas: leerCompleto(hojaAct, hojaHist, hoy) };
  const ws = wb.worksheets[0];
  const filas = [];
  ws.eachRow((row, i) => {
    const nombre = txtCelda(row.getCell(1).value);
    const nota = txtCelda(row.getCell(2).value);
    if (!nombre || /listado|^nombres?$/i.test(nombre)) return;
    filas.push({ fila: i, nombre: nombrePropio(nombre), nota });
  });
  return { tipo: 'simple', filas };
}

// Planilla "Listado de miembros": hoja de activos (hasta el bloque "Jóvenes", que no son miembros)
// completada con los datos de la hoja histórica
function leerCompleto(act, hist, hoy) {
  const col = (ws, re) => { let c = 0; ws.getRow(1).eachCell((cell, j) => { if (!c && re.test(txtCelda(cell.value))) c = j; }); return c; };
  const H = { nombre: col(hist, /^nombre/i) || 1, nac: col(hist, /nacimiento/i), civil: col(hist, /estado civil/i), dom: col(hist, /domicilio/i), ing: col(hist, /ingreso/i), obs: col(hist, /observ/i), estado: col(hist, /membres/i) };
  const historico = [];
  hist.eachRow((row, i) => {
    if (i === 1) return;
    const nombre = txtCelda(row.getCell(H.nombre).value);
    if (!nombre) return;
    const v = (c) => (c ? row.getCell(c).value : null);
    const obs = txtCelda(v(H.obs));
    historico.push({
      nombre, fechaNacimiento: fechaCelda(v(H.nac), hoy), estadoCivil: txtCelda(v(H.civil)), domicilio: txtCelda(v(H.dom)),
      fechaIngreso: fechaCelda(v(H.ing), hoy), notas: /[a-záéíóúñ]{3}/i.test(obs) ? obs : '', estadoHist: txtCelda(v(H.estado))
    });
  });
  const cNac = col(act, /nacimiento/i);
  const filas = [];
  let fin = false;
  act.eachRow((row, i) => {
    if (i === 1 || fin) return;
    const crudo = txtCelda(row.getCell(1).value);
    if (!crudo) return;
    if (/^j[oó]venes$/i.test(crudo)) { fin = true; return; }
    const exacto = historico.find((h) => normalNombre(h.nombre) === normalNombre(crudo));
    const parecidos = exacto ? [] : historico.filter((h) => parecido(h.nombre, crudo));
    const h = exacto || (parecidos.length === 1 ? parecidos[0] : null) || {};
    filas.push({
      fila: i, nombre: nombrePropio(crudo), nombreHist: h.nombre && !exacto ? nombrePropio(h.nombre) : '',
      fechaNacimiento: fechaCelda(cNac ? row.getCell(cNac).value : null, hoy) || h.fechaNacimiento || '',
      estadoCivil: h.estadoCivil || '', domicilio: h.domicilio || '', fechaIngreso: h.fechaIngreso || '', notas: h.notas || '', estadoHist: h.estadoHist || '',
      // en la hoja de activos pero "Miembro inactivo" en el histórico: se inscribe como inactivo
      inactivo: /inactiv/i.test(h.estadoHist || '')
    });
  });
  return filas;
}

function importarListado(ctx) {
  const existentes = new Set(ctx.data.miembros.map((m) => normalNombre(m.nombre)));
  let filas = [];
  let modo = 'simple';
  return modal({
    title: 'Importar listado de miembros',
    wide: true,
    body: `<p class="muted">Elige el Excel con el listado: el nombre en la primera columna y, si corresponde, una nota en la segunda. Quienes digan <b>“alejado/a”</b> quedan como <b>inactivos</b>; el resto como activos.</p>
      <p class="muted small">También sirve la planilla <b>Listado de miembros</b> con las hojas “Miembros activos” y “Miembros histórico”: completa las fichas de los activos con su nacimiento, estado civil, domicilio, fecha de ingreso y observaciones.</p>
      <label class="upload"><input type="file" accept=".xlsx" data-file><div class="upload-ui"><div class="upload-cta">${icon('sheet', 22)}<span><strong>Elegir archivo Excel</strong><small>.xlsx · se lee en tu navegador</small></span></div></div></label>
      <div data-prev></div>`,
    submitLabel: 'Importar',
    onOpen(f) {
      const prev = f.querySelector('[data-prev]');
      f.querySelector('[data-file]').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        prev.innerHTML = '<div class="spinner sm"></div>';
        try {
          const leido = await leerListado(file, ctx.data.hoy);
          modo = leido.tipo;
          if (modo === 'completo') { filas = leido.filas; pintarCompleto(prev, ctx, filas); return; }
          const crudas = leido.filas;
          const vistos = {};
          crudas.forEach((x) => { const k = normalNombre(x.nombre); vistos[k] = (vistos[k] || 0) + 1; });
          filas = crudas.map((x) => {
            const k = normalNombre(x.nombre);
            const inactivo = /alejad/i.test(x.nota);
            const repetido = vistos[k] > 1;
            const notas = [x.nota ? x.nota.charAt(0).toUpperCase() + x.nota.slice(1) : '', repetido ? 'Nombre repetido en el listado: revisar' : ''].filter(Boolean).join(' · ');
            return { ...x, estado: inactivo ? 'inactivo' : 'activo', notas, repetido, existe: existentes.has(k) };
          });
          const nuevos = filas.filter((x) => !x.existe);
          prev.innerHTML = `
            <div class="imp-resumen">
              <div><b>${filas.length}</b><span>en el listado</span></div>
              <div><b>${nuevos.filter((x) => x.estado === 'activo').length}</b><span>activos nuevos</span></div>
              <div><b>${nuevos.filter((x) => x.estado === 'inactivo').length}</b><span>inactivos nuevos</span></div>
              <div><b>${filas.length - nuevos.length}</b><span>ya registrados</span></div>
            </div>
            ${filas.some((x) => x.repetido) ? `<div class="note warn">${icon('alert', 16)}<span>Nombres repetidos: <b>${[...new Set(filas.filter((x) => x.repetido).map((x) => esc(x.nombre)))].join(', ')}</b>. Se importan ambos con una nota para que revises si son personas distintas.</span></div>` : ''}
            <div class="table-wrap imp-lista"><table class="table">
              <thead><tr><th>#</th><th>Nombre</th><th>Estado</th><th>Nota</th></tr></thead>
              <tbody>${filas.map((x, i) => `<tr class="${x.existe ? 'inactive' : ''}"><td class="muted">${i + 1}</td><td>${esc(x.nombre)}${x.existe ? ' <span class="tag">ya existe</span>' : ''}</td><td>${x.estado === 'activo' ? '<span class="badge st-ok">Activo</span>' : '<span class="badge st-open">Inactivo</span>'}</td><td class="muted">${esc(x.notas)}</td></tr>`).join('')}</tbody>
            </table></div>`;
        } catch (er) {
          prev.innerHTML = `<div class="note warn">${icon('alert', 16)} ${esc(er.message || 'No se pudo leer el archivo')}</div>`;
        }
      });
    },
    async onSubmit(f) {
      if (modo === 'completo') {
        const renombrar = !!f.querySelector('[data-renombrar]')?.checked;
        const activar = !!f.querySelector('[data-activar]')?.checked;
        const items = filas.filter((x) => x.destino !== 'omitir').map((x) => ({
          id: x.destino === 'nuevo' ? '' : x.destino, nombre: x.nombre, fechaNacimiento: x.fechaNacimiento, estadoCivil: x.estadoCivil,
          domicilio: x.domicilio, fechaIngreso: x.fechaIngreso, notas: x.notas, renombrar, activar, inactivo: !!x.inactivo
        }));
        const elegidos = items.filter((x) => x.id).map((x) => x.id);
        const repetido = elegidos.find((id, i) => elegidos.indexOf(id) !== i);
        if (repetido) throw new Error(`${ctx.data.miembros.find((m) => m.id === repetido)?.nombre} quedó elegido para dos personas del listado`);
        if (!items.length) throw new Error('No hay nada que cargar');
        const r = await call('completarMiembros', { items });
        toast(`${r.completados} fichas completadas · ${r.agregados} miembros agregados${r.sinCambios ? ` · ${r.sinCambios} ya tenían todo` : ''}`);
        await ctx.refresh();
        return;
      }
      const items = filas.filter((x) => !x.existe).map((x) => ({ nombre: x.nombre, estado: x.estado, notas: x.notas, permitirRepetido: x.repetido }));
      if (!items.length) throw new Error(filas.length ? 'Todos los miembros del listado ya están registrados' : 'Primero elige el archivo');
      const r = await call('importarMiembros', { items });
      toast(`${r.importados} miembros importados${r.omitidos ? ` (${r.omitidos} ya existían)` : ''}`);
      await ctx.refresh();
    }
  });
}

// Vista previa de la planilla completa: a quién de la app corresponde cada persona y qué datos se cargan
function pintarCompleto(prev, ctx, filas) {
  const miembros = [...ctx.data.miembros].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const nom = Object.fromEntries(miembros.map((m) => [m.id, m]));
  const porNombre = Object.fromEntries(miembros.map((m) => [normalNombre(m.nombre), m]));
  const exactos = new Set();
  filas.forEach((x) => { const m = porNombre[normalNombre(x.nombre)]; if (m) { x.exacto = m.id; exactos.add(m.id); } });
  // candidatos por nombre corto/largo: si hay uno solo y nadie más lo reclama, queda elegido
  filas.forEach((x) => {
    if (x.exacto) { x.cands = [x.exacto]; x.sugeridos = []; return; }
    x.cands = miembros.filter((m) => !exactos.has(m.id) && parecido(m.nombre, x.nombre)).map((m) => m.id);
    x.sugeridos = x.cands.length ? [] : miembros.filter((m) => !exactos.has(m.id) && lejano(m.nombre, x.nombre)).map((m) => m.id);
  });
  const reclamos = {};
  filas.forEach((x) => { if (!x.exacto && x.cands.length === 1) reclamos[x.cands[0]] = (reclamos[x.cands[0]] || 0) + 1; });
  filas.forEach((x) => {
    if (x.exacto) { x.destino = x.exacto; x.como = 'exacto'; }
    else if (x.cands.length === 1 && reclamos[x.cands[0]] === 1) { x.destino = x.cands[0]; x.como = 'corto'; }
    else if (x.cands.length) { x.destino = 'omitir'; x.como = 'dudoso'; }
    else { x.destino = 'nuevo'; x.como = x.sugeridos.length ? 'sugerido' : 'nuevo'; }
  });
  const CAMPOS = [['fechaNacimiento', 'nacimiento'], ['estadoCivil', 'estado civil'], ['domicilio', 'domicilio'], ['fechaIngreso', 'miembro desde'], ['notas', 'observación']];
  const aCargar = (x) => {
    const m = nom[x.destino];
    return CAMPOS.filter(([k]) => x[k] && (!m || !m[k] || (k === 'notas' && !normalNombre(m.notas).includes(normalNombre(x.notas))))).map(([, l]) => l);
  };
  const pintar = () => {
    const usados = filas.filter((x) => nom[x.destino]);
    const inactivos = usados.filter((x) => !x.inactivo && nom[x.destino].estado === 'inactivo');
    const quedanInactivos = filas.filter((x) => x.inactivo && x.destino !== 'omitir');
    const renombrables = usados.filter((x) => normalNombre(nom[x.destino].nombre) !== normalNombre(x.nombre));
    const fuera = miembros.filter((m) => m.estado === 'activo' && !usados.some((x) => x.destino === m.id));
    const opciones = (x) => {
      const ids = [...new Set([...x.cands, ...x.sugeridos, ...(nom[x.destino] ? [x.destino] : [])])];
      return `<option value="nuevo" ${x.destino === 'nuevo' ? 'selected' : ''}>➕ Agregar como nuevo</option><option value="omitir" ${x.destino === 'omitir' ? 'selected' : ''}>— No cargar —</option>${ids.map((id) => `<option value="${id}" ${x.destino === id ? 'selected' : ''}>= ${esc(nom[id].nombre)}${nom[id].estado === 'inactivo' ? ' · inactivo' : ''}</option>`).join('')}<option value="buscar">Buscar otro miembro…</option>`;
    };
    const revisar = (x) => x.como === 'dudoso' || x.como === 'sugerido';
    prev.innerHTML = `
      <div class="imp-resumen">
        <div><b>${filas.length}</b><span>activos en la planilla</span></div>
        <div><b>${usados.length}</b><span>ya están en la app</span></div>
        <div><b>${filas.filter((x) => x.destino === 'nuevo').length}</b><span>se agregan como nuevos</span></div>
        <div><b>${filas.filter((x) => x.destino === 'omitir').length}</b><span>sin cargar</span></div>
      </div>
      <div class="note">${icon('sparkle', 16)}<span>A quienes ya están en la app solo se les llenan los datos que <b>les faltan</b>; lo que ya tienen no se cambia. Revisa la columna “En la app”: ${usados.filter((x) => x.como === 'corto').length} se reconocieron por su nombre corto${filas.some(revisar) ? ` y ${filas.filter(revisar).length} en amarillo ${filas.filter(revisar).length === 1 ? 'tiene' : 'tienen'} un nombre parecido o más de una opción` : ''}. Si alguien ya está en la app con otro nombre, elige “Buscar otro miembro…”.</span></div>
      ${filas.some((x) => x.como === 'dudoso') ? `<div class="note warn">${icon('alert', 16)}<span>${filas.filter((x) => x.como === 'dudoso').length} persona(s) calzan con más de un miembro: quedaron en “No cargar” hasta que elijas.</span></div>` : ''}
      <div class="imp-opciones">
        ${renombrables.length ? `<label class="check saldo-check"><input type="checkbox" data-renombrar checked> <span>Poner el nombre completo de la planilla a ${renombrables.length} miembro(s) <small class="muted">(p. ej. ${esc(nom[renombrables[0].destino].nombre)} → ${esc(renombrables[0].nombre)})</small></span></label>` : ''}
        ${inactivos.length ? `<label class="check saldo-check"><input type="checkbox" data-activar checked> <span>Marcar como activos a ${inactivos.length} que hoy figuran inactivos: ${inactivos.map((x) => esc(nom[x.destino].nombre)).join(', ')}</span></label>` : ''}
      </div>
      ${quedanInactivos.length ? `<p class="muted small">${quedanInactivos.length} figuran como “Miembro inactivo” en el histórico: quedan inscritos como <b>inactivos</b> (${quedanInactivos.map((x) => esc(x.nombre)).join(', ')}).</p>` : ''}
      ${fuera.length ? `<p class="muted small">${fuera.length} miembro(s) activos en la app no aparecen en la hoja de activos: no se modifican.</p>` : ''}
      <div class="table-wrap imp-lista"><table class="table">
        <thead><tr><th>#</th><th>Planilla</th><th>En la app</th><th>Datos que se cargan</th></tr></thead>
        <tbody>${filas.map((x, i) => {
          const cargar = x.destino === 'omitir' ? [] : aCargar(x);
          return `<tr class="${x.destino === 'omitir' ? 'inactive' : ''}${revisar(x) ? ' fila-revisar' : ''}">
            <td class="muted">${i + 1}</td>
            <td><b>${esc(x.nombre)}</b>${x.nombreHist ? `<br><small class="muted">En el histórico: ${esc(x.nombreHist)}</small>` : ''}${x.inactivo ? '<br><span class="badge st-open">Queda inactivo</span> <small class="muted">(inactivo en el histórico)</small>' : /fallec|traslad/i.test(x.estadoHist) ? `<br><small class="falta">Histórico: ${esc(x.estadoHist)}</small>` : ''}</td>
            <td><select class="cat-sel" data-fila="${i}">${opciones(x)}</select>${x.como === 'corto' ? '<br><small class="muted">Coincide por nombre: revisa</small>' : x.como === 'sugerido' ? '<br><small class="muted">Hay un nombre parecido: revisa</small>' : ''}</td>
            <td class="small">${cargar.length ? esc(cargar.join(', ')) : `<span class="muted">${x.destino === 'omitir' ? '—' : 'nada nuevo'}</span>`}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;
    prev.querySelectorAll('[data-fila]').forEach((sel) => sel.addEventListener('change', () => {
      const x = filas[+sel.dataset.fila];
      if (sel.value === 'buscar') {
        const q = prompt(`¿Con qué miembro de la app corresponde ${x.nombre}? Escribe parte de su nombre:`);
        const hallados = q ? miembros.filter((m) => normalNombre(m.nombre).includes(normalNombre(q))) : [];
        hallados.slice(0, 10).forEach((m) => { if (!x.sugeridos.includes(m.id)) x.sugeridos.push(m.id); });
        if (hallados.length === 1) { x.destino = hallados[0].id; x.como = 'elegido'; }
        else if (q && !hallados.length) toast('No encontré a nadie con ese nombre', 'err');
      } else { x.destino = sel.value; x.como = 'elegido'; }
      pintar();
    }));
  };
  pintar();
}
