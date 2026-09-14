begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'admin-a@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'member-a@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'member-b@example.test'),
  ('10000000-0000-0000-0000-000000000004', 'sudo@example.test');

insert into public.profiles (id, email, full_name, role, is_sudo, is_active)
values
  ('10000000-0000-0000-0000-000000000001', 'admin-a@example.test', 'Admin A', 'patient', false, true),
  ('10000000-0000-0000-0000-000000000002', 'member-a@example.test', 'Member A', 'patient', false, true),
  ('10000000-0000-0000-0000-000000000003', 'member-b@example.test', 'Member B', 'patient', false, true),
  ('10000000-0000-0000-0000-000000000004', 'sudo@example.test', 'Sudo', 'patient', true, true);

insert into public.groups (id, name, slug)
values
  ('20000000-0000-0000-0000-000000000001', 'Group A', 'rls-group-a'),
  ('20000000-0000-0000-0000-000000000002', 'Group B', 'rls-group-b');

insert into public.group_memberships (id, group_id, user_id, status, activated_at)
values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'active', now()),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'active', now()),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'active', now());

insert into public.user_roles (membership_id, role_code)
values
  ('30000000-0000-0000-0000-000000000001', 'group_admin'),
  ('30000000-0000-0000-0000-000000000001', 'self_manager'),
  ('30000000-0000-0000-0000-000000000002', 'patient'),
  ('30000000-0000-0000-0000-000000000002', 'nutritionist'),
  ('30000000-0000-0000-0000-000000000003', 'patient');

insert into public.daily_plan (user_id, date, meal_type, title, ingredients, is_completed)
values
  ('10000000-0000-0000-0000-000000000003', current_date, 'DESAYUNO', 'Private B', '', false),
  ('10000000-0000-0000-0000-000000000001', current_date, 'DESAYUNO', 'Own A', '', false);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","email":"admin-a@example.test"}', true);

select results_eq(
  $$ select count(*)::bigint from public.list_manageable_groups() $$,
  $$ values (1::bigint) $$,
  'group_admin only lists its own group'
);
select results_eq(
  $$ select count(*)::bigint from public.list_manageable_members() where group_id = '20000000-0000-0000-0000-000000000002' $$,
  $$ values (0::bigint) $$,
  'group_admin cannot list members outside its group'
);
select throws_ok(
  $$ select public.set_member_roles('30000000-0000-0000-0000-000000000003', array['patient']) $$,
  'P0001', 'Operación no autorizada',
  'group_admin cannot act on another group'
);
select throws_ok(
  $$ select public.set_member_roles('30000000-0000-0000-0000-000000000002', array['nutritionist']) $$,
  'P0001', 'Operación no autorizada',
  'group_admin cannot assign nutritionist'
);
select throws_ok(
  $$ select public.disable_membership('30000000-0000-0000-0000-000000000002') $$,
  'P0001', 'Operación no autorizada',
  'group_admin cannot disable a protected-role member'
);
select results_eq(
  $$ select count(*)::bigint from public.daily_plan where user_id = '10000000-0000-0000-0000-000000000001' $$,
  $$ values (1::bigint) $$,
  'self_manager can read its own daily plan'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","email":"member-a@example.test"}', true);
select results_eq(
  $$ select count(*)::bigint from public.daily_plan where user_id = '10000000-0000-0000-0000-000000000003' $$,
  $$ values (0::bigint) $$,
  'nutritionist cannot read a patient in another group'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated","email":"sudo@example.test"}', true);
select results_eq(
  $$ select count(*)::bigint from public.list_manageable_groups() where slug like 'rls-group-%' $$,
  $$ values (2::bigint) $$,
  'sudo lists all fixture groups'
);
select lives_ok(
  $$ select public.set_member_roles('30000000-0000-0000-0000-000000000003', array['patient', 'nutritionist']) $$,
  'sudo manages identities in any group'
);
select lives_ok(
  $$ select public.set_user_sudo('10000000-0000-0000-0000-000000000003', true) $$,
  'sudo can grant sudo to another active user'
);
select results_eq(
  $$ select is_sudo from public.profiles where id = '10000000-0000-0000-0000-000000000003' $$,
  $$ values (true) $$,
  'sudo grant is persisted'
);
select lives_ok(
  $$ select public.set_user_sudo('10000000-0000-0000-0000-000000000003', false) $$,
  'sudo can revoke sudo from another user'
);
select results_eq(
  $$ select is_sudo from public.profiles where id = '10000000-0000-0000-0000-000000000003' $$,
  $$ values (false) $$,
  'sudo revoke is persisted'
);
select throws_ok(
  $$ select public.set_user_sudo('10000000-0000-0000-0000-000000000004', false) $$,
  'P0001', 'Operación no autorizada',
  'sudo cannot revoke its own last sudo privilege'
);
select results_eq(
  $$ select count(*)::bigint from public.daily_plan where user_id = '10000000-0000-0000-0000-000000000003' $$,
  $$ values (0::bigint) $$,
  'sudo without a functional role cannot read another user daily plan'
);

select * from finish();
rollback;
