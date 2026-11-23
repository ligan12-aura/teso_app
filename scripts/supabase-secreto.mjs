// Crea la clave secreta del servidor (firma las sesiones) y la guarda en Supabase sin mostrarla.
// Uso: node scripts/supabase-secreto.mjs <project-ref>
// Ojo: cambiarla cierra todas las sesiones abiertas (cada usuario vuelve a ingresar).
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const ref = process.argv[2];
if (!ref) { console.error('Falta el project-ref'); process.exit(1); }
const secreto = randomBytes(48).toString('hex');
const r = spawnSync('npx', ['--yes', 'supabase@2.58.5', 'secrets', 'set', `TESO_SECRET=${secreto}`, '--project-ref', ref], { stdio: ['ignore', 'pipe', 'pipe'], shell: true });
const salida = (String(r.stdout) + String(r.stderr)).split(secreto).join('***');
console.log(salida.trim());
process.exit(r.status || 0);
