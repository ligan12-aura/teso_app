-- Contador de intentos de ingreso con su propia versión: varios intentos en paralelo se ordenan (ninguno
-- se pierde, así el bloqueo tras 5 fallos no se puede saltar), y un ingreso fallido no interrumpe a quien
-- está guardando datos de la app (cada grupo de filas tiene su versión).

alter table public.estado add column if not exists version_limites bigint not null default 0;

create or replace function public.teso_leer()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', (select version from public.estado where id = 1),
    'version_limites', (select version_limites from public.estado where id = 1),
    'filas', coalesce((select jsonb_agg(jsonb_build_object('tabla', f.tabla, 'datos', f.datos) order by f.n) from public.filas f), '[]'::jsonb)
  );
$$;

drop function if exists public.teso_guardar(bigint, jsonb, jsonb);

create or replace function public.teso_guardar(version_leida bigint, version_limites_leida bigint, guardar jsonb, borrar jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
set lock_timeout = '10s'
as $$
declare
  e public.estado%rowtype;
  toca_datos boolean;
  toca_limites boolean;
begin
  perform pg_advisory_xact_lock(4242);
  select * into e from public.estado where id = 1 for update;
  toca_limites := exists (select 1 from jsonb_array_elements(coalesce(guardar, '[]'::jsonb) || coalesce(borrar, '[]'::jsonb)) x where x->>'tabla' = '_limites');
  toca_datos := exists (select 1 from jsonb_array_elements(coalesce(guardar, '[]'::jsonb) || coalesce(borrar, '[]'::jsonb)) x where x->>'tabla' <> '_limites');
  if (toca_datos and version_leida is distinct from e.version) or (toca_limites and version_limites_leida is distinct from e.version_limites) then
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
  update public.estado
    set version = version + (case when toca_datos then 1 else 0 end),
        version_limites = version_limites + (case when toca_limites then 1 else 0 end)
    where id = 1;
  return e.version;
end;
$$;

revoke all on function public.teso_guardar(bigint, bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.teso_guardar(bigint, bigint, jsonb, jsonb) to service_role;
