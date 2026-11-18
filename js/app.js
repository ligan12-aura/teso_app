import { CONFIG } from './config.js';
import { call, auth, isDemo, setAuthErrorHandler } from './api.js';
import { resetDemo } from './demo.js';
import { icon, esc, toast, destroyCharts, setupChartDefaults, modal, formData, esAdmin, ROL_LABEL } from './ui.js';
import { botonTema, alternarTema, aplicarTema, temaActual, seguirSistema } from './theme.js';
import * as Dashboard from './views/dashboard.js';
import * as General from './views/general.js';
import * as Ministerios from './views/ministerios.js';
import * as Ministerio from './views/ministerio.js';
import * as Rendiciones from './views/rendiciones.js';
import * as Admin from './views/admin.js';
import * as Perfil from './views/perfil.js';
import * as Diezmos from './views/diezmos.js';
import * as Miembros from './views/miembros.js';
import { descargarPlanillaGeneral } from './planillaDescarga.js';
import { abrirAyuda } from './views/ayuda.js';

const app = document.getElementById('app');
const state = { user: null, data: null, mes: null };

const NAV = {
  tesorero: [
    { path: 'inicio', label: 'Inicio', icon: 'home' },
    { path: 'general', label: 'Tesorería', icon: 'wallet' },
    { path: 'ministerios', label: 'Ministerios', icon: 'grid', mas: true },
    { path: 'rendiciones', label: 'Rendiciones', icon: 'checkCircle' },
    { path: 'diezmos', label: 'Diezmos', icon: 'heart' },
    { path: 'miembros', label: 'Miembros', icon: 'users', mas: true },
    { path: 'admin', label: 'Configuración', short: 'Ajustes', icon: 'settings', mas: true }
  ],
  secretaria: [
    { path: 'miembros', label: 'Miembros', icon: 'users' },
    { path: 'perfil', label: 'Mi cuenta', icon: 'user' }
  ],
  lider: [
    { path: 'mi-ministerio', label: 'Mi ministerio', icon: 'wallet' },
    { path: 'perfil', label: 'Mi cuenta', icon: 'user' }
  ]
};

NAV.pastor = NAV.tesorero;
const ADM = ['tesorero', 'pastor'];
const ROUTES = {
  inicio: { view: Dashboard, roles: ADM },
  general: { view: General, roles: ADM },
  ministerios: { view: Ministerios, roles: ADM },
  ministerio: { view: Ministerio, roles: ADM },
  rendiciones: { view: Rendiciones, roles: ADM },
  diezmos: { view: Diezmos, roles: ADM },
  miembros: { view: Miembros, roles: [...ADM, 'secretaria'] },
  admin: { view: Admin, roles: ADM },
  'mi-ministerio': { view: Ministerio, roles: ['lider'] },
  perfil: { view: Perfil }
};

const home = () => (esAdmin(state.user) ? 'inicio' : state.user?.rol === 'secretaria' ? 'miembros' : 'mi-ministerio');
const permitido = (r) => !r.roles || r.roles.includes(state.user.rol);
export const go = (path) => { location.hash = '#/' + path; };

setAuthErrorHandler((msg) => {
  auth.token = null;
  state.user = null; state.data = null;
  toast(msg, 'err');
  renderLogin();
});

async function loadData() {
  state.data = await call('getData');
  state.user = state.data.user;
  if (!state.mes) state.mes = state.data.hoy.slice(0, 7);
}

// =================================================================
// Login
// =================================================================
function renderLogin(msg = '') {
  destroyCharts();
  document.body.className = 'is-login';
  app.innerHTML = `
  <div class="login">
    <div class="login-art">
      <div class="login-art-inner">
        <div class="brand-mark big">${icon('church', 34)}</div>
        <h1>${esc(CONFIG.NOMBRE_IGLESIA)}</h1>
        <p class="login-verse">“Cada uno dé como propuso en su corazón… porque Dios ama al dador alegre.”<span>2 Corintios 9:7</span></p>
        <ul class="login-points">
          <li>${icon('wallet')} Tesorería general ordenada</li>
          <li>${icon('receipt')} Rendición de gastos por ministerio</li>
          <li>${icon('sheet')} Respaldo automático en planilla</li>
        </ul>
      </div>
    </div>
    <div class="login-panel">
      ${botonTema('theme-fab', true)}
      <form class="login-form" novalidate>
        <div class="login-head">
          <span class="eyebrow">Equipo de finanzas</span>
          <h2>Ingresar</h2>
          <p class="muted">Usa el usuario que te entregó el tesorero.</p>
        </div>
        <label class="field"><span>Usuario</span><input name="usuario" autocomplete="username" autocapitalize="none" required></label>
        <label class="field"><span>Contraseña</span><input name="password" type="password" autocomplete="current-password" required></label>
        <div class="form-error" ${msg ? '' : 'hidden'}>${esc(msg)}</div>
        <button class="btn btn-primary btn-block" type="submit">Entrar</button>
        ${isDemo ? `
        <div class="demo-box">
          <strong>${icon('sparkle', 15)} Modo demostración</strong>
          <p>Datos de ejemplo guardados solo en este navegador. Contraseña para todos: <code>demo</code></p>
          <div class="demo-users">
            <button type="button" data-u="tesorero">Tesorero</button>
            <button type="button" data-u="pastor">Pastor</button>
            <button type="button" data-u="secretaria">Secretaría</button>
            <button type="button" data-u="alabanza">Líder Alabanza</button>
            <button type="button" data-u="jovenes">Líder Jóvenes</button>
            <button type="button" data-u="mujeres">Líder Mujeres</button>
          </div>
          <button type="button" class="link-btn" data-reset>Reiniciar datos de ejemplo</button>
        </div>` : ''}
      </form>
    </div>
  </div>`;
  const form = app.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    const err = form.querySelector('.form-error');
    btn.disabled = true; btn.classList.add('loading'); err.hidden = true;
    try {
      const r = await call('login', formData(form));
      auth.token = r.token;
      state.user = r.user;
      await afterLogin();
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
    } finally { btn.disabled = false; btn.classList.remove('loading'); }
  });
  form.querySelectorAll('[data-u]').forEach((b) => b.addEventListener('click', () => {
    form.usuario.value = b.dataset.u; form.password.value = 'demo'; form.requestSubmit();
  }));
  form.querySelector('[data-reset]')?.addEventListener('click', () => { resetDemo(); location.reload(); });
}

