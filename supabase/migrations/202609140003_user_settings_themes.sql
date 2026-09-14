begin;

alter table public.features drop constraint if exists features_code_check;
alter table public.features add constraint features_code_check
  check (code in ('rate_recipes', 'send_report', 'access_settings', 'change_theme'));

insert into public.features (code, label)
values
  ('access_settings', 'Acceso a ajustes'),
  ('change_theme', 'Cambiar tema')
on conflict (code) do update
set label = excluded.label;

insert into public.membership_features (membership_id, feature_code)
select gm.id, f.code
from public.group_memberships gm
cross join public.features f
where gm.status = 'active'
  and f.code in ('access_settings', 'change_theme')
on conflict (membership_id, feature_code) do nothing;

create table public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  theme text not null default 'alba' check (theme in ('alba', 'dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_user_preferences_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_preferences_touch_updated_at
before update on public.user_preferences
for each row execute function public.touch_user_preferences_updated_at();

alter table public.user_preferences enable row level security;

create policy user_preferences_own_select
on public.user_preferences for select to authenticated
using (
  user_id = (select auth.uid())
  and public.current_user_is_active()
  and public.has_feature('access_settings')
);

create policy user_preferences_own_insert
on public.user_preferences for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.current_user_is_active()
  and public.has_feature('access_settings')
  and public.has_feature('change_theme')
);

create policy user_preferences_own_update
on public.user_preferences for update to authenticated
using (
  user_id = (select auth.uid())
  and public.current_user_is_active()
  and public.has_feature('access_settings')
  and public.has_feature('change_theme')
)
with check (
  user_id = (select auth.uid())
  and public.current_user_is_active()
  and public.has_feature('access_settings')
  and public.has_feature('change_theme')
);

revoke all on table public.user_preferences from public, anon, authenticated;
grant select, insert, update on table public.user_preferences to authenticated;

revoke all on function public.touch_user_preferences_updated_at() from public;

commit;
