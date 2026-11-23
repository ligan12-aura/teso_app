// Consulta de solo lectura a la base de Supabase con la sesión de la CLI (`supabase login`).
// Uso: node scripts/supabase-sql.mjs <project-ref> "select ..."
// Muestra solo conteos/resultados agregados que se pidan; no imprime la sesión.
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const [ref, query] = process.argv.slice(2);
if (!ref || !query) { console.error('Uso: node scripts/supabase-sql.mjs <ref> "<sql>"'); process.exit(1); }
if (!/^\s*(select|with)\b/i.test(query)) { console.error('Solo consultas de lectura (select)'); process.exit(1); }
const archivo = join(homedir(), '.supabase', 'access-token');
const token = process.env.SUPABASE_ACCESS_TOKEN || (existsSync(archivo) ? readFileSync(archivo, 'utf8').trim() : '');
if (!token) { console.error('No hay sesión de Supabase: ejecuta supabase login'); process.exit(1); }
const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, read_only: true })
});
const t = await r.text();
if (!r.ok) { console.error('Error ' + r.status + ': ' + t.slice(0, 300)); process.exit(1); }
const filas = JSON.parse(t);
console.table(filas);
