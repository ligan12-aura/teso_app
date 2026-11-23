// Copia backend/Core.js como módulo para la función "api" de Supabase.
// Ejecutar antes de cada `supabase functions deploy api`: node scripts/supabase-core.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const raiz = new URL('..', import.meta.url);
const src = readFileSync(new URL('backend/Core.js', raiz), 'utf8');
writeFileSync(new URL('supabase/functions/api/core.js', raiz),
  '// GENERADO desde backend/Core.js por scripts/supabase-core.mjs: no editar aquí.\n' + src + '\nexport default TesoCore;\n');
console.log('core.js actualizado');
