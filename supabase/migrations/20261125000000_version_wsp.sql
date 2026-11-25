-- Las tablas internas de WhatsApp (_wsp, _wsp_resp, _wsp_auto) usan la misma versión que el contador de
-- intentos (_limites), no la de los datos de la app: un envío por WhatsApp o un aviso de Meta ya no obliga a
-- repetir lo que está guardando tesorería en ese momento (y viceversa).

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
  toca_limites := exists (select 1 from jsonb_array_elements(coalesce(guardar, '[]'::jsonb) || coalesce(borrar, '[]'::jsonb)) x
    where x->>'tabla' = '_limites' or left(x->>'tabla', 4) = '_wsp');
  toca_datos := exists (select 1 from jsonb_array_elements(coalesce(guardar, '[]'::jsonb) || coalesce(borrar, '[]'::jsonb)) x
    where x->>'tabla' <> '_limites' and left(x->>'tabla', 4) <> '_wsp');
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
