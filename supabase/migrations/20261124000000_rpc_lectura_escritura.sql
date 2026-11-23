-- Lectura y escritura de la app por funciones de la base de datos (llamadas por HTTP desde la función "api").
-- Reemplaza la conexión directa a Postgres, que dejaba colgadas algunas consultas en las Edge Functions.
-- Escrituras simultáneas: cada consulta lee la "versión" de los datos; al guardar, si alguien guardó antes
-- (la versión cambió), se rechaza con TESO_CONFLICTO y la función vuelve a intentar con los datos nuevos.

create table if not exists public.estado (
  id int primary key default 1 check (id = 1),
  version bigint not null default 0
);
insert into public.estado (id, version) values (1, 0) on conflict (id) do nothing;
alter table public.estado enable row level security;
revoke all on public.estado from anon, authenticated;

create or replace function public.teso_leer()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', (select version from public.estado where id = 1),
    'filas', coalesce((select jsonb_agg(jsonb_build_object('tabla', f.tabla, 'datos', f.datos) order by f.n) from public.filas f), '[]'::jsonb)
  );
$$;

create or replace function public.teso_guardar(version_leida bigint, guardar jsonb, borrar jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
set lock_timeout = '10s'
as $$
declare
  v bigint;
begin
  perform pg_advisory_xact_lock(4242);
  select e.version into v from public.estado e where e.id = 1 for update;
  if version_leida is not null and v <> version_leida then
    raise exception 'TESO_CONFLICTO';
  end if;
  if jsonb_array_length(coalesce(guardar, '[]'::jsonb)) > 0 then
    insert into public.filas (tabla, id, datos)
    select x.tabla, x.id, x.datos from jsonb_to_recordset(guardar) as x(tabla text, id text, datos jsonb)
    on conflict (tabla, id) do update set datos = excluded.datos, actualizado = now();
  end if;
  if jsonb_array_length(coalesce(borrar, '[]'::jsonb)) > 0 then
    delete from public.filas f using jsonb_to_recordset(borrar) as x(tabla text, id text)
    where f.tabla = x.tabla and f.id = x.id;
  end if;
  update public.estado set version = version + 1 where id = 1 returning version into v;
  return v;
end;
$$;

-- solo el servidor (clave de servicio) puede usarlas
revoke all on function public.teso_leer() from public, anon, authenticated;
revoke all on function public.teso_guardar(bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.teso_leer() to service_role;
grant execute on function public.teso_guardar(bigint, jsonb, jsonb) to service_role;
