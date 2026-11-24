// Función "api" (Supabase Edge Function): reemplaza a Google Apps Script.
// Recibe las mismas consultas que antes ({ action, payload, token }) y corre la misma lógica (core.js,
// generado desde backend/Core.js con `node scripts/supabase-core.mjs`).
//
// Los datos se leen y guardan con funciones de la base de datos (teso_leer / teso_guardar) llamadas por HTTP:
// la conexión directa a Postgres dejaba algunas consultas colgadas (30-60 s) tras unos segundos sin uso.
// Escrituras simultáneas: se guarda solo si nadie guardó desde que se leyó (versión); si no, se repite.
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { createHash, createHmac } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';
import TesoCore from './core.js';
import { crearAlmacen, crearLimites, crearArchivos } from './almacen.js';

const supa = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
const BUCKET = 'comprobantes';
const SECRETO = Deno.env.get('TESO_SECRET');
const SHEET_URL = Deno.env.get('SHEET_URL') || '';
const ZONA = 'America/Santiago';
const INTENTOS = 4;
// Ingreso con Google: ID de cliente OAuth (público). Con él configurado, la contraseña queda solo para el administrador.
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
// Ingreso con Microsoft (cuentas personales: Hotmail, Outlook, Live): ID de la aplicación registrada en Microsoft Entra
const MS_CLIENT_ID = Deno.env.get('MS_CLIENT_ID') || '';
const MS_TENANT_PERSONAL = '9188040d-6c67-4c5b-b112-36a304b66dad'; // inquilino de las cuentas personales de Microsoft
const MS_JWKS = createRemoteJWKSet(new URL('https://login.microsoftonline.com/consumers/discovery/v2.0/keys'));
// Verifica la credencial de Microsoft (firma, emisor de cuentas personales, destinatario y vigencia)
async function identidadMicrosoft(credential) {
  if (!MS_CLIENT_ID || !credential) return null;
  try {
    const { payload } = await jwtVerify(String(credential), MS_JWKS, { issuer: `https://login.microsoftonline.com/${MS_TENANT_PERSONAL}/v2.0`, audience: MS_CLIENT_ID });
    if (payload.tid !== MS_TENANT_PERSONAL) return null;
    // en una cuenta personal, el correo de la cuenta (verificado por Microsoft) viene en email o preferred_username
    const correo = String(payload.email || payload.preferred_username || '').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return null;
    return { email: correo, nombre: String(payload.name || '') };
  } catch { return null; }
}

// Verifica la credencial que entrega el botón de Google (firma, emisor, destinatario, vigencia y correo verificado)
async function identidadGoogle(credential) {
  if (!GOOGLE_CLIENT_ID || !credential) return null;
  try {
    const { payload } = await jwtVerify(String(credential), GOOGLE_JWKS, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: GOOGLE_CLIENT_ID });
    if (!payload.email || payload.email_verified !== true) return null;
    return { email: String(payload.email).toLowerCase(), nombre: String(payload.name || '') };
  } catch { return null; }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info'
};
const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', ...extra } });
// Diagnóstico de tiempos (cabecera Server-Timing): cuánto tarda cada paso de la consulta
const ARRANQUE = Date.now();
let consultas = 0;

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const base64ABytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
function bytesABase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// ¿la acción escribe?
const coreInfo = TesoCore.create({ store: { read: () => [] }, files: {}, crypto: {}, uuid: () => '', now: () => '', today: hoy, secret: 'x' });

const CONFLICTO = new Error('conflicto');
async function leer() {
  const { data, error } = await supa.rpc('teso_leer');
  if (error) throw new Error('No se pudieron leer los datos: ' + error.message);
  return data;
}
// versiones leídas: la de los datos y la del contador de intentos de ingreso. Si alguien guardó después en
// ese grupo, se rechaza (TESO_CONFLICTO) y se repite con los datos nuevos.
async function guardarCambios(version, versionLimites, { guardar, borrar }) {
  if (!guardar.length && !borrar.length) return;
  const { error } = await supa.rpc('teso_guardar', { version_leida: version, version_limites_leida: versionLimites, guardar, borrar });
  if (!error) return;
  if (/TESO_CONFLICTO/.test(error.message || '')) throw CONFLICTO;
  if (/lock timeout|canceling statement/i.test(error.message || '')) { const e = new Error('ocupado'); e.ocupado = true; throw e; }
  throw new Error('No se pudo guardar: ' + error.message);
}

