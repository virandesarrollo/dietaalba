create type public.membership_status as enum ('pending', 'active', 'disabled');

alter table public.profiles
  add column if not exists is_sudo boolean not null default false,
  add column if not exists is_active boolean not null default true;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  user_id uuid references public.profiles(id),
  invited_email text,
  status public.membership_status not null default 'pending',
  invited_by uuid references public.profiles(id),
  invited_at timestamptz not null default now(),
  activated_at timestamptz,
  disabled_at timestamptz,
  check (
    invited_email is null
    or (
      invited_email = lower(btrim(invited_email))
      and invited_email <> ''
    )
  ),
  check ((user_id is null) = (invited_email is not null)),
  check (
    (
      status = 'pending'
      and user_id is null
      and activated_at is null
      and disabled_at is null
    )
    or (
      status = 'active'
      and user_id is not null
      and activated_at is not null
      and disabled_at is null
    )
    or (
      status = 'disabled'
      and disabled_at is not null
      and (
        (user_id is null and activated_at is null)
        or (user_id is not null and activated_at is not null)
      )
    )
  )
);

create unique index one_active_group_per_user
  on public.group_memberships(user_id)
  where status = 'active';

create unique index one_pending_invitation_per_group_email
  on public.group_memberships(group_id, lower(btrim(invited_email)))
  where status = 'pending';

create table public.roles (
  code text primary key
    check (code in ('patient', 'self_manager', 'nutritionist', 'group_admin')),
  label text not null
);

insert into public.roles (code, label)
values
  ('patient', 'Paciente'),
  ('self_manager', 'Autogestión'),
  ('nutritionist', 'Nutricionista'),
  ('group_admin', 'Administrador de grupo')
on conflict (code) do update
set label = excluded.label;

create table public.user_roles (
  membership_id uuid not null references public.group_memberships(id) on delete cascade,
  role_code text not null references public.roles(code),
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  primary key (membership_id, role_code)
);

create table public.permission_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  target_type text not null,
  target_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
declare
  enredaos_id uuid;
begin
  if (select count(*) from public.profiles where role = 'nutritionist') <> 1 then
    raise exception 'La migración inicial exige exactamente un nutritionist existente';
  end if;

  insert into public.groups (name, slug)
  values ('Enredaos', 'enredaos')
  on conflict (slug) do update
  set name = excluded.name
  returning id into enredaos_id;

  if exists (
    select 1
    from public.group_memberships gm
    join public.groups g on g.id = gm.group_id
    join public.profiles p on p.id = gm.user_id
    where gm.status = 'active'
      and g.id <> enredaos_id
  ) then
    raise exception 'Hay perfiles con una membresía activa fuera de Enredaos';
  end if;

  if exists (
    select 1
    from public.group_memberships gm
    join public.profiles p on p.id = gm.user_id
    where gm.group_id = enredaos_id
    group by gm.user_id
    having count(*) > 1
  ) then
    raise exception 'Hay perfiles con más de una membresía en Enredaos';
  end if;

  update public.group_memberships gm
  set status = 'active',
      invited_email = null,
      activated_at = coalesce(gm.activated_at, now()),
      disabled_at = null
  from public.profiles p
  where gm.group_id = enredaos_id
    and gm.user_id = p.id;

  insert into public.group_memberships (group_id, user_id, status, activated_at)
  select enredaos_id, p.id, 'active', now()
  from public.profiles p
  where not exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = enredaos_id
      and gm.user_id = p.id
  );

  insert into public.user_roles (membership_id, role_code)
  select
    gm.id,
    case when p.role = 'nutritionist' then 'nutritionist' else 'patient' end
  from public.group_memberships gm
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = enredaos_id
    and gm.status = 'active'
  on conflict do nothing;

  insert into public.user_roles (membership_id, role_code)
  select gm.id, 'patient'
  from public.group_memberships gm
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = enredaos_id
    and gm.status = 'active'
    and p.role = 'nutritionist'
  on conflict do nothing;

  update public.profiles
  set is_sudo = true
  where role = 'nutritionist';
end
$$;

-- Helpers used by RLS deliberately bypass table policies. They are owned by the
-- migration owner and expose only booleans, never rows.
create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active
  );
$$;

create or replace function public.current_user_is_sudo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active and p.is_sudo
  );
$$;

