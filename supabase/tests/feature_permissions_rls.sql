begin;

create extension if not exists pgtap with schema extensions;
select plan(40);

-- These assertions exercise the deployed fixture data built below while every
-- mutation remains inside this transaction. UUIDs use a separate test range.
insert into auth.users (id, email) values
  ('41000000-0000-0000-0000-000000000001', 'feature-admin-a@example.test'),
  ('41000000-0000-0000-0000-000000000002', 'feature-member-a@example.test'),
  ('41000000-0000-0000-0000-000000000003', 'feature-member-b@example.test'),
  ('41000000-0000-0000-0000-000000000004', 'feature-sudo@example.test');

insert into public.profiles (id, email, full_name, role, is_sudo, is_active) values
  ('41000000-0000-0000-0000-000000000001', 'feature-admin-a@example.test', 'Feature Admin A', 'patient', false, true),
  ('41000000-0000-0000-0000-000000000002', 'feature-member-a@example.test', 'Feature Member A', 'patient', false, true),
  ('41000000-0000-0000-0000-000000000003', 'feature-member-b@example.test', 'Feature Member B', 'patient', false, true),
  ('41000000-0000-0000-0000-000000000004', 'feature-sudo@example.test', 'Feature Sudo', 'patient', true, true);

insert into public.groups (id, name, slug) values
  ('42000000-0000-0000-0000-000000000001', 'Feature Group A', 'feature-rls-a'),
  ('42000000-0000-0000-0000-000000000002', 'Feature Group B', 'feature-rls-b');

