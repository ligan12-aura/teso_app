import { CONFIG } from './config.js';
import { call } from './api.js';

// ---------------- Formato ----------------
const nf = new Intl.NumberFormat(CONFIG.LOCALE, { style: 'currency', currency: CONFIG.MONEDA, maximumFractionDigits: 0 });
export const money = (n) => nf.format(Math.round(Number(n) || 0));
export function moneyShort(n) {
  const v = Math.abs(n), s = n < 0 ? '-' : '';
  if (v >= 1e6) return `${s}$${(v / 1e6).toLocaleString(CONFIG.LOCALE, { maximumFractionDigits: 1 })}M`;
  if (v >= 1e3) return `${s}$${Math.round(v / 1e3).toLocaleString(CONFIG.LOCALE)}k`;
  return `${s}$${Math.round(v)}`;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const mesLargo = (m) => `${MESES[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
export const mesNombre = (m) => MESES[+m.slice(5, 7) - 1];
export const mesCorto = (m) => `${MESES_C[+m.slice(5, 7) - 1]} ${m.slice(2, 4)}`;
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export function fecha(s) {
  if (!s) return '';
  const [y, m, d] = s.slice(0, 10).split('-');
  return `${+d} ${MESES_C[+m - 1]} ${y}`;
}
export const fechaCorta = (s) => { const [, m, d] = s.slice(0, 10).split('-'); return `${+d} ${MESES_C[+m - 1]}`; };
export const prevMonth = (m) => TesoCore.prevMonth(m);
export const nextMonth = (m) => TesoCore.nextMonth(m);

// ---------------- Íconos (trazos estilo lucide) ----------------
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M16 15h2"/><path d="M6 6V5a2 2 0 0 1 2-2h9"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  up: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  sheet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/>',
  transfer: '<path d="M7 7h13"/><path d="m16 3 4 4-4 4"/><path d="M17 17H4"/><path d="m8 13-4 4 4 4"/>',
  alert: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  church: '<path d="M12 2v4M10 4h4"/><path d="m6 11 6-5 6 5"/><path d="M6 11v10h12V11"/><path d="M10 21v-4a2 2 0 0 1 4 0v4"/><path d="M3 21h18"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>'
};
export const icon = (name, size = 18) =>
  `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

// ---------------- Estados de rendición ----------------
export const ESTADOS = {
  abierta: { label: 'Abierta', cls: 'st-open', icon: 'clock', desc: 'El líder está registrando movimientos' },
  enviada: { label: 'En revisión', cls: 'st-sent', icon: 'send', desc: 'El líder confirmó; falta revisión del tesorero' },
  observada: { label: 'Observada', cls: 'st-obs', icon: 'alert', desc: 'El tesorero pidió correcciones' },
  aprobada: { label: 'Aprobada', cls: 'st-ok', icon: 'checkCircle', desc: 'Revisada y aprobada' }
};
export const badgeEstado = (e) => { const s = ESTADOS[e] || ESTADOS.abierta; return `<span class="badge ${s.cls}">${icon(s.icon, 13)}${s.label}</span>`; };

// ---------------- Toasts ----------------
export function toast(msg, type = 'ok') {
  let host = document.getElementById('toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; document.body.appendChild(host); }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `${icon(type === 'err' ? 'alert' : 'checkCircle', 18)}<span>${esc(msg)}</span>`;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }, type === 'err' ? 5000 : 3000);
}

// ---------------- Modales ----------------
export function modal({ title, body, submitLabel = 'Guardar', onSubmit, wide = false, danger = false, hideFooter = false, onOpen }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `
      <form class="modal ${wide ? 'wide' : ''}" novalidate>
        <header class="modal-head"><h3>${title}</h3><button type="button" class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></header>
        <div class="modal-body">${body}</div>
        <div class="form-error" hidden></div>
        ${hideFooter ? '' : `<footer class="modal-foot">
          <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
          <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${submitLabel}</button>
        </footer>`}
      </form>`;
    document.body.appendChild(wrap);
    const form = wrap.querySelector('form');
    const errBox = wrap.querySelector('.form-error');
    requestAnimationFrame(() => wrap.classList.add('in'));
    const close = (val) => {
      wrap.classList.remove('in');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => wrap.remove(), 200);
      resolve(val);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(null); });
    wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => close(null)));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!onSubmit) return close(true);
      const btn = form.querySelector('[type=submit]');
      errBox.hidden = true;
      btn.disabled = true; btn.classList.add('loading');
      try {
        const res = await onSubmit(form, { close });
        if (res !== false) close(res ?? true);
      } catch (err) {
        errBox.textContent = err.message || String(err);
        errBox.hidden = false;
      } finally {
        btn.disabled = false; btn.classList.remove('loading');
      }
    });
    onOpen?.(form, { close });
    const first = form.querySelector('input:not([type=hidden]):not([type=file]), select, textarea');
    if (first && window.matchMedia('(min-width: 700px)').matches) setTimeout(() => first.focus(), 60);
  });
}

export function confirmar(mensaje, { titulo = '¿Estás seguro?', boton = 'Confirmar', danger = false } = {}) {
  return modal({ title: titulo, body: `<div class="confirm-text">${mensaje}</div>`, submitLabel: boton, danger }).then((v) => !!v);
}

export function formData(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { if (!(v instanceof File)) o[k] = typeof v === 'string' ? v.trim() : v; });
  return o;
}

