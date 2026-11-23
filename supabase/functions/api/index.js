// Función "api" (Supabase Edge Function): reemplaza a Google Apps Script.
// Recibe las mismas consultas que antes ({ action, payload, token }) y corre la misma lógica (core.js,
// generado desde backend/Core.js con `node scripts/supabase-core.mjs`).
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { createHash, createHmac } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';
import TesoCore from './core.js';
import { crearAlmacen, crearLimites, crearArchivos } from './almacen.js';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL'), { prepare: false, max: 3, idle_timeout: 20 });
const supa = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const BUCKET = 'comprobantes';
const SECRETO = Deno.env.get('TESO_SECRET');
const SHEET_URL = Deno.env.get('SHEET_URL') || '';
const ZONA = 'America/Santiago';
// Ingreso con Google: ID de cliente OAuth (público). Con él configurado, la contraseña queda solo para el administrador.
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

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
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const base64ABytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
function bytesABase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// ¿la acción escribe? (las que escriben se hacen de a una, con un candado en la base de datos)
const coreInfo = TesoCore.create({ store: { read: () => [] }, files: {}, crypto: {}, uuid: () => '', now: () => '', today: hoy, secret: 'x' });

async function guardar(tx, { guardar, borrar }) {
  if (guardar.length) {
    await tx.unsafe(
      `insert into public.filas (tabla, id, datos)
       select x.tabla, x.id, x.datos from jsonb_to_recordset($1::jsonb) as x(tabla text, id text, datos jsonb)
       on conflict (tabla, id) do update set datos = excluded.datos, actualizado = now()`,
      [tx.json(guardar)]
    );
  }
  if (borrar.length) {
    await tx.unsafe(
      `delete from public.filas f using jsonb_to_recordset($1::jsonb) as x(tabla text, id text)
       where f.tabla = x.tabla and f.id = x.id`,
      [tx.json(borrar)]
    );
  }
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
  const escribe = coreInfo.isWrite(action);
  let porBorrar = [];
  const idg = action === 'loginGoogle' ? await identidadGoogle(body.payload && body.payload.credential) : null;
  if (action === 'loginGoogle' && !idg) return json({ ok: false, error: 'No se pudo verificar tu cuenta de Google. Intenta de nuevo.', code: 'ERR' });
  try {
    const respuesta = await sql.begin(async (tx) => {
      if (escribe) await tx`select pg_advisory_xact_lock(4242)`;
      const filas = await tx`select tabla, datos from public.filas order by n`;
      const alm = crearAlmacen(filas);
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
        soloGoogle: !!GOOGLE_CLIENT_ID,
        identidadGoogle: idg,
        extra: SHEET_URL ? { sheetUrl: SHEET_URL } : {}
      });
      let r = core.handle(action, body.payload || {}, body.token);
      if (!r.ok) {
        // un error no guarda nada, salvo el contador de intentos fallidos de ingreso
        await guardar(tx, alm.cambios(['_limites']));
        return r;
      }
      for (const s of arch.pendientes.subir) {
        const { error } = await supa.storage.from(BUCKET).upload(s.ruta, base64ABytes(s.base64), { contentType: s.mime, upsert: false });
        if (error) throw new Error('No se pudo guardar el comprobante: ' + error.message);
      }
      await guardar(tx, alm.cambios());
      porBorrar = arch.pendientes.borrar;
      // getArchivo: Core devuelve una marca; aquí se entrega el archivo
      if (r.data && r.data.__descargar) {
        const info = arch.infoDe(r.data.__descargar);
        if (!info) return { ok: false, error: 'El comprobante ya no está disponible', code: 'ERR' };
        r = { ok: true, data: await descargar(info) };
      }
      return r;
    });
    if (porBorrar.length) await supa.storage.from(BUCKET).remove(porBorrar).catch(() => {});
    return json(respuesta);
  } catch (e) {
    console.error(action, e && e.stack ? e.stack : e);
    return json({ ok: false, error: 'Ocurrió un error inesperado. Intenta de nuevo en unos minutos.', code: 'ERR', detalle: Deno.env.get('TESO_DEBUG') === '1' ? String(e && e.message) : undefined });
  }
});
