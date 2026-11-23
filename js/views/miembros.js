// Registro de miembros de la iglesia (solo tesorero): estado y datos de contacto
import { icon, esc, modal, formData, toast, confirmar, emptyState, fecha, esAdmin, sinTildes } from '../ui.js';
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
// RUT chileno: normaliza a 12.345.678-9 y revisa el dígito verificador (null = inválido, '' = vacío)
export function rutNormal(v) {
  const t = String(v || '').toUpperCase().replace(/[^0-9K]/g, '');
  if (t.length < 2) return '';
  const cuerpo = t.slice(0, -1), dv = t.slice(-1);
  if (!/^\d{6,8}$/.test(cuerpo)) return null;
  let suma = 0, mul = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) { suma += +cuerpo[i] * mul; mul = mul === 7 ? 2 : mul + 1; }
  const r = 11 - (suma % 11);
  if (dv !== (r === 11 ? '0' : r === 10 ? 'K' : String(r))) return null;
  return cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv;
}
const fichaCompleta = (m) => !!(m.fechaNacimiento && m.celular && m.email && m.domicilio);

// Años en que estuvo inactivo (aunque hoy esté activo): "2026,2027" → [2026, 2027]
export const aniosInactivo = (m) => String(m?.aniosInactivo || '').split(',').filter(Boolean).map(Number);
export const inactivoEnAnio = (m, anio) => aniosInactivo(m).includes(Number(anio));
// Activo hoy: estado activo y el año en curso no está marcado como inactivo
export const activoHoy = (m, hoy) => m.estado === 'activo' && !inactivoEnAnio(m, hoy.slice(0, 4));

