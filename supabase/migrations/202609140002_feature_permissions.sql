begin;

create table public.features (
  code text primary key
    check (code in ('rate_recipes', 'send_report')),
  label text not null
);

create table public.membership_features (
  membership_id uuid not null references public.group_memberships(id) on delete cascade,
  feature_code text not null references public.features(code),
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  primary key (membership_id, feature_code)
);

insert into public.features (code, label)
values
  ('rate_recipes', 'Valorar recetas'),
  ('send_report', 'Enviar informe')
on conflict (code) do update
set label = excluded.label;

do $$
declare
  v_active_memberships integer;
  v_active_profiles integer;
  v_active_sudos integer;
  v_group_id uuid;
  v_sudo_membership_id uuid;
  v_sudo_profile_id uuid;
  v_non_sudo_membership_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(7375646, 1);

  select g.id
  into v_group_id
  from public.groups g
  where g.slug = 'enredaos'
  for update;

  if v_group_id is null then
    raise exception 'No existe el grupo Enredaos';
  end if;

  perform 1
  from public.group_memberships gm
  where gm.group_id = v_group_id
    and gm.status = 'active'
  order by gm.id
  for update of gm;

  perform 1
  from public.profiles p
  join public.group_memberships gm on gm.user_id = p.id
  where gm.group_id = v_group_id
    and gm.status = 'active'
  order by p.id
  for update of p;

  select count(*)
  into v_active_memberships
  from public.group_memberships gm
  join public.groups g on g.id = gm.group_id
  where g.slug = 'enredaos'
    and gm.status = 'active';

  if v_active_memberships <> 2 then
    raise exception 'La migración exige exactamente dos membresías activas en Enredaos';
  end if;

  select
    count(*),
    count(*) filter (where p.is_sudo)
  into
    v_active_profiles,
    v_active_sudos
  from public.group_memberships gm
  join public.groups g on g.id = gm.group_id
  join public.profiles p on p.id = gm.user_id
  where g.slug = 'enredaos'
    and gm.status = 'active'
    and p.is_active;

  if v_active_profiles <> 2
     or v_active_sudos <> 1
     or (select count(*) filter (where not p.is_sudo)
         from public.group_memberships gm
         join public.groups g on g.id = gm.group_id
         join public.profiles p on p.id = gm.user_id
         where g.slug = 'enredaos'
           and gm.status = 'active'
           and p.is_active) <> 1
     or (select count(*) from public.profiles p where p.is_sudo and p.is_active) <> 1
  then
    raise exception 'No se puede identificar inequívocamente a Andrés y Alba en Enredaos';
  end if;

  select gm.id, p.id
  into v_sudo_membership_id, v_sudo_profile_id
  from public.group_memberships gm
  join public.groups g on g.id = gm.group_id
  join public.profiles p on p.id = gm.user_id
  where g.slug = 'enredaos'
    and gm.status = 'active'
    and p.is_active
    and p.is_sudo;

  select gm.id
  into v_non_sudo_membership_id
  from public.group_memberships gm
  join public.groups g on g.id = gm.group_id
  join public.profiles p on p.id = gm.user_id
  where g.slug = 'enredaos'
    and gm.status = 'active'
    and p.is_active
    and not p.is_sudo;

  delete from public.membership_features
  where membership_id = v_sudo_membership_id;

  insert into public.membership_features (membership_id, feature_code, assigned_by)
  select v_non_sudo_membership_id, code, v_sudo_profile_id
  from public.features
  where code in ('rate_recipes', 'send_report')
  on conflict (membership_id, feature_code) do nothing;
end
$$;

