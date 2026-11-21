import { icon, esc, money, modal, formData, toast, fecha, emptyState, pesos, formatoPesos, confirmar } from '../ui.js';
import { call, isDemo } from '../api.js';
import { renderImportar } from './importar.js';
import { exportarExcel } from '../export.js';
import { gastoGeneralPromedio, totalItems, presupuestoGeneralMensual } from '../calc.js';
import { mesLargo, prevMonth } from '../ui.js';

let tab = 'presupuesto';
const ICONOS = ['🎵', '🧸', '🔥', '🌎', '🌷', '🤝', '📖', '🙏', '🎤', '🍞', '💒', '👨‍👩‍👧', '🎨', '⚽', '🕊️', '⛪'];
const COLORES = ['#7c5cbf', '#e9883a', '#2f9e8f', '#3a6ea5', '#c2577a', '#7a8b3a', '#23395d', '#c99a3b', '#d4515f', '#4f7cac', '#8a5a44', '#5c6b7a'];

export function render(root, ctx) {
  const { data } = ctx;
  try { const t = sessionStorage.getItem('teso_admin_tab'); if (t) { tab = t; sessionStorage.removeItem('teso_admin_tab'); } } catch { /* */ }
  const minName = Object.fromEntries(data.ministerios.map((m) => [m.id, m]));
  root.innerHTML = `
  <section class="page-head"><div><span class="eyebrow">Administración</span><h1>Configuración</h1></div></section>
  <div class="tabs">
    ${[['presupuesto', 'Presupuesto', 'wallet'], ['ministerios', 'Ministerios', 'grid'], ['usuarios', 'Usuarios', 'user'], ['general', 'General', 'settings'], ['importar', 'Importar historial', 'sheet']].map(([k, l, i]) => `<button class="tab ${tab === k ? 'active' : ''}" data-tab="${k}">${icon(i, 16)} ${l}</button>`).join('')}
  </div>
  <div id="tab-body"></div>`;
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(root, ctx); }));
  const body = root.querySelector('#tab-body');

  if (tab === 'ministerios') {
    const total = data.ministerios.filter((m) => m.activo).reduce((a, m) => a + m.itemMensual, 0);
    body.innerHTML = `
    <article class="card">
      <header class="card-head wrap"><div><h3>Ministerios</h3><p class="muted">Total de ítems al mes: <b>${money(total)}</b></p></div>
        <button class="btn btn-primary btn-sm" data-new>${icon('plus', 16)} Nuevo ministerio</button></header>
      ${data.ministerios.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Ministerio</th><th>Líder</th><th class="num">Ítem mensual</th><th class="num">Presupuesto</th><th>Estado</th><th></th></tr></thead>
        <tbody>${data.ministerios.map((m) => {
          const lid = data.usuarios.filter((u) => u.ministerioId === m.id && u.rol === 'lider');
          return `<tr class="${m.activo ? '' : 'inactive'}">
            <td><span class="min-dot" style="background:${m.color}">${esc(m.icono)}</span> <b>${esc(m.nombre)}</b>${m.actividades === 'si' ? ' <span class="tag tag-verde">Integrantes y actividades</span>' : ''}</td>
            <td>${lid.length ? lid.map((u) => esc(u.nombre)).join(', ') : '<span class="muted">—</span>'}</td>
            <td class="num strong">${money(m.itemMensual)}</td>
            <td class="num">${m.presupuestoMensual ? money(m.presupuestoMensual) : '<span class="muted">sin límite</span>'}</td>
            <td>${m.activo ? '<span class="badge st-ok">Activo</span>' : '<span class="badge st-open">Inactivo</span>'}</td>
            <td class="row-actions"><button class="icon-btn sm" data-edit="${m.id}">${icon('edit', 16)}</button></td></tr>`;
        }).join('')}</tbody></table></div>` : emptyState('Crea el primer ministerio', 'grid')}
    </article>`;
    body.querySelector('[data-new]').addEventListener('click', () => editMinisterio(ctx));
    body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editMinisterio(ctx, data.ministerios.find((m) => m.id === b.dataset.edit))));
  }

  if (tab === 'usuarios') {
    // Solo el administrador gestiona usuarios (si aún no hay ninguno, tesorero y pastor crean el primero)
    const hayAdmin = data.usuarios.some((u) => u.rol === 'admin' && u.activo);
    const puede = ctx.user.rol === 'admin' || !hayAdmin;
    body.innerHTML = `
    <article class="card">
      <header class="card-head wrap"><div><h3>Usuarios</h3><p class="muted">Administrador, tesorero y pastor ven todo. Los líderes solo su ministerio. Secretaría, el registro de miembros y la asistencia.</p></div>
        ${puede ? `<button class="btn btn-primary btn-sm" data-new>${icon('plus', 16)} Nuevo usuario</button>` : ''}</header>
      ${!puede ? `<div class="note">${icon('lock', 16)}<span>Solo el <b>administrador</b> puede agregar, modificar o desactivar usuarios.</span></div>`
        : !hayAdmin ? `<div class="note">${icon('alert', 16)}<span>Aún no hay un <b>administrador</b>. Crea uno (o cambia tu usuario a Administrador): desde entonces, solo el administrador podrá agregar, modificar o desactivar usuarios.</span></div>` : ''}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Ministerio</th><th>Estado</th><th></th></tr></thead>
        <tbody>${data.usuarios.map((u) => `
          <tr class="${u.activo ? '' : 'inactive'}">
            <td><b>${esc(u.nombre)}</b>${u.email ? `<br><small class="muted">${esc(u.email)}</small>` : ''}</td>
            <td><code>${esc(u.usuario)}</code></td>
            <td>${{ admin: '<span class="badge st-sent">Administrador</span>', tesorero: '<span class="badge st-sent">Tesorero</span>', pastor: '<span class="badge st-sent">Pastor</span>', secretaria: '<span class="badge st-obs">Secretaría</span>', discipulado: '<span class="badge st-open">Líder de discipulado</span>' }[u.rol] || '<span class="badge st-open">Líder</span>'}</td>
            <td>${minName[u.ministerioId] ? `${esc(minName[u.ministerioId].icono)} ${esc(minName[u.ministerioId].nombre)}` : u.rol === 'discipulado' && (data.gruposHogar || []).find((g) => g.id === u.grupoId) ? `${icon('users', 13)} ${esc(data.gruposHogar.find((g) => g.id === u.grupoId).nombre)}` : '<span class="muted">—</span>'}</td>
            <td>${u.activo ? (u.debeCambiarPass ? '<span class="badge st-obs">Clave temporal</span>' : '<span class="badge st-ok">Activo</span>') : '<span class="badge st-open">Inactivo</span>'}</td>
            <td class="row-actions">${puede ? `<button class="icon-btn sm" data-edit="${u.id}" title="Editar">${icon('edit', 16)}</button>${u.id !== ctx.user?.id ? `<button class="icon-btn sm danger" data-del="${u.id}" title="Eliminar usuario">${icon('trash', 16)}</button>` : ''}` : ''}</td>
          </tr>`).join('')}</tbody></table></div>
    </article>`;
    body.querySelector('[data-new]')?.addEventListener('click', () => editUsuario(ctx));
    body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editUsuario(ctx, data.usuarios.find((u) => u.id === b.dataset.edit))));
    body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => borrarUsuario(ctx, data.usuarios.find((u) => u.id === b.dataset.del))));
  }

  if (tab === 'importar') renderImportar(body, ctx);

  if (tab === 'presupuesto') {
    const hoyMes = data.hoy.slice(0, 7);
    const ult = [prevMonth(hoyMes), prevMonth(prevMonth(hoyMes)), prevMonth(prevMonth(prevMonth(hoyMes)))];
    const prom = gastoGeneralPromedio(data, ult);
    const general = presupuestoGeneralMensual(data, hoyMes);
    const hist = (data.config.presupuestosGenerales || []).slice().reverse();
    const mesTxt = (m) => (m <= '2000-01' ? 'Desde el inicio' : `Desde ${mesLargo(m)}`);
    const activos = data.ministerios.filter((m) => m.activo);
    body.innerHTML = `
    <form data-pres-form class="stack">
      <article class="card">
        <header class="card-head"><div><h3>Presupuesto mensual de la tesorería general</h3><p class="muted">Monto máximo para <b>todos</b> los gastos de cada mes (sueldos, servicios, aportes, ítems de ministerios, etc.). Déjalo en 0 para no limitar. Al cambiarlo, elige <b>desde qué mes</b> rige: los meses anteriores conservan el presupuesto que tenían.</p></div></header>
        <div class="pres-general">
          <div class="pres-campos">
            <label class="field"><span>Presupuesto mensual ($)</span><input name="presupuestoGeneral" inputmode="numeric" class="input-money" value="${general ? general.toLocaleString('es-CL') : ''}" placeholder="Sin límite"></label>
            <label class="field"><span>Rige desde</span><input type="month" name="presupuestoDesde" value="${hoyMes}" required></label>
          </div>
          <div class="pres-ref">
            <span>Gasto promedio de los últimos 3 meses</span>
            <strong>${money(prom)}</strong>
            ${prom ? `<button type="button" class="link-btn" data-usar="${prom}">Usar este monto</button>` : ''}
          </div>
        </div>
        <p class="muted small" data-pres-efecto></p>
        ${hist.length ? `<div class="pres-hist"><h4>Historial del presupuesto</h4><ul>${hist.map((h, i) => `<li class="${h.desde <= hoyMes && (i === 0 || hist[i - 1].desde > hoyMes) ? 'vigente' : ''}">
          <span>${esc(mesTxt(h.desde))}${h.desde > hoyMes ? ' <span class="tag">programado</span>' : h.desde <= hoyMes && (i === 0 || hist[i - 1].desde > hoyMes) ? ' <span class="tag tag-verde">vigente</span>' : ''}</span>
          <b>${h.monto ? money(h.monto) : 'Sin límite'}</b>
          ${h.desde > hoyMes ? `<button type="button" class="icon-btn sm" data-quitar="${h.desde}" title="Quitar este cambio">${icon('trash', 15)}</button>` : '<span></span>'}</li>`).join('')}</ul></div>` : ''}
      </article>
      <article class="card">
        <header class="card-head"><div><h3>Ministerios: ítem y presupuesto</h3><p class="muted"><b>Ítem mensual:</b> lo que tesorería transfiere cada mes (la transferencia no puede superarlo). <b>Presupuesto mensual:</b> el máximo que el ministerio puede gastar en el mes; déjalo en 0 para no limitar.</p></div></header>
        ${activos.length ? `<div class="table-wrap"><table class="table pres-table">
          <thead><tr><th>Ministerio</th><th class="num">Ítem mensual</th><th class="num">Presupuesto mensual</th></tr></thead>
          <tbody>${activos.map((m) => `<tr><td><span class="min-dot" style="background:${m.color}">${esc(m.icono)}</span> <b>${esc(m.nombre)}</b></td>
            <td class="num"><input class="pres-input" data-item="${m.id}" inputmode="numeric" value="${m.itemMensual ? m.itemMensual.toLocaleString('es-CL') : ''}" placeholder="0"></td>
            <td class="num"><input class="pres-input" data-pres="${m.id}" inputmode="numeric" value="${m.presupuestoMensual ? m.presupuestoMensual.toLocaleString('es-CL') : ''}" placeholder="Sin límite"></td></tr>`).join('')}</tbody>
          <tfoot><tr><td><b>Totales</b></td><td class="num"><b data-total-items></b></td><td class="num"><b data-total-pres></b></td></tr></tfoot>
        </table></div>
        <div class="note warn" data-aviso hidden>${icon('alert', 16)}<span>Los ítems suman más que el presupuesto general: no alcanzaría para transferirlos todos.</span></div>` : emptyState('Aún no hay ministerios activos.', 'grid')}
      </article>
      <div class="imp-actions"><p class="muted small">Solo el administrador, el tesorero y el pastor pueden modificar estos montos.</p><button class="btn btn-primary" type="submit">Guardar presupuesto</button></div>
    </form>`;
    const form = body.querySelector('[data-pres-form]');
    const gen = form.presupuestoGeneral;
    const desdeIn = form.presupuestoDesde;
    const vigenteEn = (m) => presupuestoGeneralMensual(data, m);
    const efecto = () => {
      const p = form.querySelector('[data-pres-efecto]');
      const d = desdeIn.value;
      if (!d || pesos(gen.value) === vigenteEn(d)) { p.textContent = ''; return; }
      const futuros = (data.config.presupuestosGenerales || []).filter((h) => h.desde > d).length;
      p.innerHTML = `Desde <b>${esc(mesLargo(d))}</b> en adelante el presupuesto será <b>${pesos(gen.value) ? money(pesos(gen.value)) : 'sin límite'}</b>; hasta ${esc(mesLargo(prevMonth(d)))} queda como estaba.${futuros ? ` Reemplaza ${futuros === 1 ? 'el cambio programado' : `los ${futuros} cambios programados`} después de esa fecha.` : ''}`;
    };
    gen.addEventListener('input', efecto); desdeIn.addEventListener('change', efecto);
    form.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmar(`¿Quitar el cambio de presupuesto ${esc(mesTxt(b.dataset.quitar).toLowerCase())}? Esos meses volverán a usar el presupuesto anterior.`, { boton: 'Quitar' }))) return;
      try { await call('saveConfig', { quitarPresupuestoDesde: b.dataset.quitar }); toast('Cambio quitado'); await ctx.refresh(); } catch (er) { toast(er.message, 'err'); }
    }));
    const items = [...form.querySelectorAll('[data-item]')];
    const presMin = [...form.querySelectorAll('[data-pres]')];
    const recalcular = () => {
      const t = items.reduce((a, i) => a + pesos(i.value), 0);
      const tot = form.querySelector('[data-total-items]'); if (tot) tot.textContent = money(t);
      const tp = form.querySelector('[data-total-pres]'); if (tp) tp.textContent = money(presMin.reduce((a, i) => a + pesos(i.value), 0));
      const av = form.querySelector('[data-aviso]'); if (av) av.hidden = !(pesos(gen.value) && t > pesos(gen.value));
    };
    [gen, ...items, ...presMin].forEach((i) => { formatoPesos(i); i.addEventListener('input', recalcular); });
    form.querySelector('[data-usar]')?.addEventListener('click', (e) => { gen.value = Number(e.currentTarget.dataset.usar).toLocaleString('es-CL'); recalcular(); });
    recalcular();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.classList.add('loading');
      try {
        if (pesos(gen.value) !== vigenteEn(desdeIn.value)) await call('saveConfig', { presupuestoGeneral: pesos(gen.value), presupuestoDesde: desdeIn.value });
        for (const m of activos) {
          const item = pesos(items.find((i) => i.dataset.item === m.id)?.value);
          const pres = pesos(presMin.find((i) => i.dataset.pres === m.id)?.value);
          if (item !== m.itemMensual || pres !== (m.presupuestoMensual || 0)) {
            await call('saveMinisterio', { id: m.id, nombre: m.nombre, color: m.color, icono: m.icono, itemMensual: item, presupuestoMensual: pres, activo: m.activo });
          }
        }
        toast('Presupuesto guardado');
        await ctx.refresh();
      } catch (er) { toast(er.message, 'err'); btn.disabled = false; btn.classList.remove('loading'); }
    });
  }

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
        <p class="muted small" style="margin-top:14px">La planilla con resumen, flujo de caja y movimientos se descarga con el botón “Descargar planilla” del menú (tesorería general) o dentro de cada ministerio.</p>
        <button class="btn btn-ghost btn-sm" data-respaldo style="margin-top:10px">${icon('download', 15)} Respaldo completo de datos (.xlsx)</button>
      </article>
    </div>`;
    formatoPesos(body.querySelector('[name=saldoInicial]'));
    body.querySelector('[data-respaldo]')?.addEventListener('click', () => exportarExcel(data).catch((er) => toast(er.message, 'err')));
    body.querySelector('[data-config]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      d.saldoInicial = pesos(d.saldoInicial);
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
      <div class="form-row">
        <label class="field"><span>Ítem mensual ($)</span><input name="itemMensual" inputmode="numeric" value="${m ? m.itemMensual.toLocaleString('es-CL') : ''}" placeholder="0"></label>
        <label class="field"><span>Presupuesto mensual ($)</span><input name="presupuestoMensual" inputmode="numeric" value="${m && m.presupuestoMensual ? m.presupuestoMensual.toLocaleString('es-CL') : ''}" placeholder="Sin límite"></label>
      </div>
      <p class="muted small">El ítem es lo que se transfiere cada mes; el presupuesto es el máximo que el ministerio puede gastar en el mes.</p>
      <div class="field"><span>Ícono</span><div class="picker">${ICONOS.map((i) => `<label><input type="radio" name="icono" value="${i}" ${i === ico ? 'checked' : ''}><span>${i}</span></label>`).join('')}</div></div>
      <div class="field"><span>Color</span><div class="picker colors">${COLORES.map((c) => `<label><input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}</div></div>
      <label class="check"><input type="checkbox" name="actividades" ${m?.actividades === 'si' ? 'checked' : ''}> Listado de integrantes y actividades con cuota <small class="muted">(p. ej. jóvenes)</small></label>
      <label class="check" data-por-matrimonio ${m?.actividades === 'si' ? '' : 'hidden'} style="margin-left:26px"><input type="checkbox" name="porMatrimonio" ${m?.porMatrimonio === 'si' ? 'checked' : ''}> Los integrantes son <b>matrimonios</b> <small class="muted">(p. ej. Familia: se cuentan por matrimonio en el listado, la asistencia y las actividades)</small></label>
      ${m ? `<label class="check"><input type="checkbox" name="activo" ${m.activo ? 'checked' : ''}> Ministerio activo</label>` : ''}`,
    onOpen(f) {
      formatoPesos(f.itemMensual); formatoPesos(f.presupuestoMensual);
      f.actividades.addEventListener('change', () => { f.querySelector('[data-por-matrimonio]').hidden = !f.actividades.checked; });
    },
    async onSubmit(f) {
      const d = formData(f);
      d.itemMensual = pesos(d.itemMensual);
      d.presupuestoMensual = pesos(d.presupuestoMensual);
      if (m) { d.id = m.id; d.activo = f.activo.checked; }
      d.actividades = f.actividades.checked ? 'si' : 'no';
      d.porMatrimonio = f.actividades.checked && f.porMatrimonio.checked ? 'si' : 'no';
      await call('saveMinisterio', d);
      toast('Ministerio guardado');
      await ctx.refresh();
    }
  });
}