// ---------------- Archivos (boletas) ----------------
export async function fileToPayload(file, maxSide = 1600, quality = 0.78) {
  if (!file) return null;
  if (file.type === 'application/pdf') {
    if (file.size > 6 * 1024 * 1024) throw new Error('El PDF supera 6 MB');
    return { nombre: file.name, mime: file.type, base64: await readB64(file) };
  }
  if (!file.type.startsWith('image/')) throw new Error('Solo se aceptan imágenes o PDF');
  const img = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL('image/jpeg', quality);
  return { nombre: file.name.replace(/\.\w+$/, '') + '.jpg', mime: 'image/jpeg', base64: dataUrl.split(',')[1], preview: dataUrl };
}
function readB64(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
}
function loadImage(file) {
  return new Promise((res, rej) => { const url = URL.createObjectURL(file); const i = new Image(); i.onload = () => { URL.revokeObjectURL(url); res(i); }; i.onerror = () => rej(new Error('No se pudo leer la imagen')); i.src = url; });
}

const fileCache = new Map();
export async function verArchivo(id, titulo = 'Boleta') {
  const wrap = document.createElement('div');
  wrap.className = 'lightbox';
  wrap.innerHTML = `<div class="lb-inner"><header><span>${esc(titulo)}</span><button class="icon-btn light" aria-label="Cerrar">${icon('x')}</button></header><div class="lb-body"><div class="spinner"></div></div></div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('in'));
  const close = () => { wrap.classList.remove('in'); setTimeout(() => wrap.remove(), 200); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('header button')) close(); });
  try {
    let f = fileCache.get(id);
    if (!f) { f = await call('getArchivo', { id }); fileCache.set(id, f); }
    const url = `data:${f.mime};base64,${f.base64}`;
    const body = wrap.querySelector('.lb-body');
    if (f.mime === 'application/pdf') {
      const blob = await (await fetch(url)).blob();
      const bUrl = URL.createObjectURL(blob);
      body.innerHTML = `<iframe src="${bUrl}" title="PDF"></iframe><a class="btn btn-light" href="${bUrl}" target="_blank" rel="noopener">${icon('eye')} Abrir PDF</a>`;
    } else {
      body.innerHTML = `<img src="${url}" alt="${esc(titulo)}"><a class="btn btn-light" download="${esc(f.nombre)}" href="${url}">${icon('download')} Descargar</a>`;
    }
  } catch (e) {
    wrap.querySelector('.lb-body').innerHTML = `<p class="lb-err">${esc(e.message)}</p>`;
  }
}

// ---------------- Gráficos (Chart.js) ----------------
let charts = [];
export function chart(canvas, config) {
  if (!canvas || !window.Chart) return null;
  const c = new window.Chart(canvas, config);
  charts.push(c);
  return c;
}
export function destroyCharts() { charts.forEach((c) => c.destroy()); charts = []; }

export function setupChartDefaults() {
  if (!window.Chart) return;
  const C = window.Chart;
  C.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
  C.defaults.font.size = 12;
  C.defaults.color = '#6b7280';
  C.defaults.plugins.legend.labels.usePointStyle = true;
  C.defaults.plugins.legend.labels.boxWidth = 8;
  C.defaults.plugins.tooltip.backgroundColor = '#1b2638';
  C.defaults.plugins.tooltip.padding = 10;
  C.defaults.plugins.tooltip.cornerRadius = 10;
  C.defaults.plugins.tooltip.titleFont = { weight: '600' };
  C.defaults.maintainAspectRatio = false;
}
export const PALETA = ['#23395d', '#c99a3b', '#2f9e8f', '#c2577a', '#7c5cbf', '#e9883a', '#3a6ea5', '#7a8b3a', '#9aa3b2', '#5b7db1', '#d4a35b', '#4fb3a3', '#b07aa1'];
export const COLOR = { ingreso: '#2f9e6e', gasto: '#d4515f', navy: '#23395d', gold: '#c99a3b' };

// Anillo de progreso SVG
export function ring(pct, color = '#23395d', size = 64, stroke = 7) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  const over = pct > 1;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${over ? 'var(--rose)' : color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" class="ring-txt">${Math.round(pct * 100)}%</text></svg>`;
}

// Mini gráfico de línea (sparkline) SVG
export function sparkline(values, color = '#c99a3b', w = 120, h = 36) {
  if (!values.length) return '';
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1 || 1)) * w, h - 3 - ((v - min) / span) * (h - 6)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <path d="${d} L${w},${h} L0,${h}Z" fill="${color}" opacity=".14"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

export function monthPicker(mes, id = 'mes-picker') {
  return `<div class="month-picker" id="${id}">
    <button type="button" class="icon-btn" data-dir="-1" aria-label="Mes anterior">${icon('chevL')}</button>
    <span class="mp-label">${cap(mesLargo(mes))}</span>
    <button type="button" class="icon-btn" data-dir="1" aria-label="Mes siguiente">${icon('chevR')}</button>
  </div>`;
}
export function bindMonthPicker(root, mes, onChange, id = 'mes-picker') {
  root.querySelector(`#${id}`)?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dir]');
    if (!b) return;
    onChange(b.dataset.dir === '1' ? nextMonth(mes) : prevMonth(mes));
  });
}

export function emptyState(texto, ico = 'sparkle') {
  return `<div class="empty">${icon(ico, 28)}<p>${texto}</p></div>`;
}
