begin;

create table public.diet_import_confirmations (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  target_user uuid not null references public.profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  plan_hash text not null,
  delete_count integer not null,
  create_count integer not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

alter table public.diet_import_confirmations enable row level security;

create or replace function public.can_import_diet(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_is_active() and (
    exists (
      select 1
      from public.group_memberships own_gm
      join public.user_roles own_role on own_role.membership_id = own_gm.id
      where own_gm.user_id = (select auth.uid())
        and own_gm.status = 'active'
        and own_role.role_code = 'self_manager'
        and p_user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.group_memberships actor_gm
      join public.user_roles actor_role on actor_role.membership_id = actor_gm.id
      join public.group_memberships target_gm
        on target_gm.group_id = actor_gm.group_id
       and target_gm.user_id = p_user_id
      join public.user_roles target_role on target_role.membership_id = target_gm.id
      join public.profiles target_profile on target_profile.id = target_gm.user_id
      where actor_gm.user_id = (select auth.uid())
        and actor_gm.status = 'active'
        and actor_role.role_code = 'nutritionist'
        and target_gm.status = 'active'
        and target_role.role_code = 'patient'
        and target_profile.is_active
    )
  );
$$;

create or replace function public.diet_import_current_date()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (pg_catalog.now() at time zone 'Europe/Madrid')::date;
$$;

create or replace function public.validate_diet_import_plan(weekly_plan jsonb)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_day text;
  v_meal jsonb;
  v_seen text[];
  v_expected_days constant text[] := array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  v_expected_meals constant text[] := array['DESAYUNO','MEDIA MAÑANA','ALMUERZO','MERIENDA','CENA','POSTRE NOCTURNO'];
begin
  if pg_catalog.jsonb_typeof(weekly_plan) is distinct from 'object'
     or (select count(*) from pg_catalog.jsonb_object_keys(weekly_plan)) <> 7
     or exists (select 1 from pg_catalog.jsonb_object_keys(weekly_plan) k where k <> all(v_expected_days)) then
    raise exception using errcode = '22023', message = 'Plan semanal no válido';
  end if;
  foreach v_day in array v_expected_days loop
    if pg_catalog.jsonb_typeof(weekly_plan -> v_day) is distinct from 'array'
       or pg_catalog.jsonb_array_length(weekly_plan -> v_day) <> 6 then
      raise exception using errcode = '22023', message = 'Plan semanal no válido';
    end if;
    v_seen := array[]::text[];
    for v_meal in select value from pg_catalog.jsonb_array_elements(weekly_plan -> v_day)
    loop
      if pg_catalog.jsonb_typeof(v_meal) is distinct from 'object'
         or (select count(*) from pg_catalog.jsonb_object_keys(v_meal)) <> 4
         or exists (select 1 from pg_catalog.jsonb_object_keys(v_meal) k where k not in ('meal_type','title','ingredients','recipe_url'))
         or pg_catalog.jsonb_typeof(v_meal -> 'meal_type') is distinct from 'string'
         or pg_catalog.jsonb_typeof(v_meal -> 'title') is distinct from 'string'
         or pg_catalog.jsonb_typeof(v_meal -> 'ingredients') is distinct from 'string'
         or pg_catalog.jsonb_typeof(v_meal -> 'recipe_url') is distinct from 'string'
         or (v_meal ->> 'meal_type') <> all(v_expected_meals)
         or (v_meal ->> 'meal_type') = any(v_seen)
         or pg_catalog.length(v_meal ->> 'title') > 200
         or pg_catalog.length(v_meal ->> 'ingredients') > 5000
         or pg_catalog.length(v_meal ->> 'recipe_url') > 2048
         or ((v_meal ->> 'recipe_url') <> '' and (v_meal ->> 'recipe_url') !~* '^https?://[[:alnum:]]([[:alnum:]-]{0,61}[[:alnum:]])?(\.[[:alnum:]]([[:alnum:]-]{0,61}[[:alnum:]])?)*([/?#][^[:space:][:cntrl:]]*)?$') then
        raise exception using errcode = '22023', message = 'Contenido de comida no válido';
      end if;
      v_seen := pg_catalog.array_append(v_seen, v_meal ->> 'meal_type');
    end loop;
  end loop;
end;
$$;

create or replace function public.prepare_diet_import(
  target_user uuid,
  start_date date,
  weekly_plan jsonb
)
returns table(token uuid, end_date date, delete_count integer, create_count integer, expires_at timestamptz, plan_hash text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_plan_hash text;
begin
  if target_user is null then
    raise exception using errcode = '42501', message = 'Operación no autorizada';
  end if;
  -- Lock order shared by identity and plan mutations: identity global, target, table.
  perform pg_catalog.pg_advisory_xact_lock(7375646, 1);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_user::text, 0));

  if not public.current_user_is_active()
     or not public.can_import_diet(target_user)
     or not exists (select 1 from public.profiles p where p.id = target_user and p.is_active) then
    raise exception using errcode = '42501', message = 'Operación no autorizada';
  end if;
  if start_date is null or start_date < public.diet_import_current_date() then
    raise exception using errcode = '22023', message = 'La fecha inicial no puede estar en el pasado';
  end if;
  perform public.validate_diet_import_plan(weekly_plan);
  v_plan_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(weekly_plan::text, 'UTF8'), 'sha256'), 'hex');

  return query
  with bounds as (
    select (start_date + interval '3 months')::date - interval '1 day' as import_end
  ), counts as (
    select count(*)::integer as rows_to_delete
    from public.daily_plan dp
    where dp.user_id = target_user and dp.date >= start_date
  ), inserted as (
    insert into public.diet_import_confirmations
      (actor_id, target_user, start_date, end_date, plan_hash, delete_count, create_count, expires_at)
    select v_actor, target_user, start_date, b.import_end::date, v_plan_hash, c.rows_to_delete,
           ((b.import_end::date - start_date + 1) * 6)::integer,
           pg_catalog.now() + interval '15 minutes'
    from bounds b cross join counts c
    returning id, diet_import_confirmations.end_date, diet_import_confirmations.delete_count,
              diet_import_confirmations.create_count, diet_import_confirmations.expires_at,
              diet_import_confirmations.plan_hash
  )
  select i.id, i.end_date, i.delete_count, i.create_count, i.expires_at, i.plan_hash from inserted i;
