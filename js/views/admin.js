import { icon, esc, money, modal, formData, toast, fecha, emptyState } from '../ui.js';
import { call, isDemo } from '../api.js';
import { renderImportar } from './importar.js';

let tab = 'ministerios';
const ICONOS = ['🎵', '🧸', '🔥', '🌎', '🌷', '🤝', '📖', '🙏', '🎤', '🍞', '💒', '👨‍👩‍👧', '🎨', '⚽', '🕊️', '⛪'];
const COLORES = ['#7c5cbf', '#e9883a', '#2f9e8f', '#3a6ea5', '#c2577a', '#7a8b3a', '#23395d', '#c99a3b', '#d4515f', '#4f7cac', '#8a5a44', '#5c6b7a'];

export function render(root, ctx) {
  const { data } = ctx;
  const minName = Object.fromEntries(data.ministerios.map((m) => [m.id, m]));
  root.innerHTML = `
  <section class="page-head"><div><span class="eyebrow">Administración</span><h1>Configuración</h1></div></section>
  <div class="tabs">
    ${[['ministerios', 'Ministerios', 'grid'], ['usuarios', 'Usuarios', 'user'], ['general', 'General', 'settings'], ['importar', 'Importar Excel', 'sheet']].map(([k, l, i]) => `<button class="tab ${tab === k ? 'active' : ''}" data-tab="${k}">${icon(i, 16)} ${l}</button>`).join('')}
  </div>
  <div id="tab-body"></div>`;
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(root, ctx); }));
  const body = root.querySelector('#tab-body');

  if (tab === 'ministerios') {
    const total = data.ministerios.filter((m) => m.activo).reduce((a, m) => a + m.itemMensual, 0);
    body.innerHTML = `
    <article class="card">
      <header class="card-head wrap"><div><h3>Ministerios e ítems mensuales</h3><p class="muted">Total asignado al mes: <b>${money(total)}</b></p></div>
        <button class="btn btn-primary btn-sm" data-new>${icon('plus', 16)} Nuevo ministerio</button></header>
      ${data.ministerios.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Ministerio</th><th>Líder</th><th class="num">Ítem mensual</th><th>Estado</th><th></th></tr></thead>
        <tbody>${data.ministerios.map((m) => {
          const lid = data.usuarios.filter((u) => u.ministerioId === m.id && u.rol === 'lider');
          return `<tr class="${m.activo ? '' : 'inactive'}">
            <td><span class="min-dot" style="background:${m.color}">${esc(m.icono)}</span> <b>${esc(m.nombre)}</b></td>
            <td>${lid.length ? lid.map((u) => esc(u.nombre)).join(', ') : '<span class="muted">—</span>'}</td>
            <td class="num strong">${money(m.itemMensual)}</td>
            <td>${m.activo ? '<span class="badge st-ok">Activo</span>' : '<span class="badge st-open">Inactivo</span>'}</td>
            <td class="row-actions"><button class="icon-btn sm" data-edit="${m.id}">${icon('edit', 16)}</button></td></tr>`;
        }).join('')}</tbody></table></div>` : emptyState('Crea el primer ministerio', 'grid')}
    </article>`;
    body.querySelector('[data-new]').addEventListener('click', () => editMinisterio(ctx));
    body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editMinisterio(ctx, data.ministerios.find((m) => m.id === b.dataset.edit))));
  }

  if (tab === 'usuarios') {
    body.innerHTML = `
    <article class="card">
      <header class="card-head wrap"><div><h3>Usuarios</h3><p class="muted">Los líderes solo ven su propio ministerio. El tesorero ve todo.</p></div>
        <button class="btn btn-primary btn-sm" data-new>${icon('plus', 16)} Nuevo usuario</button></header>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Ministerio</th><th>Estado</th><th></th></tr></thead>
        <tbody>${data.usuarios.map((u) => `
          <tr class="${u.activo ? '' : 'inactive'}">
            <td><b>${esc(u.nombre)}</b>${u.email ? `<br><small class="muted">${esc(u.email)}</small>` : ''}</td>
            <td><code>${esc(u.usuario)}</code></td>
            <td>${u.rol === 'tesorero' ? '<span class="badge st-sent">Tesorero</span>' : '<span class="badge st-open">Líder</span>'}</td>
            <td>${minName[u.ministerioId] ? `${esc(minName[u.ministerioId].icono)} ${esc(minName[u.ministerioId].nombre)}` : '<span class="muted">—</span>'}</td>
            <td>${u.activo ? (u.debeCambiarPass ? '<span class="badge st-obs">Clave temporal</span>' : '<span class="badge st-ok">Activo</span>') : '<span class="badge st-open">Inactivo</span>'}</td>
            <td class="row-actions"><button class="icon-btn sm" data-edit="${u.id}">${icon('edit', 16)}</button></td>
          </tr>`).join('')}</tbody></table></div>
    </article>`;
    body.querySelector('[data-new]').addEventListener('click', () => editUsuario(ctx));
    body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editUsuario(ctx, data.usuarios.find((u) => u.id === b.dataset.edit))));
  }

  if (tab === 'importar') renderImportar(body, ctx);

  if (tab === 'general') {
    const c = data.config;
    body.innerHTML = `
    <div class="grid-1-1">
      <article class="card">
        <header class="card-head"><div><h3>Saldo inicial de caja</h3><p class="muted">Dinero que tenía la iglesia al comenzar a usar el sistema</p></div></header>
        <form class="form-stack" data-config>
          <label class="field"><span>Saldo inicial ($)</span><input name="saldoInicial" inputmode="numeric" value="${(c.saldoInicial || 0).toLocaleString('es-CL')}"></label>
          <label class="field"><span>Desde la fecha</span><input type="date" name="fechaSaldoInicial" value="${esc(c.fechaSaldoInicial || '')}"></label>
          <p class="muted small">Los movimientos anteriores a esta fecha no se suman al saldo.</p>
          <button class="btn btn-primary" type="submit">Guardar</button>
        </form>
      </article>
      <article class="card">
        <header class="card-head"><div><h3>Base de datos</h3></div></header>
        ${isDemo ? `<div class="note">${icon('sparkle', 16)} Estás en <b>modo demo</b>: los datos viven solo en este navegador. Para usar la app en serio, configura Google Sheets siguiendo el README del repositorio.</div>` : `
        <p>Todos los datos se guardan automáticamente en una planilla de Google (compatible con Excel) y las boletas en una carpeta privada de Google Drive.</p>
        ${data.extra?.sheetUrl ? `<a class="btn btn-ghost" href="${esc(data.extra.sheetUrl)}" target="_blank" rel="noopener">${icon('sheet', 16)} Abrir planilla</a>` : ''}`}
        <p class="muted small" style="margin-top:14px">También puedes descargar una copia .xlsx en cualquier momento con el botón “Descargar Excel” del menú.</p>
      </article>
    </div>`;
    body.querySelector('[data-config]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      d.saldoInicial = Number(String(d.saldoInicial).replace(/\D/g, '')) || 0;
      try { await call('saveConfig', d); toast('Configuración guardada'); await ctx.refresh(); } catch (er) { toast(er.message, 'err'); }
    });
  }
}

function editMinisterio(ctx, m = null) {
  const color = m?.color || COLORES[ctx.data.ministerios.length % COLORES.length];
  const ico = m?.icono || ICONOS[ctx.data.ministerios.length % ICONOS.length];
  return modal({
    title: m ? `Editar ${esc(m.nombre)}` : 'Nuevo ministerio',
    body: `
      <label class="field"><span>Nombre</span><input name="nombre" value="${esc(m?.nombre || '')}" required maxlength="40"></label>
      <label class="field"><span>Ítem mensual ($)</span><input name="itemMensual" inputmode="numeric" value="${m ? m.itemMensual.toLocaleString('es-CL') : ''}" placeholder="0"></label>
      <div class="field"><span>Ícono</span><div class="picker">${ICONOS.map((i) => `<label><input type="radio" name="icono" value="${i}" ${i === ico ? 'checked' : ''}><span>${i}</span></label>`).join('')}</div></div>
      <div class="field"><span>Color</span><div class="picker colors">${COLORES.map((c) => `<label><input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}</div></div>
      ${m ? `<label class="check"><input type="checkbox" name="activo" ${m.activo ? 'checked' : ''}> Ministerio activo</label>` : ''}`,
    onOpen(f) { f.itemMensual.addEventListener('input', () => { const d = f.itemMensual.value.replace(/\D/g, ''); f.itemMensual.value = d ? Number(d).toLocaleString('es-CL') : ''; }); },
    async onSubmit(f) {
      const d = formData(f);
      d.itemMensual = Number(String(d.itemMensual).replace(/\D/g, '')) || 0;
      if (m) { d.id = m.id; d.activo = f.activo.checked; }
      await call('saveMinisterio', d);
      toast('Ministerio guardado');
      await ctx.refresh();
    }
  });
}