insert into public.group_memberships (id, group_id, user_id, status, activated_at) values
  ('43000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'active', now()),
  ('43000000-0000-0000-0000-000000000002', '42000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000002', 'active', now()),
  ('43000000-0000-0000-0000-000000000003', '42000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000003', 'active', now());

insert into public.user_roles (membership_id, role_code) values
  ('43000000-0000-0000-0000-000000000001', 'group_admin'),
  ('43000000-0000-0000-0000-000000000002', 'nutritionist'),
  ('43000000-0000-0000-0000-000000000003', 'patient');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq($$ select count(*)::bigint from public.recipe_reviews $$, $$ values (0::bigint) $$, 'without features cannot read own reviews');
select throws_ok($$ insert into public.recipe_reviews (user_id, recipe_title, rating, notes) values ('41000000-0000-0000-0000-000000000002', 'No feature', 5, '') $$, '42501', null, 'without features cannot write own reviews');

reset role;
insert into public.membership_features (membership_id, feature_code) values ('43000000-0000-0000-0000-000000000002', 'rate_recipes');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok($$ insert into public.recipe_reviews (user_id, recipe_title, rating, notes) values ('41000000-0000-0000-0000-000000000002', 'Rate own', 4, 'own') $$, 'rate_recipes allows own CRUD');
select results_eq($$ select count(*)::bigint from public.recipe_reviews where recipe_title = 'Rate own' $$, $$ values (1::bigint) $$, 'rate_recipes reads own reviews');
select lives_ok($$ update public.recipe_reviews set rating = 5 where recipe_title = 'Rate own' $$, 'rate_recipes updates own reviews');

reset role;
insert into public.recipe_reviews (user_id, recipe_title, rating, notes) values ('41000000-0000-0000-0000-000000000003', 'Other review', 3, 'private');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq($$ select count(*)::bigint from public.recipe_reviews where recipe_title = 'Other review' $$, $$ values (0::bigint) $$, 'rate_recipes cannot read another review');
select throws_ok($$ insert into public.recipe_reviews (user_id, recipe_title, rating, notes) values ('41000000-0000-0000-0000-000000000003', 'Alien insert', 1, '') $$, '42501', null, 'rate_recipes cannot insert another review');
select results_eq($$ update public.recipe_reviews set rating = 1 where recipe_title = 'Other review' returning rating $$, $$ select 1 where false $$, 'rate_recipes cannot update another review');
select results_eq($$ delete from public.recipe_reviews where recipe_title = 'Other review' returning recipe_title $$, $$ select null::text where false $$, 'rate_recipes cannot delete another review');
select lives_ok($$ delete from public.recipe_reviews where recipe_title = 'Rate own' $$, 'rate_recipes deletes own reviews');

reset role;
delete from public.membership_features where membership_id = '43000000-0000-0000-0000-000000000002';
insert into public.membership_features (membership_id, feature_code) values ('43000000-0000-0000-0000-000000000002', 'send_report');
insert into public.recipe_reviews (user_id, recipe_title, rating, notes) values ('41000000-0000-0000-0000-000000000002', 'Report own', 5, 'report');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq($$ select count(*)::bigint from public.recipe_reviews where recipe_title = 'Report own' $$, $$ values (1::bigint) $$, 'send_report only allows own reads');
select throws_ok($$ insert into public.recipe_reviews (user_id, recipe_title, rating, notes) values ('41000000-0000-0000-0000-000000000002', 'Report write', 2, '') $$, '42501', null, 'send_report cannot insert reviews');
select results_eq($$ update public.recipe_reviews set rating = 1 where recipe_title = 'Report own' returning rating $$, $$ select 1 where false $$, 'send_report cannot update reviews');
select results_eq($$ delete from public.recipe_reviews where recipe_title = 'Report own' returning recipe_title $$, $$ select null::text where false $$, 'send_report cannot delete reviews');
select ok(not public.has_feature('rate_recipes'), 'roles do not imply features');

reset role;
insert into public.membership_features (membership_id, feature_code) values ('43000000-0000-0000-0000-000000000002', 'rate_recipes');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq($$ select feature_code from public.get_my_features() $$, $$ values ('rate_recipes'::text), ('send_report'::text) $$, 'both features are returned in stable order');
select lives_ok($$ update public.recipe_reviews set rating = 4 where recipe_title = 'Report own' $$, 'both features preserve write capability');

select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.set_member_features('43000000-0000-0000-0000-000000000003', array['rate_recipes']) $$, 'P0001', 'Operación no autorizada', 'group_admin cannot assign outside its group');
select throws_ok($$ select public.set_member_features('43000000-0000-0000-0000-000000000001', array['rate_recipes']) $$, 'P0001', 'Operación no autorizada', 'group_admin cannot edit own features');
select lives_ok($$ select public.set_member_features('43000000-0000-0000-0000-000000000002', array['rate_recipes']) $$, 'group_admin assigns member features');
select results_eq(
  $$ select distinct assigned_by from public.membership_features where membership_id = '43000000-0000-0000-0000-000000000002' $$,
  $$ values ('41000000-0000-0000-0000-000000000001'::uuid) $$,
  'set_member_features records assigning actor'
);
select lives_ok($$ select public.set_member_features('43000000-0000-0000-0000-000000000002', array[]::text[]) $$, 'empty feature list removes all features');
select throws_ok($$ select public.set_member_features('43000000-0000-0000-0000-000000000002', array['rate_recipes', 'rate_recipes']) $$, 'P0001', 'Funcionalidades no válidas', 'duplicate features are rejected');
select throws_ok($$ select public.set_member_features('43000000-0000-0000-0000-000000000002', null::text[]) $$, 'P0001', 'Funcionalidades no válidas', 'null member features are rejected');
select throws_ok($$ select public.set_member_features('43000000-0000-0000-0000-000000000002', array['unknown_feature']) $$, 'P0001', 'Funcionalidades no válidas', 'unknown member features are rejected');
select throws_ok($$ select public.invite_group_member_with_features('42000000-0000-0000-0000-000000000001', 'null-features@example.test', array['patient'], null::text[]) $$, 'P0001', 'Funcionalidades no válidas', 'invitation rejects null features');
select throws_ok($$ select public.invite_group_member_with_features('42000000-0000-0000-0000-000000000001', 'duplicate-features@example.test', array['patient'], array['rate_recipes', 'rate_recipes']) $$, 'P0001', 'Funcionalidades no válidas', 'invitation rejects duplicate features');
select throws_ok($$ select public.invite_group_member_with_features('42000000-0000-0000-0000-000000000001', 'unknown-features@example.test', array['patient'], array['unknown_feature']) $$, 'P0001', 'Funcionalidades no válidas', 'invitation rejects unknown features');
select throws_ok($$ select public.invite_group_member_with_features('42000000-0000-0000-0000-000000000001', 'invalid-role@example.test', array['unknown_role'], array['rate_recipes']) $$, 'P0001', 'Roles no válidos', 'invitation rejects invalid roles');
select throws_ok($$ select public.invite_group_member_with_features('42000000-0000-0000-0000-000000000001', 'null-roles@example.test', null::text[], array['rate_recipes']) $$, 'P0001', 'Roles no válidos', 'invitation rejects null roles');
select throws_ok($$ select public.invite_group_member_with_features('42000000-0000-0000-0000-000000000001', 'empty-roles@example.test', array[]::text[], array['rate_recipes']) $$, 'P0001', 'Roles no válidos', 'invitation rejects empty roles');

