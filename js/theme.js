// =================================================================
// Modo claro / oscuro
// Por defecto sigue al sistema (computador o celular). Si la persona
// elige un modo con el botón, se recuerda en este navegador; si elige
// el mismo modo que tiene el sistema, vuelve a seguir al sistema.
// =================================================================
import { icon } from './ui.js';

const KEY = 'teso_tema';
const mq = window.matchMedia('(prefers-color-scheme: dark)');

const sistema = () => (mq.matches ? 'dark' : 'light');
const guardado = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const temaActual = () => document.documentElement.dataset.theme || sistema();

export function aplicarTema(t) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0c111b' : '#1b2a45');
  document.querySelectorAll('[data-theme-toggle]').forEach((b) => {
    const txt = t === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
    b.setAttribute('aria-label', txt); b.title = txt;
  });
}

export function alternarTema() {
  const nuevo = temaActual() === 'dark' ? 'light' : 'dark';
  try { nuevo === sistema() ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, nuevo); } catch { /* sin almacenamiento */ }
  aplicarTema(nuevo);
  return nuevo;
}

// Si el sistema cambia de modo y la persona no eligió uno, la página lo sigue
export function seguirSistema(onChange) {
  mq.addEventListener('change', () => {
    if (guardado()) return;
    aplicarTema(sistema());
    onChange?.();
  });
}

// Botón: luna en modo claro, sol en modo oscuro. conTexto = muestra la etiqueta
export function botonTema(cls, conTexto = false) {
  const t = temaActual();
  const txt = t === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
  return `<button type="button" class="${cls}" data-theme-toggle aria-label="${txt}" title="${txt}">
    <span class="theme-light-only">${icon('moon', conTexto ? 18 : 17)}${conTexto ? ' Modo oscuro' : ''}</span>
    <span class="theme-dark-only">${icon('sun', conTexto ? 18 : 17)}${conTexto ? ' Modo claro' : ''}</span>
  </button>`;
}