// ---------------- WhatsApp (API oficial de Meta: WhatsApp Cloud API) ----------------
// Reportes de diezmos enviados desde el servidor con una plantilla aprobada por Meta. Solo tesorería, pastor y
// administración; solo al celular registrado en la ficha del miembro; cada envío queda registrado (tabla _wsp).
const WSP_TOKEN = Deno.env.get('WSP_TOKEN') || '';
const WSP_PHONE_ID = Deno.env.get('WSP_PHONE_ID') || '';
const WSP_PLANTILLA = Deno.env.get('WSP_PLANTILLA') || 'resumen_diezmos';
const WSP_IDIOMA = Deno.env.get('WSP_IDIOMA') || 'es';
const WSP_ACCIONES = { wspEstado: 1, enviarWhatsapp: 1, wspReiniciar: 1 };
function numeroWsp(cel) {
  const d = String(cel || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('569')) return d;
  if (d.length === 9 && d.startsWith('9')) return '56' + d;
  if (d.length === 8) return '569' + d;
  if (d.length >= 10 && d.length <= 15 && !d.startsWith('0')) return d;
  return null;
}
// Meta no acepta saltos de línea ni tabulaciones en los datos de una plantilla, ni datos vacíos
const datoPlantilla = (t) => (String(t ?? '').replace(/\s*\n\s*/g, ' · ').replace(/\t/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, 600) || '—');