async function borrarUsuario(ctx, u) {
  if (!u) return;
  if (!(await confirmar(`¿Eliminar el usuario <b>${esc(u.nombre)}</b> (${esc(u.usuario)})?<br><span class="muted">Ya no podrá ingresar. Si registró movimientos u otros datos con su usuario no se puede eliminar: en ese caso edítalo y desmarca “Usuario activo”.</span>`, { boton: 'Eliminar', danger: true }))) return;
  try { await call('deleteUsuario', { id: u.id }); toast('Usuario eliminado'); await ctx.refresh(); } catch (e) { toast(e.message, 'err'); }
}

function editUsuario(ctx, u = null) {
  const mins = ctx.data.ministerios;
  return modal({
    title: u ? `Editar ${esc(u.nombre)}` : 'Nuevo usuario',
    body: `
      <label class="field"><span>Nombre completo</span><input name="nombre" value="${esc(u?.nombre || '')}" required></label>
      <div class="form-row">
        <label class="field"><span>Usuario (para ingresar)</span><input name="usuario" value="${esc(u?.usuario || '')}" autocapitalize="none" required placeholder="ej: alabanza"></label>
        <label class="field"><span>Rol</span><select name="rol">${[['lider', 'Líder de ministerio'], ['tesorero', 'Tesorero'], ['pastor', 'Pastor'], ['admin', 'Administrador (todo)'], ['secretaria', 'Secretaría (miembros y asistencia)'], ['discipulado', 'Líder de discipulado (asistencia de su grupo)']].map(([v, l]) => `<option value="${v}" ${(u?.rol || 'lider') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <p class="muted small" data-rol-ayuda style="margin-top:-6px"></p>
      <label class="field" data-min><span>Ministerio</span><select name="ministerioId"><option value="">— Selecciona —</option>${mins.map((m) => `<option value="${m.id}" ${u?.ministerioId === m.id ? 'selected' : ''}>${esc(m.icono)} ${esc(m.nombre)}</option>`).join('')}</select></label>
      <label class="field" data-grupo><span>Grupo de discipulado</span><select name="grupoId"><option value="">— Selecciona —</option>${(ctx.data.gruposHogar || []).filter((g) => g.activo || g.id === u?.grupoId).map((g) => `<option value="${g.id}" ${u?.grupoId === g.id ? 'selected' : ''}>${esc(g.nombre)}${g.sector ? ` · ${esc(g.sector)}` : ''}</option>`).join('')}</select>${(ctx.data.gruposHogar || []).length ? '' : '<small class="hint">Aún no hay grupos: créalos en Asistencia → Discipulados.</small>'}</label>
      <label class="field"><span>Correo (opcional)</span><input type="email" name="email" value="${esc(u?.email || '')}"></label>
      <label class="field"><span>${u ? 'Nueva contraseña temporal (dejar vacío para no cambiar)' : 'Contraseña temporal'}</span><input name="password" type="text" autocomplete="off" ${u ? '' : 'required'} minlength="8" placeholder="mín. 8 caracteres"></label>
      <p class="muted small">Al primer ingreso se le pedirá crear su propia contraseña.</p>
      ${u ? `<label class="check"><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''}> Usuario activo</label>` : ''}
      ${u && u.id !== ctx.user?.id ? `<button type="button" class="link-btn danger-link" data-borrar>${icon('trash', 14)} Eliminar usuario</button>` : ''}`,
    onOpen(f, { close }) {
      f.querySelector('[data-borrar]')?.addEventListener('click', () => { close(null); borrarUsuario(ctx, u); });
      const sync = () => {
        f.querySelector('[data-min]').hidden = f.rol.value !== 'lider';
        f.querySelector('[data-grupo]').hidden = f.rol.value !== 'discipulado';
        const ayuda = f.querySelector('[data-rol-ayuda]');
        if (ayuda) ayuda.textContent = { lider: 'Solo ve y registra los movimientos de su ministerio.', tesorero: 'Acceso completo: tesorería, ministerios, diezmos, miembros y configuración.', pastor: 'Acceso completo, igual que el tesorero.', admin: 'Permiso para todo, y es el único que puede agregar, modificar o desactivar usuarios.', secretaria: 'Accede a Miembros (agregar y editar sus datos) y a Asistencia. No ve dinero ni diezmos.', discipulado: 'Solo ve la asistencia de su grupo de discipulado: la toma, la corrige y agrega visitas o no miembros. No ve Miembros, dinero ni otros grupos.' }[f.rol.value];
      };
      f.rol.addEventListener('change', sync); sync();
    },
    async onSubmit(f) {
      const d = formData(f);
      if (u) { d.id = u.id; d.activo = f.activo.checked; }
      if (d.rol === 'discipulado' && !d.grupoId) throw new Error('Elige el grupo de discipulado de este líder');
      await call('saveUsuario', d);
      toast(d.password ? `Usuario guardado. Comparte la contraseña temporal con ${d.nombre.split(' ')[0]}.` : 'Usuario guardado');
      await ctx.refresh();
    }
  });
}