export function render(root, ctx) {
  const { data } = ctx;
  const hoy = data.hoy;
  const anioHoy = hoy.slice(0, 4);
  const miembros = [...data.miembros].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const activos = miembros.filter((m) => activoHoy(m, hoy));
  const inactivosAnio = miembros.filter((m) => m.estado === 'activo' && !activoHoy(m, hoy));
  const terceraEdad = activos.filter((m) => m.terceraEdad === 'si');
  const trasladados = miembros.filter((m) => m.estado === 'trasladado');
  const fallecidos = miembros.filter((m) => m.estado === 'fallecido');
  const completas = miembros.filter(fichaCompleta).length;
  const nombreDe = Object.fromEntries(data.miembros.map((x) => [x.id, x.nombre]));
  const mesHoy = +hoy.slice(5, 7);
  const cumple = miembros.filter((m) => m.estado === 'activo' && m.fechaNacimiento && +m.fechaNacimiento.slice(5, 7) === mesHoy)
    .sort((a, b) => a.fechaNacimiento.slice(8).localeCompare(b.fechaNacimiento.slice(8)));
  const q = sinTildes(filtros.q);
  // RUT: también se encuentra escrito sin puntos ni guion (123456785 → 12.345.678-5)
  const qRut = q.replace(/[.\-\s]/g, '');
  const lista = miembros.filter((m) => {
    if (filtros.estado === 'activos' && !activoHoy(m, hoy)) return false;
    if (filtros.estado === 'inactivos' && !(m.estado === 'inactivo' || (m.estado === 'activo' && !activoHoy(m, hoy)))) return false;
    if (filtros.estado === 'tercera' && !(m.estado === 'activo' && m.terceraEdad === 'si')) return false;
    if (filtros.estado === 'trasladados' && m.estado !== 'trasladado') return false;
    if (filtros.estado === 'fallecidos' && m.estado !== 'fallecido') return false;
    if (filtros.estado === 'incompletas' && fichaCompleta(m)) return false;
    if (filtros.estado === 'nohab' && m.habilitadoDiezmo !== 'no') return false;
    return !q || sinTildes(`${m.nombre} ${m.celular} ${m.email} ${m.domicilio} ${m.notas} ${m.rut || ''} ${String(m.rut || '').replace(/\./g, '')}`).includes(q)
      || (qRut.length >= 3 && /^[0-9k]+$/.test(qRut) && String(m.rut || '').toLowerCase().replace(/[^0-9k]/g, '').includes(qRut));
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
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:var(--green)"></i> Activos</span><strong class="kpi-value">${activos.length}</strong><span class="kpi-sub">${miembros.length ? Math.round((activos.length / miembros.length) * 100) : 0}% del total${terceraEdad.length ? ` · ${terceraEdad.length} de tercera edad` : ''}</span></article>
    <article class="kpi"><span class="kpi-label"><i class="dot" style="background:#9aa3b2"></i> Inactivos</span><strong class="kpi-value">${miembros.length - activos.length - trasladados.length - fallecidos.length}</strong><span class="kpi-sub">alejados${inactivosAnio.length ? ` (${inactivosAnio.length} solo en ${anioHoy})` : ''}${trasladados.length ? ` · ${trasladados.length} trasladado${trasladados.length === 1 ? '' : 's'} a otra iglesia` : ''}${fallecidos.length ? ` · ${fallecidos.length} fallecido${fallecidos.length === 1 ? '' : 's'}` : ''}</span></article>
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
      <div class="search">${icon('search', 16)}<input type="search" placeholder="Buscar por nombre, RUT, celular, correo…" value="${esc(filtros.q)}" data-q></div>
      <div class="seg seg-sm">
        ${[['todos', 'Todos'], ['activos', 'Activos'], ['inactivos', 'Inactivos'], ...(terceraEdad.length || filtros.estado === 'tercera' ? [['tercera', 'Tercera edad']] : []), ...(trasladados.length || filtros.estado === 'trasladados' ? [['trasladados', 'Trasladados']] : []), ...(fallecidos.length || filtros.estado === 'fallecidos' ? [['fallecidos', 'Fallecidos']] : []), ['incompletas', 'Ficha incompleta'], ['nohab', 'No habilitados']].map(([k, l]) => `<label><input type="radio" name="fest" value="${k}" ${filtros.estado === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}
      </div>
    </div>
    ${miembros.length ? (lista.length ? `<div class="table-wrap"><table class="table miembros-table">
      <thead><tr><th>Nombre</th><th>Estado</th><th>Nacimiento</th><th>Celular</th><th class="hide-sm">Correo</th><th class="hide-sm">Domicilio</th><th></th></tr></thead>
      <tbody>${lista.map((m) => {
        const e = edad(m.fechaNacimiento, hoy);
        const anios = aniosInactivo(m);
        const otrosAnios = anios.filter((y) => String(y) !== anioHoy || m.estado !== 'activo');
        return `<tr class="${!activoHoy(m, hoy) ? 'inactive' : ''}">
          <td><b>${esc(m.nombre)}</b>${m.estadoCivil ? ` <small class="muted">· ${estadoCivilTexto(m.estadoCivil)}</small>` : ''}${m.rut ? `<br><small class="muted">RUT ${esc(m.rut)}</small>` : ''}${m.conyugeId && nombreDe[m.conyugeId] ? `<br><small class="pareja-tag">💍 Matrimonio con ${esc(nombreDe[m.conyugeId])}</small>` : ''}${m.estado === 'activo' && m.terceraEdad === 'si' ? '<br><span class="tag tag-ambar">Tercera edad</span>' : ''}${m.habilitadoDiezmo === 'no' ? '<br><span class="tag tag-gris">No habilitado para diezmar</span>' : ''}${m.notas ? `<br><small class="muted">${esc(m.notas)}</small>` : ''}</td>
          <td>${m.estado === 'activo' && !activoHoy(m, hoy) ? `<span class="badge st-open">Inactivo en ${anioHoy}</span>` : m.estado === 'activo' ? `<span class="badge st-ok">Activo</span>${m.fechaIngreso ? `<br><small class="muted">desde ${fecha(m.fechaIngreso)}</small>` : ''}` : m.estado === 'fallecido' ? `<span class="badge st-open">Fallecido</span><br><small class="muted">${fecha(m.fechaBaja)}</small>` : m.estado === 'trasladado' ? `<span class="badge st-obs">Trasladado</span><br><small class="muted">${m.trasladoA ? `a ${esc(m.trasladoA)} · ` : ''}${fecha(m.fechaBaja)}</small>` : `<span class="badge st-open">Inactivo</span>${m.fechaBaja ? `<br><small class="muted">desde ${fecha(m.fechaBaja)}</small>` : ''}`}${otrosAnios.length ? `<br><small class="muted" title="Años en que estuvo inactivo">inactivo en ${otrosAnios.join(', ')}</small>` : ''}</td>
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
  // años que se pueden marcar como inactivos: desde 2024 (o el más antiguo ya marcado) hasta el actual
  const anioHoy = +ctx.data.hoy.slice(0, 4);
  const marcados = aniosInactivo(m);
  const desdeAnio = Math.min(2024, ...marcados, m?.fechaIngreso ? +m.fechaIngreso.slice(0, 4) : 9999);
  const listaAnios = [];
  for (let y = anioHoy; y >= desdeAnio; y--) listaAnios.push(y);
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
      <div class="form-row">
        <label class="field"><span>Nombre y apellidos</span><input name="nombre" value="${esc(m?.nombre || '')}" required maxlength="80"></label>
        <label class="field"><span>RUT <small class="muted">(opcional)</small></span><input name="rut" value="${esc(m?.rut || '')}" maxlength="12" placeholder="12.345.678-9" autocomplete="off"><small class="hint" data-rut-aviso></small></label>
      </div>
      <div class="form-row">
        <label class="field"><span>Estado</span><select name="estado"><option value="activo" ${!m || m.estado === 'activo' ? 'selected' : ''}>Activo</option><option value="inactivo" ${m?.estado === 'inactivo' ? 'selected' : ''}>Inactivo (alejado)</option><option value="trasladado" ${m?.estado === 'trasladado' ? 'selected' : ''}>Trasladado a otra iglesia</option><option value="fallecido" ${m?.estado === 'fallecido' ? 'selected' : ''}>Fallecido</option></select></label>
        <label class="field"><span>Miembro desde <small class="muted">(opcional)</small></span><input type="date" name="fechaIngreso" value="${esc(m?.fechaIngreso || '')}" max="${ctx.data.hoy}"><small class="hint">Déjalo vacío si ya era miembro: sus diezmos anteriores siguen contando.</small></label>
        <label class="field" data-baja ${m && m.estado !== 'activo' ? '' : 'hidden'}><span data-baja-lbl>${m?.estado === 'trasladado' ? 'Fecha del traslado' : m?.estado === 'fallecido' ? 'Fecha de fallecimiento' : 'Fecha de baja (desde cuándo no asiste)'}</span><input type="date" name="fechaBaja" value="${esc(m?.fechaBaja || '')}" max="${ctx.data.hoy}"></label>
        <label class="field" data-traslado ${m?.estado === 'trasladado' ? '' : 'hidden'}><span>Iglesia de destino</span><input name="trasladoA" maxlength="100" value="${esc(m?.trasladoA || '')}" placeholder="Ej.: Iglesia Bautista de Temuco"></label>
      </div>
      <label class="check" data-tercera ${!m || m.estado === 'activo' ? '' : 'hidden'}><input type="checkbox" name="terceraEdad" ${m?.terceraEdad === 'si' ? 'checked' : ''}> <span>Activo con condición de <b>tercera edad</b> <small class="muted">(no se le marcan ausencias en la asistencia)</small></span></label>
      <div class="field anios-inactivo">
        <span>Años en que estuvo inactivo <small class="muted">(opcional)</small></span>
        <div class="anios-check">${listaAnios.map((y) => `<label class="check"><input type="checkbox" name="anioIn" value="${y}" ${marcados.includes(y) ? 'checked' : ''}> ${y}</label>`).join('')}</div>
        <small class="hint" data-anios-hint>Ej.: estuvo activo en 2025, dejó de venir en 2026 y volvió en 2027 → marca solo 2026. Ese año no cuenta en sus diezmos ni como activo.</small>
      </div>
      <label class="check" data-traslado-conyuge hidden><input type="checkbox" name="trasladarConyuge" checked> <span>Su cónyuge, <b data-conyuge-nombre></b>, también se traslada (misma fecha e iglesia)</span></label>
      <div class="note" data-traslado-nota ${m?.estado === 'trasladado' ? '' : 'hidden'}>${icon('heart', 15)}<span>Sus diezmos cuentan en la estadística hasta la fecha del traslado; desde ahí deja de contarse. También deja de aparecer en la asistencia, los discipulados y los listados de ministerios.</span></div>
      <div class="form-row">
        <label class="field"><span>Fecha de nacimiento</span><input type="date" name="fechaNacimiento" value="${esc(m?.fechaNacimiento || '')}" max="${ctx.data.hoy}"></label>
        <label class="field"><span>Estado civil</span><select name="estadoCivil"><option value="">— Sin dato —</option>${ESTADOS_CIVILES.map(([k, l]) => `<option value="${k}" ${m?.estadoCivil === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="form-row">
        <label class="field"><span>Celular</span><input name="celular" inputmode="tel" placeholder="+56 9 1234 5678" value="${esc(m?.celular || '')}"></label>
        <label class="field"><span>Correo</span><input type="email" name="email" placeholder="nombre@correo.cl" value="${esc(m?.email || '')}"></label>
      </div>
      <label class="field"><span>Domicilio</span><input name="domicilio" placeholder="Calle, número, comuna" value="${esc(m?.domicilio || '')}"></label>
      <label class="field"><span>💍 Cónyuge (diezman como matrimonio)</span><select name="conyugeId"><option value="">— Sin cónyuge registrado —</option>${[...ctx.data.miembros].filter((x) => x.id !== m?.id).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((x) => `<option value="${x.id}" ${x.id === m?.conyugeId ? 'selected' : ''}>${esc(x.nombre)}${x.conyugeId && x.conyugeId !== m?.id ? ' (ya tiene cónyuge)' : ''}${x.estado !== 'activo' ? ` · ${x.estado}` : ''}</option>`).join('')}</select></label>
      <label class="field"><span>Habilitado para diezmar</span><select name="habilitadoDiezmo"><option value="si" ${m?.habilitadoDiezmo !== 'no' ? 'selected' : ''}>Sí · trabaja o tiene ingresos</option><option value="no" ${m?.habilitadoDiezmo === 'no' ? 'selected' : ''}>No · estudiante o sin ingresos</option></select><small class="hint">Los no habilitados no se cuentan en la estadística de diezmos.</small></label>
      <label class="field" data-hab-desde ${m && m.habilitadoDiezmo !== 'no' && m.habilitadoDesde ? '' : 'hidden'}><span>Habilitado desde</span><input type="date" name="habilitadoDesde" value="${esc(m?.habilitadoDesde || '')}" max="${ctx.data.hoy}"><small class="hint">En los diezmos cuenta desde esta fecha; antes, como no habilitado.</small></label>
      <label class="field"><span>Notas</span><input name="notas" maxlength="300" value="${esc(m?.notas || '')}"></label>
      ${m && esAdmin(ctx.user) ? `<p class="ficha-extra"><button type="button" class="link-btn" data-unir>${icon('users', 14)} Es la misma persona que otro miembro…</button></p>` : ''}
      ${m && ctx.user?.rol !== 'secretaria' ? `<button type="button" class="link-btn danger-link" data-borrar>${icon('trash', 14)} Eliminar miembro</button>` : ''}`,
    submitLabel: m ? 'Guardar ficha' : 'Agregar',
    onOpen(f, { close }) {
      // RUT: se ordena al salir del campo y avisa si el dígito verificador no calza
      f.rut.addEventListener('blur', () => {
        const r = rutNormal(f.rut.value);
        const aviso = f.querySelector('[data-rut-aviso]');
        if (r) f.rut.value = r;
        aviso.textContent = r === null ? 'Revisa el RUT: el dígito verificador no calza' : '';
        aviso.classList.toggle('falta', r === null);
      });
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
        const e = f.estado.value;
        f.querySelector('[data-baja]').hidden = e === 'activo';
        f.querySelector('[data-baja-lbl]').textContent = e === 'trasladado' ? 'Fecha del traslado' : e === 'fallecido' ? 'Fecha de fallecimiento' : 'Fecha de baja (desde cuándo no asiste)';
        f.querySelector('[data-traslado]').hidden = e !== 'trasladado';
        f.querySelector('[data-traslado-nota]').hidden = e !== 'trasladado';
        f.fechaBaja.required = e === 'trasladado' || e === 'fallecido';
        if (e !== 'activo' && !f.fechaBaja.value) f.fechaBaja.value = ctx.data.hoy;
        if (e === 'trasladado') f.trasladoA.focus();
        f.querySelector('[data-tercera]').hidden = e !== 'activo';
        // vuelve a estar activo: se proponen como inactivos los años completos que estuvo alejado
        if (e === 'activo' && m?.estado === 'inactivo' && m.fechaBaja) {
          const desde = +m.fechaBaja.slice(0, 4) + (m.fechaBaja.slice(5) <= '01-31' ? 0 : 1);
          const propuestos = [];
          f.querySelectorAll('[name=anioIn]').forEach((c) => { const y = +c.value; if (y >= desde && y < anioHoy && !c.checked) { c.checked = true; propuestos.push(y); } });
          if (propuestos.length) f.querySelector('[data-anios-hint]').innerHTML = `Se marcaron <b>${propuestos.sort().join(', ')}</b> como años inactivos (estuvo alejado desde ${fecha(m.fechaBaja)}). Revisa y ajusta si hace falta.`;
        }
        syncConyuge();
      });
      // casilla "su cónyuge también se traslada": solo al pasar a trasladado y si el cónyuge no lo está ya
      const syncConyuge = () => {
        const c = ctx.data.miembros.find((x) => x.id === f.conyugeId.value);
        const ver = f.estado.value === 'trasladado' && m?.estado !== 'trasladado' && c && c.estado === 'activo';
        f.querySelector('[data-traslado-conyuge]').hidden = !ver;
        if (ver) f.querySelector('[data-conyuge-nombre]').textContent = c.nombre;
      };
      f.conyugeId.addEventListener('change', syncConyuge);
      syncConyuge();
      f.fechaBaja.required = f.estado.value === 'trasladado' || f.estado.value === 'fallecido';
      // al habilitar para diezmar a alguien que no lo estaba, cuenta desde hoy (se puede cambiar la fecha)
      f.habilitadoDiezmo.addEventListener('change', () => {
        const caja = f.querySelector('[data-hab-desde]');
        const recien = f.habilitadoDiezmo.value === 'si' && m?.habilitadoDiezmo === 'no';
        caja.hidden = f.habilitadoDiezmo.value !== 'si' || (!recien && !f.habilitadoDesde.value);
        if (recien && !f.habilitadoDesde.value) f.habilitadoDesde.value = ctx.data.hoy;
      });
      f.querySelector('[data-unir]')?.addEventListener('click', () => { close(null); unirMiembro(ctx, m); });
      f.querySelector('[data-borrar]')?.addEventListener('click', async () => {
        close(null);
        if (!(await confirmar(`¿Eliminar a <b>${esc(m.nombre)}</b> del registro?<br><span class="muted">Elimina solo si fue un error al ingresarlo: desaparece también de los análisis de meses pasados. Si dejó la iglesia o falleció, márcalo <b>inactivo</b>, <b>trasladado</b> o <b>fallecido</b> con su fecha y su historial se conserva.</span>`, { boton: 'Eliminar', danger: true }))) return;
        try { await call('deleteMiembro', { id: m.id }); toast('Miembro eliminado'); await ctx.refresh(); } catch (e) { toast(e.message, 'err'); }
      });
    },
    async onSubmit(f) {
      const d = formData(f);
      if (m) d.id = m.id;
      delete d.anioIn;
      d.aniosInactivo = [...f.querySelectorAll('[name=anioIn]')].filter((c) => c.checked).map((c) => c.value).join(',');
      d.terceraEdad = d.estado === 'activo' && f.terceraEdad.checked;
      if (d.rut && rutNormal(d.rut) === null) throw new Error('Revisa el RUT: el dígito verificador no calza');
      // solo cuenta si la casilla está a la vista (traslado de alguien con cónyuge activo)
      d.trasladarConyuge = !f.querySelector('[data-traslado-conyuge]').hidden && f.trasladarConyuge.checked;
      const r = await call('saveMiembro', d);
      const enl = r?.enlazados?.length ? ` · enlazado en el listado (${r.enlazados.join(', ')})` : '';
      toast((m ? 'Ficha actualizada' : 'Miembro agregado') + enl + (r?.conyugeTrasladado ? ` · también se trasladó ${r.conyugeTrasladado}` : ''));
      await ctx.refresh();
    }
  });
}

// ---------------- Unir dos fichas de la misma persona ----------------
// Queda la ficha abierta; la otra se elimina y todo lo suyo (diezmos, asistencia, discipulados) pasa a esta
function unirMiembro(ctx, m) {
  const { data } = ctx;
  const tk = (n) => normalNombre(n).split(' ').filter((t) => t.length > 2);
  const mios = tk(m.nombre);
  const parecido = (x) => tk(x.nombre).filter((t) => mios.includes(t)).length;
  const otros = data.miembros.filter((x) => x.id !== m.id).sort((a, b) => parecido(b) - parecido(a) || a.nombre.localeCompare(b.nombre, 'es'));
  const sugeridos = otros.filter((x) => parecido(x) > 0);
  const resto = otros.filter((x) => !parecido(x));
  const op = (x) => `<option value="${x.id}">${esc(x.nombre)}${x.estado !== 'activo' ? ` · ${x.estado}` : ''}${x.rut ? ` · ${esc(x.rut)}` : ''}</option>`;
  const diezmosDe = (id) => (data.diezmos || []).filter((d) => d.miembroId === id || d.conyugeId === id).length;
  return modal({
    title: 'Unir fichas de la misma persona',
    body: `
      <p class="muted">Si <b>${esc(m.nombre)}</b> quedó registrado dos veces (por ejemplo, con el nombre escrito distinto), une las dos fichas en una sola.</p>
      <label class="field"><span>¿Con qué otra ficha es la misma persona?</span><select name="otroId" required><option value="">— Elegir —</option>
        ${sugeridos.length ? `<optgroup label="Nombres parecidos">${sugeridos.map(op).join('')}</optgroup>` : ''}<optgroup label="Todos">${resto.map(op).join('')}</optgroup></select></label>
      <div data-detalle hidden>
        <div class="field"><span>¿Qué nombre queda?</span>
          <label class="check"><input type="radio" name="nombre" value="${esc(m.nombre)}" checked> <span data-n1>${esc(m.nombre)}</span></label>
          <label class="check"><input type="radio" name="nombre" value="" data-r2> <span data-n2></span></label></div>
        <div class="note">${icon('sparkle', 16)}<span data-resumen></span></div>
      </div>`,
    submitLabel: 'Unir fichas',
    onOpen(f) {
      f.otroId.addEventListener('change', () => {
        const o = data.miembros.find((x) => x.id === f.otroId.value);
        f.querySelector('[data-detalle]').hidden = !o;
        if (!o) return;
        f.querySelector('[data-r2]').value = o.nombre;
        f.querySelector('[data-n2]').textContent = o.nombre;
        // propone el nombre más completo
        f.querySelectorAll('[name=nombre]')[o.nombre.length > m.nombre.length ? 1 : 0].checked = true;
        const dz = diezmosDe(o.id);
        f.querySelector('[data-resumen]').innerHTML = `Queda una sola ficha. Los datos que le falten se completan con los de la otra${dz ? `, y sus <b>${dz} diezmo${dz === 1 ? '' : 's'}</b> pasan a la ficha que queda` : ''}. También se juntan su asistencia, sus grupos de discipulado y los listados de ministerios. Lo que ya tiene la ficha de ${esc(m.nombre)} no se cambia.`;
      });
    },
    async onSubmit(f) {
      const o = data.miembros.find((x) => x.id === f.otroId.value);
      if (!o) throw new Error('Elige la otra ficha');
      const nombre = f.querySelector('[name=nombre]:checked').value;
      if (!(await confirmar(`Se unirán <b>${esc(m.nombre)}</b> y <b>${esc(o.nombre)}</b> en una sola ficha con el nombre <b>${esc(nombre)}</b>. No se puede deshacer.`, { boton: 'Unir', danger: true }))) return false;
      const r = await call('unirMiembros', { id: m.id, otroId: o.id, nombre });
      toast(`Fichas unidas: ${r.miembro.nombre}${r.diezmos ? ` · ${r.diezmos} diezmo${r.diezmos === 1 ? '' : 's'} movido${r.diezmos === 1 ? '' : 's'}` : ''}`);
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
  const H = { nombre: col(hist, /^nombre/i) || 1, nac: col(hist, /nacimiento/i), civil: col(hist, /estado civil/i), dom: col(hist, /domicilio/i), ing: col(hist, /ingreso/i), obs: col(hist, /observ/i), estado: col(hist, /membres/i), rut: col(hist, /^r\.?u\.?t/i) };
  const historico = [];
  hist.eachRow((row, i) => {
    if (i === 1) return;
    const nombre = txtCelda(row.getCell(H.nombre).value);
    if (!nombre) return;
    const v = (c) => (c ? row.getCell(c).value : null);
    const obs = txtCelda(v(H.obs));
    const rutCrudo = H.rut ? (typeof v(H.rut) === 'number' ? String(v(H.rut)) : txtCelda(v(H.rut))) : '';
    historico.push({
      rut: rutNormal(rutCrudo) || '', rutMalo: rutCrudo && rutNormal(rutCrudo) === null ? rutCrudo : '',
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
      estadoCivil: h.estadoCivil || '', domicilio: h.domicilio || '', fechaIngreso: h.fechaIngreso || '', notas: h.notas || '', estadoHist: h.estadoHist || '', rut: h.rut || '', rutMalo: h.rutMalo || '',
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
      <p class="muted small">También sirve la planilla <b>Listado de miembros</b> con las hojas “Miembros activos” y “Miembros histórico”: completa las fichas de los activos con su RUT, nacimiento, estado civil, domicilio, fecha de ingreso y observaciones (solo lo que les falte).</p>
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
          id: x.destino === 'nuevo' ? '' : x.destino, nombre: x.nombre, fechaNacimiento: x.fechaNacimiento, estadoCivil: x.estadoCivil, rut: x.rut,
          domicilio: x.domicilio, fechaIngreso: x.fechaIngreso, notas: x.notas, renombrar, activar, inactivo: !!x.inactivo
        }));
        const elegidos = items.filter((x) => x.id).map((x) => x.id);
        const repetido = elegidos.find((id, i) => elegidos.indexOf(id) !== i);
        if (repetido) throw new Error(`${ctx.data.miembros.find((m) => m.id === repetido)?.nombre} quedó elegido para dos personas del listado`);
        if (!items.length) throw new Error('No hay nada que cargar');
        const r = await call('completarMiembros', { items });
        toast(`${r.completados} fichas completadas · ${r.agregados} miembros agregados${r.sinCambios ? ` · ${r.sinCambios} ya tenían todo` : ''}`);
        if (r.rutOmitidos?.length) toast(`RUT no guardado por estar repetido en otra ficha: ${r.rutOmitidos.slice(0, 5).join(', ')}${r.rutOmitidos.length > 5 ? '…' : ''}`, 'err');
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
  const CAMPOS = [['rut', 'RUT'], ['fechaNacimiento', 'nacimiento'], ['estadoCivil', 'estado civil'], ['domicilio', 'domicilio'], ['fechaIngreso', 'miembro desde'], ['notas', 'observación']];
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
      ${filas.some((x) => x.rutMalo) ? `<div class="note warn">${icon('alert', 16)}<span>${filas.filter((x) => x.rutMalo).length} RUT de la planilla tienen el dígito verificador malo y no se cargan: ${filas.filter((x) => x.rutMalo).map((x) => `${esc(x.nombre)} (${esc(x.rutMalo)})`).join(', ')}. Corrígelos después en la ficha.</span></div>` : ''}
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