async function afterLogin() {
  if (state.user.debeCambiarPass) return forzarCambioPass();
  await loadData();
  const want = location.hash.replace(/^#\//, '').split('/')[0];
  if (!want || !ROUTES[want] || !permitido(ROUTES[want])) go(home());
  else route();
  const key = `teso_guia_vista_${isDemo ? "demo_" : ""}${state.user.usuario}`;
  let vista = true;
  try { vista = !!localStorage.getItem(key); localStorage.setItem(key, '1'); } catch { /* */ }
  if (!vista) setTimeout(() => abrirAyuda(state.user.rol, 'bienvenida'), 500);
}

async function forzarCambioPass() {
  document.body.className = 'is-login';
  app.innerHTML = '<div class="login-blank"></div>';
  await modal({
    title: 'Crea tu contraseña personal',
    body: `<p class="muted">Por seguridad, cambia la contraseña inicial que te entregaron.</p>
      <label class="field"><span>Contraseña actual</span><input type="password" name="actual" required></label>
      <label class="field"><span>Nueva contraseña (mín. 6 caracteres)</span><input type="password" name="nueva" minlength="6" required></label>
      <label class="field"><span>Repite la nueva contraseña</span><input type="password" name="repite" required></label>`,
    submitLabel: 'Guardar y continuar',
    onSubmit: async (f) => {
      const d = formData(f);
      if (d.nueva !== d.repite) throw new Error('Las contraseñas no coinciden');
      const r = await call('cambiarPassword', d);
      auth.token = r.token; state.user = r.user;
    }
  }).then(async (ok) => {
    if (!ok) { auth.token = null; return renderLogin(); }
    toast('Contraseña actualizada');
    await afterLogin();
  });
}

function logout() {
  auth.token = null;
  state.user = null; state.data = null; state.mes = null;
  location.hash = '';
  renderLogin();
}

// =================================================================
// Layout + router
// =================================================================
function shell(active) {
  const u = state.user;
  const nav = NAV[u.rol] || NAV.lider;
  const min = u.rol === 'lider' ? state.data.ministerios[0] : null;
  const initials = u.nombre.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  const links = nav.map((n) => `<a href="#/${n.path}" class="nav-link ${active === n.path ? 'active' : ''}">${icon(n.icon, 20)}<span>${n.short ? `<span class="lbl-long">${n.label}</span><span class="lbl-short">${n.short}</span>` : n.label}</span></a>`).join('');
  // En el celular caben 5 pestañas: las marcadas con "mas" van dentro de "Más"
  const enMas = nav.filter((n) => n.mas);
  const masActiva = enMas.some((n) => n.path === active);
  const bottom = nav.filter((n) => !n.mas).map((n) => `<a href="#/${n.path}" class="nav-link ${active === n.path ? 'active' : ''}">${icon(n.icon, 20)}<span>${n.short || n.label}</span></a>`).join('')
    + (enMas.length ? `<button type="button" class="nav-link ${masActiva ? 'active' : ''}" data-mas aria-haspopup="dialog">${icon('menu', 20)}<span>Más</span></button>` : '');
  return `
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark">${icon('church', 22)}</div>
      <div><strong>El Redentor</strong><span>Tesorería</span></div>
    </div>
    <nav class="nav">${links}</nav>
    <div class="side-foot">
      <button class="side-action help-action" data-help>${icon('help')} Ayuda · Guía de uso</button>
      ${botonTema('side-action', true)}
      ${esAdmin(u) ? `
        ${state.data.extra?.sheetUrl ? `<a class="side-action" href="${esc(state.data.extra.sheetUrl)}" target="_blank" rel="noopener">${icon('sheet')} Abrir planilla</a>` : ''}
        <button class="side-action" data-export>${icon('download')} Descargar planilla</button>` : ''}
      <div class="me">
        <div class="avatar">${esc(initials)}</div>
        <div class="me-txt"><strong>${esc(u.nombre)}</strong><span>${u.rol === 'lider' ? `Líder · ${esc(min?.nombre || '')}` : ROL_LABEL[u.rol] || ''}</span></div>
        <button class="icon-btn light" data-logout title="Cerrar sesión" aria-label="Cerrar sesión">${icon('logout')}</button>
      </div>
    </div>
  </aside>
  <div class="main">
    <header class="topbar">
      <div class="brand mobile"><div class="brand-mark">${icon('church', 18)}</div><strong>El Redentor</strong></div>
      ${isDemo ? `<span class="demo-pill">${icon('sparkle', 13)} <span class="dp-long">Modo</span> demo</span>` : ''}
      <button class="help-pill mobile" data-help aria-label="Ayuda">${icon('help', 17)}<span class="hp-txt"> Ayuda</span></button>
      ${botonTema('icon-btn mobile')}
      <button class="icon-btn mobile" data-logout aria-label="Cerrar sesión">${icon('logout')}</button>
    </header>
    <main id="view" class="view"></main>
  </div>
  <nav class="bottom-nav">${bottom}</nav>`;
}

// Hoja "Más" del celular: las secciones que no caben en el menú inferior
function abrirMas(active) {
  const nav = (NAV[state.user.rol] || NAV.lider).filter((n) => n.mas);
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal mas-sheet" role="dialog" aria-modal="true" aria-label="Más secciones">
    <header class="modal-head"><h3>Más</h3><button type="button" class="icon-btn" data-cerrar aria-label="Cerrar">${icon('x')}</button></header>
    <div class="modal-body"><ul class="mas-list">${nav.map((n) => `<li><a href="#/${n.path}" class="${active === n.path ? 'active' : ''}">${icon(n.icon, 20)}${n.label}</a></li>`).join('')}</ul></div>
  </div>`;
  const onKey = (e) => { if (e.key === 'Escape') cerrar(); };
  const cerrar = () => { wrap.classList.remove('in'); setTimeout(() => wrap.remove(), 200); document.removeEventListener('keydown', onKey); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-cerrar]') || e.target.closest('a')) cerrar(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('in'));
  wrap.querySelector('a')?.focus();
}

async function route() {
  if (!state.user || !state.data) return;
  const [path, ...params] = location.hash.replace(/^#\//, '').split('/');
  const r = ROUTES[path];
  if (!r || !permitido(r)) return go(home());
  destroyCharts();
  document.body.className = '';
  const activeNav = path === 'ministerio' ? 'ministerios' : path;
  app.innerHTML = shell(activeNav);
  app.querySelectorAll('[data-logout]').forEach((b) => b.addEventListener('click', logout));
  app.querySelector('[data-mas]')?.addEventListener('click', () => abrirMas(activeNav));
  app.querySelectorAll('[data-help]').forEach((b) => b.addEventListener('click', () => abrirAyuda(state.user.rol, location.hash.replace(/^#\//, '').split('/')[0])));
  app.querySelector('[data-export]')?.addEventListener('click', () => descargarPlanillaGeneral(state.data).catch((e) => toast(e.message, 'err')));
  const root = app.querySelector('#view');
  const ctx = {
    data: state.data,
    user: state.user,
    params,
    get mes() { return state.mes; },
    setMes(m) { state.mes = m; render(); },
    setMesSilent(m) { state.mes = m; },
    go,
    async refresh() {
      try { await loadData(); } catch (e) { toast(e.message, 'err'); }
      ctx.data = state.data;
      render();
    }
  };
  const render = () => {
    destroyCharts();
    try {
      r.view.render(root, ctx);
    } catch (e) {
      console.error(e);
      root.innerHTML = `<div class="empty">${icon('alert', 28)}<p>Ocurrió un error al mostrar esta sección.</p><code>${esc(e.message)}</code></div>`;
    }
  };
  render();
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);

// =================================================================
// Arranque
// =================================================================
// Modo claro/oscuro: al cambiar, se vuelve a dibujar la vista para que los gráficos tomen los colores nuevos
function alCambiarTema() {
  setupChartDefaults();
  if (!state.user || !state.data || document.body.classList.contains('is-login')) return;
  const y = window.scrollY;
  route();
  window.scrollTo(0, y);
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-theme-toggle]')) return;
  alternarTema();
  alCambiarTema();
});
seguirSistema(alCambiarTema);

(async function start() {
  aplicarTema(temaActual());
  setupChartDefaults();
  document.title = `Tesorería · ${CONFIG.NOMBRE_IGLESIA}`;
  if (!auth.token) return renderLogin();
  app.innerHTML = '<div class="boot"><div class="spinner"></div></div>';
  try {
    const r = await call('me');
    state.user = r.user;
    await afterLogin();
  } catch (e) {
    if (e.code !== 'AUTH') renderLogin(e.message);
  }
})();