function editUsuario(ctx, u = null) {
  const mins = ctx.data.ministerios;
  return modal({
    title: u ? `Editar ${esc(u.nombre)}` : 'Nuevo usuario',
    body: `
      <label class="field"><span>Nombre completo</span><input name="nombre" value="${esc(u?.nombre || '')}" required></label>
      <div class="form-row">
        <label class="field"><span>Usuario (para ingresar)</span><input name="usuario" value="${esc(u?.usuario || '')}" autocapitalize="none" required placeholder="ej: alabanza"></label>
        <label class="field"><span>Rol</span><select name="rol"><option value="lider" ${u?.rol !== 'tesorero' ? 'selected' : ''}>Líder de ministerio</option><option value="tesorero" ${u?.rol === 'tesorero' ? 'selected' : ''}>Tesorero</option></select></label>
      </div>
      <label class="field" data-min><span>Ministerio</span><select name="ministerioId"><option value="">— Selecciona —</option>${mins.map((m) => `<option value="${m.id}" ${u?.ministerioId === m.id ? 'selected' : ''}>${esc(m.icono)} ${esc(m.nombre)}</option>`).join('')}</select></label>
      <label class="field"><span>Correo (opcional)</span><input type="email" name="email" value="${esc(u?.email || '')}"></label>
      <label class="field"><span>${u ? 'Nueva contraseña temporal (dejar vacío para no cambiar)' : 'Contraseña temporal'}</span><input name="password" type="text" autocomplete="off" ${u ? '' : 'required'} minlength="6" placeholder="mín. 6 caracteres"></label>
      <p class="muted small">Al primer ingreso se le pedirá crear su propia contraseña.</p>
      ${u ? `<label class="check"><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''}> Usuario activo</label>` : ''}`,
    onOpen(f) {
      const sync = () => { f.querySelector('[data-min]').hidden = f.rol.value === 'tesorero'; };
      f.rol.addEventListener('change', sync); sync();
    },
    async onSubmit(f) {
      const d = formData(f);
      if (u) { d.id = u.id; d.activo = f.activo.checked; }
      await call('saveUsuario', d);
      toast(d.password ? `Usuario guardado. Comparte la contraseña temporal con ${d.nombre.split(' ')[0]}.` : 'Usuario guardado');
      await ctx.refresh();
    }
  });
}