create or replace function public.has_group_role(p_group_id uuid, p_role_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_is_active() and exists (
    select 1
    from public.group_memberships gm
    join public.user_roles ur on ur.membership_id = gm.id
    where gm.group_id = p_group_id
      and gm.user_id = (select auth.uid())
      and gm.status = 'active'
      and ur.role_code = p_role_code
  );
$$;

create or replace function public.can_manage_plan(p_user_id uuid)
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
      join public.user_roles own_ur on own_ur.membership_id = own_gm.id
      where own_gm.user_id = (select auth.uid())
        and own_gm.status = 'active'
        and p_user_id = (select auth.uid())
        and own_ur.role_code in ('patient', 'self_manager')
    )
    or exists (
      select 1
      from public.group_memberships actor_gm
      join public.user_roles actor_role on actor_role.membership_id = actor_gm.id
      join public.group_memberships target_gm
        on target_gm.group_id = actor_gm.group_id and target_gm.user_id = p_user_id
      join public.user_roles target_role on target_role.membership_id = target_gm.id
      where actor_gm.user_id = (select auth.uid())
        and actor_gm.status = 'active'
        and target_gm.status = 'active'
        and actor_role.role_code = 'nutritionist'
        and target_role.role_code = 'patient'
    )
  );
$$;

revoke all on function public.current_user_is_active() from public;
revoke all on function public.current_user_is_sudo() from public;
revoke all on function public.has_group_role(uuid, text) from public;
revoke all on function public.can_manage_plan(uuid) from public;
grant execute on function public.current_user_is_active() to authenticated;
grant execute on function public.current_user_is_sudo() to authenticated;
grant execute on function public.has_group_role(uuid, text) to authenticated;
grant execute on function public.can_manage_plan(uuid) to authenticated;

