// Ingreso con cuenta personal de Microsoft (Hotmail, Outlook, Live) sin librerías externas:
// flujo de "código de autorización con PKCE" en la misma ventana (funciona también en la página fijada del
// iPhone, donde las ventanas emergentes fallan). Microsoft devuelve a esta misma página con ?code=…; aquí se
// canjea por la credencial (id_token), que el servidor verifica antes de dejar entrar.
import { CONFIG } from './config.js';

const AUTORIDAD = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const CLAVE = 'teso_ms_pkce';

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const azar = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
// dirección a la que vuelve Microsoft: la de la página, sin index.html ni parámetros (debe estar registrada tal cual)
export const direccionRetorno = () => location.origin + location.pathname.replace(/index\.html$/, '');

export async function iniciarMicrosoft() {
  const verifier = azar(48);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = azar(16), nonce = azar(16);
  try { sessionStorage.setItem(CLAVE, JSON.stringify({ verifier, state, nonce, hash: location.hash })); } catch { /* */ }
  const q = new URLSearchParams({
    client_id: CONFIG.MS_CLIENT_ID, response_type: 'code', redirect_uri: direccionRetorno(), response_mode: 'query',
    scope: 'openid email profile', state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account'
  });
  location.assign(`${AUTORIDAD}/authorize?${q}`);
}

// ¿la página volvió de Microsoft? Devuelve null si no; si sí, la credencial (o lanza un error con mensaje claro)
export async function completarMicrosoft() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return null;
  let guardado = null;
  try { guardado = JSON.parse(sessionStorage.getItem(CLAVE) || 'null'); sessionStorage.removeItem(CLAVE); } catch { /* */ }
  // se limpia la dirección (sin código ni estado) y se recupera la pantalla en la que estaba
  history.replaceState(null, '', direccionRetorno() + (guardado?.hash || ''));
  if (q.has('error')) {
    if (q.get('error') === 'access_denied') throw new Error('Cancelaste el ingreso con Microsoft.');
    throw new Error('Microsoft no permitió el ingreso. Intenta de nuevo.');
  }
  if (!guardado || q.get('state') !== guardado.state) throw new Error('El ingreso con Microsoft expiró. Vuelve a intentarlo.');
  const res = await fetch(`${AUTORIDAD}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CONFIG.MS_CLIENT_ID, grant_type: 'authorization_code', code: q.get('code'),
      redirect_uri: direccionRetorno(), code_verifier: guardado.verifier, scope: 'openid email profile'
    })
  }).catch(() => null);
  const t = res && (await res.json().catch(() => null));
  if (!t?.id_token) throw new Error('No se pudo completar el ingreso con Microsoft. Intenta de nuevo.');
  // el nonce de la credencial debe ser el de esta solicitud
  try {
    const carga = JSON.parse(atob(t.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (carga.nonce !== guardado.nonce) throw new Error();
  } catch { throw new Error('La respuesta de Microsoft no es válida. Intenta de nuevo.'); }
  return t.id_token;
}
