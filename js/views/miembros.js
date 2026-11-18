// Registro de miembros de la iglesia (solo tesorero): estado y datos de contacto
import { icon, esc, modal, formData, toast, confirmar, emptyState, fecha } from '../ui.js';
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
          <td><b>${esc(m.nombre)}</b>${m.conyugeId && nombreDe[m.conyugeId] ? `<br><small class="pareja-tag">💍 Matrimonio con ${esc(nombreDe[m.conyugeId])}</small>` : ''}${m.habilitadoDiezmo === 'no' ? '<br><span class="tag tag-gris">No habilitado para diezmar</span>' : ''}${m.notas ? `<br><small class="muted">${esc(m.notas)}</small>` : ''}</td>
          <td>${m.estado === 'activo' ? '<span class="badge st-ok">Activo</span>' : `<span class="badge st-open">Inactivo</span>${m.fechaBaja ? `<br><small class="muted">desde ${fecha(m.fechaBaja)}</small>` : ''}`}</td>
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
  return modal({
    title: m ? 'Ficha del miembro' : 'Nuevo miembro',
    body: `
      <label class="field"><span>Nombre y apellidos</span><input name="nombre" value="${esc(m?.nombre || '')}" required maxlength="80"></label>
      <div class="form-row">
        <label class="field"><span>Estado</span><select name="estado"><option value="activo" ${m?.estado !== 'inactivo' ? 'selected' : ''}>Activo</option><option value="inactivo" ${m?.estado === 'inactivo' ? 'selected' : ''}>Inactivo (alejado)</option></select></label>
        <label class="field" data-baja ${m?.estado === 'inactivo' ? '' : 'hidden'}><span>Fecha de baja (desde cuándo no asiste)</span><input type="date" name="fechaBaja" value="${esc(m?.fechaBaja || '')}" max="${ctx.data.hoy}"></label>
        <label class="field"><span>Fecha de nacimiento</span><input type="date" name="fechaNacimiento" value="${esc(m?.fechaNacimiento || '')}" max="${ctx.data.hoy}"></label>
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
      // la fecha de baja solo aplica a inactivos; al marcarlo inactivo se propone hoy
      f.estado.addEventListener('change', () => {
        const inactivo = f.estado.value === 'inactivo';
        f.querySelector('[data-baja]').hidden = !inactivo;
        if (inactivo && !f.fechaBaja.value) f.fechaBaja.value = ctx.data.hoy;
      });
      f.querySelector('[data-borrar]')?.addEventListener('click', async () => {
        close(null);
        if (!(await confirmar(`¿Eliminar a <b>${esc(m.nombre)}</b> del registro? Si solo dejó de asistir, es mejor marcarlo como inactivo.`, { boton: 'Eliminar', danger: true }))) return;
        try { await call('deleteMiembro', { id: m.id }); toast('Miembro eliminado'); await ctx.refresh(); } catch (e) { toast(e.message, 'err'); }
      });
    },
    async onSubmit(f) {
      const d = formData(f);
      if (m) d.id = m.id;
      await call('saveMiembro', d);
      toast(m ? 'Ficha actualizada' : 'Miembro agregado');
      await ctx.refresh();
    }
  });
}

// ---------------- Importar el listado desde Excel ----------------
async function leerListado(file) {
  const ExcelJS = await cargarExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  const filas = [];
  const txt = (v) => (v == null ? '' : typeof v === 'object' ? (v.richText ? v.richText.map((t) => t.text).join('') : v.text ?? v.result ?? '') : String(v)).trim();
  ws.eachRow((row, i) => {
    const nombre = txt(row.getCell(1).value);
    const nota = txt(row.getCell(2).value);
    if (!nombre || /listado|^nombres?$/i.test(nombre)) return;
    filas.push({ fila: i, nombre: nombrePropio(nombre), nota });
  });
  return filas;
}

function importarListado(ctx) {
  const existentes = new Set(ctx.data.miembros.map((m) => normalNombre(m.nombre)));
  let filas = [];
  return modal({
    title: 'Importar listado de miembros',
    wide: true,
    body: `<p class="muted">Elige el Excel con el listado: el nombre en la primera columna y, si corresponde, una nota en la segunda. Quienes digan <b>“alejado/a”</b> quedan como <b>inactivos</b>; el resto como activos.</p>
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
          const crudas = await leerListado(file);
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
    async onSubmit() {
      const items = filas.filter((x) => !x.existe).map((x) => ({ nombre: x.nombre, estado: x.estado, notas: x.notas, permitirRepetido: x.repetido }));
      if (!items.length) throw new Error(filas.length ? 'Todos los miembros del listado ya están registrados' : 'Primero elige el archivo');
      const r = await call('importarMiembros', { items });
      toast(`${r.importados} miembros importados${r.omitidos ? ` (${r.omitidos} ya existían)` : ''}`);
      await ctx.refresh();
    }
  });
}
