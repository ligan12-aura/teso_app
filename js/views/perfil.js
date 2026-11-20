import { icon, esc, formData, toast, ROL_LABEL } from '../ui.js';
import { call, auth } from '../api.js';

export function render(root, ctx) {
  const u = ctx.user;
  const min = ctx.data.ministerios.find((m) => m.id === u.ministerioId);
  root.innerHTML = `
  <section class="page-head"><div><span class="eyebrow">Cuenta</span><h1>Mi cuenta</h1></div></section>
  <div class="grid-1-1">
    <article class="card profile">
      <div class="avatar xl">${esc(u.nombre.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase())}</div>
      <h3>${esc(u.nombre)}</h3>
      <p class="muted">@${esc(u.usuario)} · ${ROL_LABEL[u.rol] || ''}</p>
      ${min ? `<span class="badge" style="background:${min.color}22;color:${min.color}">${esc(min.icono)} ${esc(min.nombre)}</span>` : ''}
      <div class="note" style="margin-top:18px;text-align:left">${icon('lock', 16)} ${{ admin: 'Eres administrador: tienes permiso para todo, incluidos usuarios, configuración, diezmos, miembros y las actividades de los ministerios.', tesorero: 'Tienes acceso completo a la tesorería y a todos los ministerios.', pastor: 'Tienes acceso completo a la tesorería, los ministerios, los diezmos y los miembros.', secretaria: 'Puedes agregar y editar los datos de los miembros de la iglesia y llevar la asistencia. La información financiera es visible solo para tesorería.' }[u.rol] || 'Solo puedes ver y registrar movimientos de tu ministerio. La información general de la iglesia es visible solo para tesorería.'}</div>
    </article>
    <article class="card">
      <header class="card-head"><div><h3>Cambiar contraseña</h3></div></header>
      <form class="form-stack" data-pass>
        <label class="field"><span>Contraseña actual</span><input type="password" name="actual" required autocomplete="current-password"></label>
        <label class="field"><span>Nueva contraseña</span><input type="password" name="nueva" minlength="8" required autocomplete="new-password"></label>
        <label class="field"><span>Repetir nueva contraseña</span><input type="password" name="repite" required autocomplete="new-password"></label>
        <button class="btn btn-primary" type="submit">Actualizar contraseña</button>
      </form>
    </article>
    <article class="card">
      <header class="card-head"><div><h3>Sesiones abiertas</h3></div></header>
      <p class="muted">Si ingresaste en un teléfono o computador que no es tuyo, o perdiste un dispositivo, cierra la sesión en todos. Tendrás que volver a ingresar aquí también.</p>
      <button class="btn btn-light" type="button" data-cerrar-todo>${icon('lock', 16)} Cerrar sesión en todos los dispositivos</button>
    </article>
  </div>`;
  root.querySelector('[data-pass]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    if (d.nueva !== d.repite) return toast('Las contraseñas no coinciden', 'err');
    try {
      const r = await call('cambiarPassword', d);
      auth.token = r.token;
      e.target.reset();
      toast('Contraseña actualizada');
    } catch (er) { toast(er.message, 'err'); }
  });
  root.querySelector('[data-cerrar-todo]').addEventListener('click', async () => {
    if (!confirm('¿Cerrar la sesión en todos los dispositivos, incluido este?')) return;
    try {
      await call('cerrarSesiones');
      auth.token = null;
      location.reload();
    } catch (er) { toast(er.message, 'err'); }
  });
}