reset role;
create temporary table feature_atomic_baseline as
select count(*)::bigint as audit_count
from public.permission_audit_log
where action = 'invite_group_member_with_features';
create function pg_temp.reject_atomic_feature_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.group_memberships gm
    where gm.id = new.membership_id
      and gm.invited_email = 'atomic-fail@example.test'
  ) then
    raise exception using errcode = 'P0001', message = 'Atomic feature failure';
  end if;
  return new;
end;
$$;
create trigger feature_atomic_failure
before insert on public.membership_features
for each row execute function pg_temp.reject_atomic_feature_insert();
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.invite_group_member_with_features('42000000-0000-0000-0000-000000000001', 'atomic-fail@example.test', array['patient'], array['rate_recipes']) $$, 'P0001', 'Atomic feature failure', 'feature insert failure aborts invitation atomically');
reset role;
select results_eq(
  $$ select count(*)::bigint from public.group_memberships where invited_email = 'atomic-fail@example.test' $$,
  $$ values (0::bigint) $$,
  'failed invitation leaves no membership'
);
select results_eq(
  $$ select count(*)::bigint from public.user_roles ur join public.group_memberships gm on gm.id = ur.membership_id where gm.invited_email = 'atomic-fail@example.test' $$,
  $$ values (0::bigint) $$,
  'failed invitation leaves no user roles'
);
select results_eq(
  $$ select count(*)::bigint from public.membership_features mf join public.group_memberships gm on gm.id = mf.membership_id where gm.invited_email = 'atomic-fail@example.test' $$,
  $$ values (0::bigint) $$,
  'failed invitation leaves no membership features'
);
select results_eq(
  $$ select count(*)::bigint from public.permission_audit_log where action = 'invite_group_member_with_features' $$,
  $$ select audit_count from feature_atomic_baseline $$,
  'failed invitation leaves no audit entry'
);
drop trigger feature_atomic_failure on public.membership_features;
drop function pg_temp.reject_atomic_feature_insert();
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select public.invite_group_member_with_features('42000000-0000-0000-0000-000000000001', 'atomic@example.test', array['patient'], array['rate_recipes', 'send_report']) $$, 'invitation stores roles and features atomically');
select results_eq(
  $$ select distinct mf.assigned_by from public.membership_features mf join public.group_memberships gm on gm.id = mf.membership_id where gm.invited_email = 'atomic@example.test' $$,
  $$ values ('41000000-0000-0000-0000-000000000001'::uuid) $$,
  'invitation features record assigning actor'
);
select results_eq(
  $$ select count(*)::bigint from public.list_manageable_members() where email = 'atomic@example.test' and roles = array['patient']::text[] and features = array['rate_recipes', 'send_report']::text[] $$,
  $$ values (1::bigint) $$,
  'manageable listing returns invitation features'
);

select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select results_eq($$ select count(*)::bigint from public.recipe_reviews $$, $$ values (0::bigint) $$, 'sudo without features cannot read recipe reviews');

select * from finish();
rollback;