async function whatsapp(action, body) {
  for (let intento = 1; intento <= INTENTOS; intento++) {
    const { version, version_limites: versionLimites, filas } = await leer();
    const alm = crearAlmacen(filas);
    const core = TesoCore.create({
      store: alm.store, files: {}, today: hoy, now: () => new Date().toISOString(), uuid: () => crypto.randomUUID(), secret: SECRETO,
      crypto: {
        sha256Hex: (s) => createHash('sha256').update(String(s), 'utf8').digest('hex'),
        hmacHex: (m, k) => createHmac('sha256', String(k)).update(String(m), 'utf8').digest('hex')
      },
      limites: crearLimites(alm.store)
    });
    const yo = core.handle('me', {}, body.token);
    if (!yo.ok) return yo;
    const u = yo.data.user;
    if (['admin', 'tesorero', 'pastor'].indexOf(u.rol) < 0) return { ok: false, error: 'No tienes permiso para esta acción', code: 'FORBIDDEN' };
    const p = body.payload || {};
    const anio = /^\d{4}$/.test(String(p.anio)) ? String(p.anio) : '';
    if (!anio) return { ok: false, error: 'Año inválido', code: 'ERR' };
    const activo = !!(WSP_TOKEN && WSP_PHONE_ID);
    const deAnio = alm.store.read('_wsp').filter((x) => x.anio === anio);

    if (action === 'wspEstado') {
      const enviados = {};
      deAnio.forEach((x) => { enviados[x.clave] = String(x.t || '').slice(0, 10); });
      return { ok: true, data: { activo, enviados } };
    }
    if (action === 'wspReiniciar') {
      deAnio.forEach((x) => alm.store.remove('_wsp', x.id));
      try { await guardarCambios(version, versionLimites, alm.cambios()); } catch (e) { if (e === CONFLICTO && intento < INTENTOS) continue; throw e; }
      return { ok: true, data: { reiniciados: deAnio.length } };
    }
    // enviarWhatsapp
    if (!activo) return { ok: false, error: 'El envío automático por WhatsApp aún no está configurado.', code: 'ERR' };
    const clave = String(p.clave || '').slice(0, 200);
    const mb = alm.store.read('Miembros').find((x) => x.id === String(p.miembroId || ''));
    if (!mb || !clave) return { ok: false, error: 'Miembro no encontrado', code: 'ERR' };
    const numero = numeroWsp(mb.celular);
    if (!numero) return { ok: false, error: `${mb.nombre} no tiene un celular válido en su ficha.`, code: 'ERR' };
    const params = (Array.isArray(p.parametros) ? p.parametros : []).slice(0, 10).map(datoPlantilla);
    if (intento === 1) {
      // el mensaje se envía una sola vez; si al registrar el envío otra consulta guardó antes, solo se repite el registro
      const res = await fetch(`https://graph.facebook.com/v21.0/${WSP_PHONE_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${WSP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: numero, type: 'template',
          template: { name: WSP_PLANTILLA, language: { code: WSP_IDIOMA }, components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] }
        })
      }).catch(() => null);
      const r = res && (await res.json().catch(() => null));
      if (!res || !res.ok) {
        const m = r?.error?.error_user_msg || r?.error?.message || 'sin respuesta';
        console.error('whatsapp', JSON.stringify(r?.error || {}));
        return { ok: false, error: `WhatsApp no envió el mensaje a ${mb.nombre}: ${m}`, code: 'ERR' };
      }
      body._wamid = r?.messages?.[0]?.id || '';
    }
    const id = anio + ':' + clave;
    const reg = { id, anio, clave, miembroId: mb.id, numero: numero.slice(-4), wamid: body._wamid, t: new Date().toISOString(), por: u.id };
    if (alm.store.read('_wsp').some((x) => x.id === id)) alm.store.update('_wsp', id, reg); else alm.store.insert('_wsp', reg);
    try { await guardarCambios(version, versionLimites, alm.cambios()); } catch (e) { if (e === CONFLICTO && intento < INTENTOS) continue; throw e; }
    return { ok: true, data: { enviado: true, fecha: reg.t.slice(0, 10) } };
  }
  return { ok: false, error: 'El sistema está ocupado en este momento. Espera unos segundos e intenta de nuevo.', code: 'OCUPADO' };
}

async function descargar(info) {
  const { data, error } = await supa.storage.from(BUCKET).download(info.ruta);
  if (error || !data) throw new Error('No se pudo leer el comprobante');
  return { nombre: info.nombre, mime: info.mime || data.type, base64: bytesABase64(new Uint8Array(await data.arrayBuffer())) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method === 'GET') return json({ ok: true, data: 'API de Tesorería El Redentor activa' });
  let body;
  try { body = JSON.parse(await req.text()); } catch { return json({ ok: false, error: 'Solicitud inválida' }); }
  const action = String(body.action || '');
  // identificador de la solicitud (lo manda la página): si una escritura se repite con el mismo id
  // (p. ej. tras un corte por demora), no se vuelve a aplicar
  const escribe = coreInfo.isWrite(action);
  const idSol = escribe && /^[A-Za-z0-9-]{8,64}$/.test(String(body.idSolicitud || '')) ? String(body.idSolicitud) : '';
  const cred = body.payload && body.payload.credential;
  const idg = action === 'loginGoogle' ? await identidadGoogle(cred) : action === 'loginMicrosoft' ? await identidadMicrosoft(cred) : null;
  if (action === 'loginGoogle' && !idg) return json({ ok: false, error: 'No se pudo verificar tu cuenta de Google. Intenta de nuevo.', code: 'ERR' });
  if (action === 'loginMicrosoft' && !idg) return json({ ok: false, error: 'No se pudo verificar tu cuenta de Microsoft. Intenta de nuevo.', code: 'ERR' });

  if (WSP_ACCIONES[action]) {
    try { return json(await whatsapp(action, body)); } catch (e) {
      console.error(action, e && e.stack ? e.stack : e);
      return json({ ok: false, error: e && e.ocupado ? 'El sistema está ocupado en este momento. Espera unos segundos e intenta de nuevo.' : 'Ocurrió un error inesperado. Intenta de nuevo en unos minutos.', code: 'ERR' });
    }
  }

  const t0 = Date.now(), marcas = [];
  const marca = (k) => marcas.push(`${k};dur=${Date.now() - t0}`);
  consultas++;
  const cabeceras = () => ({ 'Server-Timing': [`instancia;dur=${t0 - ARRANQUE}`, `n;dur=${consultas}`, ...marcas, `total;dur=${Date.now() - t0}`].join(', '), 'Access-Control-Expose-Headers': 'Server-Timing' });

  try {
    for (let intento = 1; intento <= INTENTOS; intento++) {
      const { version, version_limites: versionLimites, filas } = await leer();
      marca('lectura' + intento);
      const alm = crearAlmacen(filas);
      if (idSol) {
        const previa = alm.store.read('_solicitudes').find((x) => x.id === idSol);
        if (previa) return json({ ok: true, data: previa.resultado ?? {}, repetida: true }, 200, cabeceras());
      }
      const arch = crearArchivos(alm.store, () => crypto.randomUUID());
      const core = TesoCore.create({
        store: alm.store,
        files: arch.files,
        crypto: {
          sha256Hex: (s) => createHash('sha256').update(String(s), 'utf8').digest('hex'),
          hmacHex: (m, k) => createHmac('sha256', String(k)).update(String(m), 'utf8').digest('hex')
        },
        uuid: () => crypto.randomUUID(),
        now: () => new Date().toISOString(),
        today: hoy,
        secret: SECRETO,
        limites: crearLimites(alm.store),
        // con ingreso por Google o Microsoft, la contraseña queda solo para el administrador
        soloGoogle: !!(GOOGLE_CLIENT_ID || MS_CLIENT_ID),
        identidadGoogle: idg,
        extra: SHEET_URL ? { sheetUrl: SHEET_URL } : {}
      });
      let r = core.handle(action, body.payload || {}, body.token);
      marca('logica');
      if (!r.ok) {
        // un error no guarda nada, salvo el contador de intentos fallidos de ingreso (con su versión:
        // intentos en paralelo se repiten con el contador al día, así el bloqueo no se salta)
        try { await guardarCambios(version, versionLimites, alm.cambios(['_limites'])); }
        catch (e) { if (e === CONFLICTO && intento < INTENTOS) { marca('reintento'); continue; } throw e; }
        return json(r, 200, cabeceras());
      }
      if (idSol) {
        // se recuerda la solicitud 2 días (con su respuesta, si es breve) y se olvidan las más antiguas
        const ahora = Date.now();
        alm.store.read('_solicitudes').filter((x) => !(x.t > ahora - 2 * 864e5)).forEach((x) => alm.store.remove('_solicitudes', x.id));
        const txt = JSON.stringify(r.data ?? null);
        alm.store.insert('_solicitudes', { id: idSol, t: ahora, resultado: txt.length < 20000 ? r.data ?? null : null });
      }
      const subidos = [];
      try {
        for (const s of arch.pendientes.subir) {
          const { error } = await supa.storage.from(BUCKET).upload(s.ruta, base64ABytes(s.base64), { contentType: s.mime, upsert: false });
          if (error) throw new Error('No se pudo guardar el comprobante: ' + error.message);
          subidos.push(s.ruta);
        }
        await guardarCambios(version, versionLimites, alm.cambios());
      } catch (e) {
        // solo si con seguridad no se guardó (conflicto o falla al subir) se borran los comprobantes subidos:
        // ante otro error el guardado pudo haber ocurrido y esos comprobantes ya estarían enlazados
        const noSeGuardo = e === CONFLICTO || /comprobante/.test(String(e && e.message));
        if (subidos.length && noSeGuardo) await supa.storage.from(BUCKET).remove(subidos).catch(() => {});
        if (e === CONFLICTO && intento < INTENTOS) { marca('reintento'); continue; } // alguien guardó antes: se repite con los datos nuevos
        throw e;
      }
      marca('guardado');
      if (arch.pendientes.borrar.length) await supa.storage.from(BUCKET).remove(arch.pendientes.borrar).catch(() => {});
      // getArchivo: Core devuelve una marca; aquí se entrega el archivo
      if (r.data && r.data.__descargar) {
        const info = arch.infoDe(r.data.__descargar);
        if (!info) return json({ ok: false, error: 'El comprobante ya no está disponible', code: 'ERR' }, 200, cabeceras());
        r = { ok: true, data: await descargar(info) };
      }
      return json(r, 200, cabeceras());
    }
    throw CONFLICTO;
  } catch (e) {
    console.error(action, e && e.stack ? e.stack : e);
    if (e === CONFLICTO || (e && e.ocupado)) return json({ ok: false, error: 'El sistema está ocupado en este momento. Espera unos segundos e intenta de nuevo (revisa antes si ya se guardó).', code: 'OCUPADO' }, 200, cabeceras());
    return json({ ok: false, error: 'Ocurrió un error inesperado. Intenta de nuevo en unos minutos.', code: 'ERR', detalle: Deno.env.get('TESO_DEBUG') === '1' ? String(e && e.message) : undefined }, 200, cabeceras());
  }
});
