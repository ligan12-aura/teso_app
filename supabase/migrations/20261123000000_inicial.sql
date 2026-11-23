-- Tesorería · Iglesia Bautista El Redentor
-- Todas las tablas de la app (las mismas hojas que tenía la planilla de Google) viven en una sola tabla:
-- una fila por registro, con sus datos en JSON. La lógica (permisos, validaciones, confidencialidad)
-- sigue en backend/Core.js, que corre en la función "api" del servidor.
create table if not exists public.filas (
  n bigint generated always as identity,         -- orden de llegada (como las filas de la planilla)
  tabla text not null,
  id text not null,
  datos jsonb not null,
  actualizado timestamptz not null default now(),
  primary key (tabla, id)
);
create index if not exists filas_orden on public.filas (n);

-- Nadie entra directo desde internet: sin políticas, solo el servidor (conexión de la función y la
-- clave de servicio, que nunca va en la página) puede leer o escribir.
alter table public.filas enable row level security;
revoke all on public.filas from anon, authenticated;

-- Comprobantes (fotos de boletas y transferencias): privados, solo los entrega la función "api"
-- (el tipo de archivo, imagen o PDF, lo valida Core.js)
insert into storage.buckets (id, name, public, file_size_limit)
values ('comprobantes', 'comprobantes', false, 10485760)
on conflict (id) do nothing;
