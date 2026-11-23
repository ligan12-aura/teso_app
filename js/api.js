import { CONFIG } from './config.js';
import { demoEnv } from './demo.js';

// Sin API_URL, o abriendo la página con ?demo, se usa el modo demostración (datos de ejemplo locales)
export const isDemo = !CONFIG.API_URL || new URLSearchParams(location.search).has('demo');
// ?supabase: prueba del servidor nuevo antes del cambio definitivo (su sesión se guarda aparte)
const pruebaSupabase = !isDemo && !!CONFIG.API_SUPABASE && new URLSearchParams(location.search).has('supabase');
const API = pruebaSupabase ? CONFIG.API_SUPABASE : CONFIG.API_URL;
// Ingreso con cuenta de Google (fuera de la demo, si hay ID de cliente configurado)
export const conGoogle = !isDemo && !!CONFIG.GOOGLE_CLIENT_ID;
const TOKEN_KEY = isDemo ? 'teso_token_demo' : pruebaSupabase ? 'teso_token_sb' : 'teso_token';
let core = null;

export const auth = {
  get token() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set token(v) { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* */ } }
};

export class ApiError extends Error {
  constructor(msg, code) { super(msg); this.code = code; }
}

let onAuthError = () => {};
export function setAuthErrorHandler(fn) { onAuthError = fn; }

export async function call(action, payload = {}) {
  let r;
  if (isDemo) {
    core ||= TesoCore.create(demoEnv());
    await new Promise((res) => setTimeout(res, 120));
    r = core.handle(action, payload, auth.token);
  } else {
    let res;
    try {
      res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload, token: auth.token })
      });
    } catch {
      throw new ApiError('No hay conexión con el servidor. Revisa tu internet.', 'NET');
    }
    try { r = await res.json(); } catch { throw new ApiError('Respuesta inválida del servidor', 'NET'); }
  }
  if (!r.ok) {
    if (r.code === 'AUTH' && action !== 'login') onAuthError(r.error);
    throw new ApiError(r.error, r.code);
  }
  return r.data;
}