create or replace function public.has_feature(p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_is_active() and exists (
    select 1
    from public.group_memberships gm
    join public.membership_features mf on mf.membership_id = gm.id
    where gm.user_id = (select auth.uid())
      and gm.status = 'active'
      and mf.feature_code = p_feature
  );
$$;

create or replace function public.get_my_features()
returns table(feature_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select mf.feature_code
  from public.group_memberships gm
  join public.membership_features mf on mf.membership_id = gm.id
  where public.current_user_is_active()
    and gm.user_id = (select auth.uid())
    and gm.status = 'active'
  order by mf.feature_code;
$$;

create or replace function public.set_member_features(
  p_membership_id uuid,
  p_features text[]
)
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
  select gm.group_id, gm.user_id
  into v_group_id, v_user_id
  from public.group_memberships gm
  where gm.id = p_membership_id
  for update;

  if v_group_id is null
     or not public.current_user_is_active()
     or v_user_id = v_actor
     or (
       not public.current_user_is_sudo()
       and not public.has_group_role(v_group_id, 'group_admin')
     ) then
    raise exception 'Operación no autorizada';
  end if;
  if p_features is null
     or (
       select count(*) <> count(distinct requested.feature_code)
       from unnest(p_features) requested(feature_code)
     )
     or exists (
       select 1
       from unnest(p_features) requested(feature_code)
       left join public.features available on available.code = requested.feature_code
       where available.code is null
     ) then
    raise exception 'Funcionalidades no válidas';
  end if;

  delete from public.membership_features
  where membership_id = p_membership_id;
  insert into public.membership_features (membership_id, feature_code, assigned_by)
  select p_membership_id, requested.feature_code, v_actor
  from unnest(p_features) requested(feature_code);

  insert into public.permission_audit_log(actor_id, action, target_type, target_id, details)
  values (
    v_actor,
    'set_member_features',
    'group_membership',
    p_membership_id::text,
    pg_catalog.jsonb_build_object('features', p_features)
  );
end;
$$;

create or replace function public.invite_group_member_with_features(
  p_group_id uuid,
  p_email text,
  p_roles text[],
  p_features text[]
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
begin
  if not public.current_user_is_active() or v_email is null or v_email = '' then
    raise exception 'Operación no autorizada';
  end if;
  if p_roles is null or cardinality(p_roles) = 0
     or exists (
       select 1 from unnest(p_roles) requested(role_code)
       left join public.roles available on available.code = requested.role_code
       where available.code is null
     ) then
    raise exception 'Roles no válidos';
  end if;
  if not public.current_user_is_sudo() and (
    not public.has_group_role(p_group_id, 'group_admin')
    or exists (
      select 1 from unnest(p_roles) requested(role_code)
      where requested.role_code not in ('patient', 'self_manager')
    )
  ) then
    raise exception 'Operación no autorizada';
  end if;
  if p_features is null
     or (
       select count(*) <> count(distinct requested.feature_code)
       from unnest(p_features) requested(feature_code)
     )
     or exists (
       select 1 from unnest(p_features) requested(feature_code)
       left join public.features available on available.code = requested.feature_code
       where available.code is null
     ) then
    raise exception 'Funcionalidades no válidas';
  end if;

  insert into public.group_memberships (group_id, invited_email, status, invited_by)
  values (p_group_id, v_email, 'pending', v_actor)
  returning id into v_membership_id;
  insert into public.user_roles (membership_id, role_code, assigned_by)
  select v_membership_id, requested.role_code, v_actor
  from unnest(p_roles) requested(role_code)
  on conflict do nothing;
  insert into public.membership_features (membership_id, feature_code, assigned_by)
  select v_membership_id, requested.feature_code, v_actor
  from unnest(p_features) requested(feature_code);
  insert into public.permission_audit_log(actor_id, action, target_type, target_id, details)
  values (
    v_actor,
    'invite_group_member_with_features',
    'group_membership',
    v_membership_id::text,
    pg_catalog.jsonb_build_object('roles', p_roles, 'features', p_features)
  );
  return v_membership_id;
end;
$$;

drop function public.list_manageable_members();
create function public.list_manageable_members()
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
  is_active boolean,
  features text[]
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
    coalesce((
      select array_agg(ur.role_code order by ur.role_code)
      from public.user_roles ur where ur.membership_id = gm.id
    ), '{}'::text[]),
    gm.group_id,
    g.name,
    case when public.current_user_is_sudo() then p.is_sudo else null end,
    case when public.current_user_is_sudo() then p.is_active else null end,
    coalesce((
      select array_agg(mf.feature_code order by mf.feature_code)
      from public.membership_features mf where mf.membership_id = gm.id
    ), '{}'::text[])
  from public.group_memberships gm
  join public.groups g on g.id = gm.group_id
  left join public.profiles p on p.id = gm.user_id
  where public.current_user_is_active()
    and (
      public.current_user_is_sudo()
      or public.has_group_role(gm.group_id, 'group_admin')
    );
$$;

alter table public.features enable row level security;
alter table public.membership_features enable row level security;
alter table public.recipe_reviews enable row level security;

create policy features_active_read on public.features for select to authenticated
using (public.current_user_is_active());
create policy membership_features_scoped_read on public.membership_features for select to authenticated
using (
  public.current_user_is_active() and exists (
    select 1 from public.group_memberships gm
    where gm.id = membership_features.membership_id
      and (
        gm.user_id = (select auth.uid())
        or public.current_user_is_sudo()
        or public.has_group_role(gm.group_id, 'group_admin')
      )
  )
);

do $recipe_reviews_policy_cleanup$
declare v_policy record;
begin
  for v_policy in
    select policyname from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'recipe_reviews'
  loop
    execute format('drop policy if exists %I on public.recipe_reviews', v_policy.policyname);
  end loop;
end
$recipe_reviews_policy_cleanup$;

create policy recipe_reviews_feature_select on public.recipe_reviews for select to authenticated
using (
  user_id = (select auth.uid())
  and (public.has_feature('rate_recipes') or public.has_feature('send_report'))
);
create policy recipe_reviews_feature_insert on public.recipe_reviews for insert to authenticated
with check (user_id = (select auth.uid()) and public.has_feature('rate_recipes'));
create policy recipe_reviews_feature_update on public.recipe_reviews for update to authenticated
using (user_id = (select auth.uid()) and public.has_feature('rate_recipes'))
with check (user_id = (select auth.uid()) and public.has_feature('rate_recipes'));
create policy recipe_reviews_feature_delete on public.recipe_reviews for delete to authenticated
using (user_id = (select auth.uid()) and public.has_feature('rate_recipes'));

revoke all on table public.features from public, anon, authenticated;
revoke all on table public.membership_features from public, anon, authenticated;
grant select on table public.features to authenticated;
grant select on table public.membership_features to authenticated;

revoke all on function public.has_feature(text) from public;
revoke all on function public.get_my_features() from public;
revoke all on function public.set_member_features(uuid, text[]) from public;
revoke all on function public.invite_group_member_with_features(uuid, text, text[], text[]) from public;
revoke all on function public.list_manageable_members() from public;
grant execute on function public.has_feature(text) to authenticated;
grant execute on function public.get_my_features() to authenticated;
grant execute on function public.set_member_features(uuid, text[]) to authenticated;
grant execute on function public.invite_group_member_with_features(uuid, text, text[], text[]) to authenticated;
grant execute on function public.list_manageable_members() to authenticated;

commit;