create or replace function public.invite_group_member(
  p_group_id uuid,
  p_email text,
  p_roles text[] default array['patient']::text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_email text := lower(btrim(p_email));
  v_membership_id uuid;
  v_role text;
begin
  if not public.current_user_is_active() or v_email = '' or v_email is null then
    raise exception 'Operación no autorizada';
  end if;
  if not public.current_user_is_sudo() then
    if not public.has_group_role(p_group_id, 'group_admin')
       or exists (select 1 from unnest(p_roles) r where r not in ('patient', 'self_manager')) then
      raise exception 'Operación no autorizada';
    end if;
  end if;
  if p_roles is null or cardinality(p_roles) = 0
     or exists (select 1 from unnest(p_roles) r left join public.roles x on x.code = r where x.code is null) then
    raise exception 'Roles no válidos';
  end if;

  insert into public.group_memberships (group_id, invited_email, status, invited_by)
  values (p_group_id, v_email, 'pending', v_actor)
  returning id into v_membership_id;

  foreach v_role in array p_roles loop
    insert into public.user_roles (membership_id, role_code, assigned_by)
    values (v_membership_id, v_role, v_actor) on conflict do nothing;
  end loop;
  insert into public.permission_audit_log(actor_id, action, target_type, target_id, details)
  values (v_actor, 'invite_group_member', 'group_membership', v_membership_id::text,
          jsonb_build_object('roles', p_roles));
  return v_membership_id;
end;
$$;

create or replace function public.set_member_roles(p_membership_id uuid, p_roles text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_group_id uuid;
  v_user_id uuid;
  v_role text;
begin
  select gm.group_id, gm.user_id into v_group_id, v_user_id
  from public.group_memberships gm where gm.id = p_membership_id for update;
  if v_group_id is null or not public.current_user_is_active() or v_user_id = v_actor then
    raise exception 'Operación no autorizada';
  end if;
  if p_roles is null or cardinality(p_roles) = 0
     or exists (select 1 from unnest(p_roles) r left join public.roles x on x.code = r where x.code is null) then
    raise exception 'Roles no válidos';
  end if;
  if not public.current_user_is_sudo() and (
    not public.has_group_role(v_group_id, 'group_admin')
    or exists (select 1 from unnest(p_roles) r where r not in ('patient', 'self_manager'))
  ) then
    raise exception 'Operación no autorizada';
  end if;

  if public.current_user_is_sudo() then
    delete from public.user_roles where membership_id = p_membership_id;
  else
    delete from public.user_roles
    where membership_id = p_membership_id and role_code in ('patient', 'self_manager');
  end if;
  foreach v_role in array p_roles loop
    insert into public.user_roles (membership_id, role_code, assigned_by)
    values (p_membership_id, v_role, v_actor) on conflict do nothing;
  end loop;
  insert into public.permission_audit_log(actor_id, action, target_type, target_id, details)
  values (v_actor, 'set_member_roles', 'group_membership', p_membership_id::text,
          jsonb_build_object('roles', p_roles));
end;
$$;

create or replace function public.disable_membership(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_group_id uuid;
  v_user_id uuid;
begin
  select gm.group_id, gm.user_id into v_group_id, v_user_id
  from public.group_memberships gm where gm.id = p_membership_id for update;
  if v_group_id is null or not public.current_user_is_active() or v_user_id = v_actor
     or (
       not public.current_user_is_sudo() and (
         not public.has_group_role(v_group_id, 'group_admin')
         or exists (
           select 1 from public.user_roles ur
           where ur.membership_id = p_membership_id
             and ur.role_code not in ('patient', 'self_manager')
         )
       )
     ) then
    raise exception 'Operación no autorizada';
  end if;
  update public.group_memberships
  set status = 'disabled', disabled_at = now()
  where id = p_membership_id and status in ('pending', 'active');
  if not found then raise exception 'Operación no disponible'; end if;
  insert into public.permission_audit_log(actor_id, action, target_type, target_id)
  values (v_actor, 'disable_membership', 'group_membership', p_membership_id::text);
end;
$$;

create or replace function public.set_user_sudo(target_user uuid, sudo boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  perform pg_catalog.pg_advisory_xact_lock(7375646, 1);
  if not public.current_user_is_sudo() or target_user = v_actor then
    raise exception 'Operación no autorizada';
  end if;
  perform 1
  from public.profiles
  where id = target_user and is_active
  for update;
  if not found then raise exception 'Operación no disponible'; end if;
  if not sudo
     and exists (select 1 from public.profiles where id = target_user and is_sudo)
     and (select count(*) from public.profiles where is_sudo and is_active) <= 1 then
    raise exception 'No se puede retirar el último sudo activo';
  end if;
  update public.profiles set is_sudo = sudo where id = target_user;
  insert into public.permission_audit_log(actor_id, action, target_type, target_id, details)
  values (v_actor, 'set_user_sudo', 'profile', target_user::text,
          jsonb_build_object('is_sudo', sudo));
end;
$$;

create or replace function public.set_user_active(p_user_id uuid, p_is_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  -- Serializa todas las transiciones que podrían cambiar el conjunto de sudo
  -- activos, incluso cuando apuntan a usuarios distintos.
  perform pg_catalog.pg_advisory_xact_lock(7375646, 1);
  if not public.current_user_is_sudo() or p_user_id = v_actor then
    raise exception 'Operación no autorizada';
  end if;
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Operación no disponible'; end if;
  if not p_is_active and exists (select 1 from public.profiles where id = p_user_id and is_sudo)
     and (select count(*) from public.profiles where is_sudo and is_active) <= 1 then
    raise exception 'No se puede desactivar el último sudo activo';
  end if;
  update public.profiles set is_active = p_is_active where id = p_user_id;
  insert into public.permission_audit_log(actor_id, action, target_type, target_id, details)
  values (v_actor, 'set_user_active', 'profile', p_user_id::text,
          jsonb_build_object('is_active', p_is_active));
end;
$$;

create or replace function public.claim_pending_invitation()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_email text := lower(btrim(auth.jwt() ->> 'email'));
  v_membership_id uuid;
begin
  if v_actor is null or v_email is null or v_email = '' or not public.current_user_is_active() then
    raise exception 'Invitación no disponible';
  end if;
  select gm.id into v_membership_id
  from public.group_memberships gm
  where gm.status = 'pending' and gm.invited_email = v_email
  order by gm.invited_at
  limit 1 for update skip locked;
  if v_membership_id is null then
    return false;
  end if;
  if exists (select 1 from public.group_memberships where user_id = v_actor and status = 'active') then
    raise exception 'Invitación no disponible';
  end if;
  update public.group_memberships
  set user_id = v_actor, invited_email = null, status = 'active', activated_at = now()
  where id = v_membership_id and status = 'pending';
  insert into public.permission_audit_log(actor_id, action, target_type, target_id)
  values (v_actor, 'claim_pending_invitation', 'group_membership', v_membership_id::text);
  return true;
end;
$$;

create or replace function public.list_manageable_patients()
returns table (id uuid, email text, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct p.id, p.email, p.full_name
  from public.group_memberships actor_gm
  join public.user_roles actor_role on actor_role.membership_id = actor_gm.id
  join public.group_memberships patient_gm
    on patient_gm.group_id = actor_gm.group_id and patient_gm.status = 'active'
  join public.user_roles patient_role
    on patient_role.membership_id = patient_gm.id and patient_role.role_code = 'patient'
  join public.profiles p on p.id = patient_gm.user_id and p.is_active
  where actor_gm.user_id = (select auth.uid())
    and actor_gm.status = 'active'
    and actor_role.role_code = 'nutritionist'
    and public.current_user_is_active();
$$;

create or replace function public.list_manageable_members()
returns table (
  membership_id uuid,
  user_id uuid,
  email text,
  full_name text,
  status public.membership_status,
  roles text[],
  group_id uuid,
  group_name text,
  is_sudo boolean,
  is_active boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    gm.id,
    gm.user_id,
    coalesce(p.email, gm.invited_email),
    p.full_name,
    gm.status,
    coalesce(array_agg(ur.role_code order by ur.role_code) filter (where ur.role_code is not null), '{}'::text[]),
    gm.group_id,
    g.name,
    case when public.current_user_is_sudo() then p.is_sudo else null end,
    case when public.current_user_is_sudo() then p.is_active else null end
  from public.group_memberships gm
  join public.groups g on g.id = gm.group_id
  left join public.profiles p on p.id = gm.user_id
  left join public.user_roles ur on ur.membership_id = gm.id
  where public.current_user_is_active()
    and (
      public.current_user_is_sudo()
      or public.has_group_role(gm.group_id, 'group_admin')
    )
  group by gm.id, gm.user_id, p.email, gm.invited_email, p.full_name, gm.status,
           gm.group_id, g.name, p.is_sudo, p.is_active;
$$;

create or replace function public.list_manageable_groups()
returns table (id uuid, name text, slug text)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.name, g.slug
  from public.groups g
  where public.current_user_is_active()
    and (
      public.current_user_is_sudo()
      or public.has_group_role(g.id, 'group_admin')
    )
  order by g.name, g.id;
$$;

create or replace function public.save_daily_plan(
  target_user uuid,
  target_date date,
  meals jsonb
)
returns table (id text, meal_type text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meal jsonb;
  v_meal_type text;
  v_title text;
  v_ingredients text;
  v_is_completed boolean;
  v_seen text[] := array[]::text[];
  v_existing_id text;
  v_existing_count integer;
  v_saved_id text;
begin
  if not public.current_user_is_active()
     or not public.can_manage_plan(target_user) then
    raise exception using errcode = '42501', message = 'No autorizado para guardar este plan';
  end if;
  if target_user is null or target_date is null
     or jsonb_typeof(meals) is distinct from 'array'
     or jsonb_array_length(meals) not between 1 and 6 then
    raise exception using errcode = '22023', message = 'Plan no válido';
  end if;

  -- También serializa el caso sin filas previas, que un FOR UPDATE no puede bloquear.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_user::text || ':' || target_date::text, 0)
  );

  for v_meal in select value from pg_catalog.jsonb_array_elements(meals)
  loop
    if pg_catalog.jsonb_typeof(v_meal) is distinct from 'object'
       or pg_catalog.jsonb_typeof(v_meal -> 'meal_type') is distinct from 'string'
       or pg_catalog.jsonb_typeof(v_meal -> 'title') is distinct from 'string'
       or pg_catalog.jsonb_typeof(v_meal -> 'ingredients') is distinct from 'string'
       or pg_catalog.jsonb_typeof(v_meal -> 'is_completed') is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'Comida no válida';
    end if;

    v_meal_type := v_meal ->> 'meal_type';
    v_title := v_meal ->> 'title';
    v_ingredients := v_meal ->> 'ingredients';
    v_is_completed := (v_meal ->> 'is_completed')::boolean;

    if v_meal_type not in (
         'DESAYUNO', 'MEDIA MAÑANA', 'ALMUERZO', 'MERIENDA', 'CENA', 'POSTRE NOCTURNO'
       )
       or v_meal_type = any(v_seen)
       or pg_catalog.length(v_title) > 200
       or pg_catalog.length(v_ingredients) > 5000 then
      raise exception using errcode = '22023', message = 'Contenido de comida no válido';
    end if;
    v_seen := pg_catalog.array_append(v_seen, v_meal_type);

    v_existing_count := 0;
    v_existing_id := null;
    for v_saved_id in
      select dp.id::text
      from public.daily_plan dp
      where dp.user_id = target_user
        and dp.date = target_date
        and dp.meal_type = v_meal_type
      for update
    loop
      v_existing_count := v_existing_count + 1;
      v_existing_id := v_saved_id;
    end loop;

    if v_existing_count > 1 then
      raise exception using errcode = '21000', message = 'Plan diario inconsistente';
    elsif v_existing_count = 1 then
      update public.daily_plan dp
      set title = v_title,
          ingredients = v_ingredients,
          is_completed = v_is_completed
      where dp.id::text = v_existing_id
      returning dp.id::text into v_saved_id;
    else
      insert into public.daily_plan (user_id, date, meal_type, title, ingredients, is_completed)
      values (target_user, target_date, v_meal_type, v_title, v_ingredients, v_is_completed)
      returning daily_plan.id::text into v_saved_id;
    end if;

    id := v_saved_id;
    meal_type := v_meal_type;
    return next;
  end loop;
end;
$$;

revoke all on function public.invite_group_member(uuid, text, text[]) from public;
revoke all on function public.set_member_roles(uuid, text[]) from public;
revoke all on function public.disable_membership(uuid) from public;
revoke all on function public.set_user_active(uuid, boolean) from public;
revoke all on function public.set_user_sudo(uuid, boolean) from public;
revoke all on function public.claim_pending_invitation() from public;
revoke all on function public.list_manageable_patients() from public;
revoke all on function public.list_manageable_members() from public;
revoke all on function public.list_manageable_groups() from public;
revoke all on function public.save_daily_plan(uuid, date, jsonb) from public;
grant execute on function public.invite_group_member(uuid, text, text[]) to authenticated;
grant execute on function public.set_member_roles(uuid, text[]) to authenticated;
grant execute on function public.disable_membership(uuid) to authenticated;
grant execute on function public.set_user_active(uuid, boolean) to authenticated;
grant execute on function public.set_user_sudo(uuid, boolean) to authenticated;
grant execute on function public.claim_pending_invitation() to authenticated;
grant execute on function public.list_manageable_patients() to authenticated;
grant execute on function public.list_manageable_members() to authenticated;
grant execute on function public.list_manageable_groups() to authenticated;
grant execute on function public.save_daily_plan(uuid, date, jsonb) to authenticated;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_memberships enable row level security;
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.permission_audit_log enable row level security;
alter table public.daily_plan enable row level security;

-- Identity tables are read-only through the API; all mutations go through RPCs.
do $profiles_policy_cleanup$
declare v_policy record;
begin
  for v_policy in
    select policyname from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', v_policy.policyname);
  end loop;
end
$profiles_policy_cleanup$;

create policy profiles_scoped_read on public.profiles for select to authenticated using (
  public.current_user_is_active()
  and (id = (select auth.uid()) or public.current_user_is_sudo())
);
create policy groups_scoped_read on public.groups for select to authenticated using (
  public.current_user_is_active() and (public.current_user_is_sudo() or exists (
    select 1 from public.group_memberships gm
    where gm.group_id = groups.id and gm.user_id = (select auth.uid()) and gm.status = 'active'
  ))
);
create policy memberships_scoped_read on public.group_memberships for select to authenticated using (
  public.current_user_is_active() and (
    public.current_user_is_sudo() or user_id = (select auth.uid())
    or public.has_group_role(group_id, 'group_admin')
  )
);
create policy roles_authenticated_read on public.roles for select to authenticated using (public.current_user_is_active());
create policy user_roles_scoped_read on public.user_roles for select to authenticated using (
  public.current_user_is_active() and exists (
    select 1 from public.group_memberships gm where gm.id = user_roles.membership_id and (
      public.current_user_is_sudo() or gm.user_id = (select auth.uid())
      or public.has_group_role(gm.group_id, 'group_admin')
    )
  )
);
create policy audit_sudo_read on public.permission_audit_log for select to authenticated using (
  public.current_user_is_active() and public.current_user_is_sudo()
);

do $policy_cleanup$
declare v_policy record;
begin
  for v_policy in
    select policyname from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'daily_plan'
  loop
    execute format('drop policy if exists %I on public.daily_plan', v_policy.policyname);
  end loop;
end
$policy_cleanup$;

create policy daily_plan_scoped_select on public.daily_plan for select to authenticated
using (public.can_manage_plan(user_id));
create policy daily_plan_scoped_insert on public.daily_plan for insert to authenticated
with check (public.can_manage_plan(user_id));
create policy daily_plan_scoped_update on public.daily_plan for update to authenticated
using (public.can_manage_plan(user_id)) with check (public.can_manage_plan(user_id));
create policy daily_plan_scoped_delete on public.daily_plan for delete to authenticated
using (public.can_manage_plan(user_id));