end;
$$;

create or replace function public.apply_diet_import(
  confirmation_token uuid,
  plan_hash text,
  weekly_plan jsonb,
  confirmed boolean
)
returns table(start_date date, end_date date, deleted_count integer, inserted_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_confirmation public.diet_import_confirmations%rowtype;
  v_day text;
  v_meal jsonb;
  v_seen text[];
  v_deleted integer;
  v_inserted integer;
  v_current_delete_count integer;
  v_payload_hash text;
  v_expected_days constant text[] := array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  v_expected_meals constant text[] := array['DESAYUNO','MEDIA MAÑANA','ALMUERZO','MERIENDA','CENA','POSTRE NOCTURNO'];
begin
  select c.* into v_confirmation
  from public.diet_import_confirmations c
  where c.id = confirmation_token
  for update;

  if not found or v_confirmation.actor_id is distinct from v_actor then
    raise exception using errcode = '42501', message = 'Operación no autorizada';
  end if;
  if v_confirmation.used_at is not null then
    raise exception using errcode = '22023', message = 'La confirmación ya fue utilizada';
  end if;
  if v_confirmation.expires_at <= pg_catalog.now() then
    raise exception using errcode = '22023', message = 'La confirmación ha caducado';
  end if;
  if confirmed is distinct from true then
    raise exception using errcode = '22023', message = 'Debe confirmar la sustitución';
  end if;
  perform public.validate_diet_import_plan(weekly_plan);
  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(weekly_plan::text, 'UTF8'), 'sha256'), 'hex');
  if plan_hash is null
     or v_payload_hash is distinct from v_confirmation.plan_hash
     or v_payload_hash is distinct from lower(plan_hash) then
    raise exception using errcode = '22023', message = 'La confirmación no corresponde al plan revisado';
  end if;
  -- Keep this order stable to avoid deadlocks with identity and plan writers.
  perform pg_catalog.pg_advisory_xact_lock(7375646, 1);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_confirmation.target_user::text, 0));

  if v_confirmation.start_date < public.diet_import_current_date() then
    raise exception using errcode = '22023', message = 'La fecha inicial no puede estar en el pasado';
  end if;
  if not public.current_user_is_active()
     or not public.can_import_diet(v_confirmation.target_user)
     or not exists (select 1 from public.profiles p where p.id = v_confirmation.target_user and p.is_active) then
    raise exception using errcode = '42501', message = 'Operación no autorizada';
  end if;

  lock table public.daily_plan in share row exclusive mode;
  select count(*)::integer into v_current_delete_count
  from public.daily_plan dp
  where dp.user_id = v_confirmation.target_user
    and dp.date >= v_confirmation.start_date;
  if v_current_delete_count is distinct from v_confirmation.delete_count then
    raise exception using errcode = '22023', message = 'El plan futuro ha cambiado; prepare de nuevo';
  end if;

  delete from public.daily_plan
  where user_id = v_confirmation.target_user
    and date >= v_confirmation.start_date;
  get diagnostics v_deleted = row_count;

  insert into public.daily_plan (user_id, date, meal_type, title, ingredients, recipe_url, is_completed)
  select v_confirmation.target_user, calendar.day::date, meal.value ->> 'meal_type',
         meal.value ->> 'title', meal.value ->> 'ingredients',
         nullif(meal.value ->> 'recipe_url', ''), false
  from pg_catalog.generate_series(v_confirmation.start_date, v_confirmation.end_date, interval '1 day') calendar(day)
  cross join lateral pg_catalog.jsonb_array_elements(
    weekly_plan -> v_expected_days[pg_catalog.date_part('isodow', calendar.day)::integer]
  ) meal(value);
  get diagnostics v_inserted = row_count;

  update public.diet_import_confirmations
  set used_at = pg_catalog.now()
  where id = confirmation_token;

  start_date := v_confirmation.start_date;
  end_date := v_confirmation.end_date;
  deleted_count := v_deleted;
  inserted_count := v_inserted;
  return next;
end;
$$;

revoke all on table public.diet_import_confirmations from public;
revoke all on function public.can_import_diet(uuid) from public;
revoke all on function public.diet_import_current_date() from public;
revoke all on function public.validate_diet_import_plan(jsonb) from public;
revoke all on function public.prepare_diet_import(uuid, date, jsonb) from public;
revoke all on function public.apply_diet_import(uuid, text, jsonb, boolean) from public;
grant execute on function public.prepare_diet_import(uuid, date, jsonb) to authenticated;
grant execute on function public.apply_diet_import(uuid, text, jsonb, boolean) to authenticated;
grant execute on function public.diet_import_current_date() to authenticated;

commit;
