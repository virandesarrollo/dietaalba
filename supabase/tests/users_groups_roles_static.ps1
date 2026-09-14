$ErrorActionPreference = 'Stop'
$migration = Get-Content -Raw (Join-Path $PSScriptRoot '..\migrations\202609140001_users_groups_roles.sql')
$rlsTest = Get-Content -Raw (Join-Path $PSScriptRoot 'users_groups_roles_rls.sql')

$required = @(
  'current_user_is_active', 'current_user_is_sudo', 'has_group_role', 'can_manage_plan',
  'invite_group_member', 'set_member_roles', 'disable_membership', 'set_user_active',
  'claim_pending_invitation', 'set_user_sudo',
  'list_manageable_patients', 'list_manageable_members', 'list_manageable_groups', 'save_daily_plan'
)
foreach ($name in $required) {
  if ($migration -notmatch "(?is)create or replace function public\.$name\b") {
    throw "Falta la función $name"
  }
}
if ($migration -notmatch "(?is)security definer\s+set search_path = ''") { throw 'Falta endurecimiento SECURITY DEFINER/search_path' }
if ($migration -notmatch '(?is)alter table public\.daily_plan enable row level security') { throw 'Falta RLS de daily_plan' }
if ($migration -notmatch '(?is)revoke all on function public\.current_user_is_active') { throw 'Falta revocar PUBLIC en helpers' }
if ($migration -notmatch '(?is)from pg_catalog\.pg_policies.+tablename = ''daily_plan''') { throw 'Falta retirada dinámica limitada a daily_plan' }
if ($migration -notmatch '(?is)lower\(btrim\(p_email\)\)') { throw 'Falta normalización del correo' }
if ($migration -match '(?is)invite_group_member.+?permission_audit_log.+?jsonb_build_object\([^;]*''email''') { throw 'La auditoría de invitación duplica el correo' }
if ($migration -notmatch '(?is)permission_audit_log') { throw 'Falta auditoría' }
if ($migration -notmatch '(?is)pg_advisory_xact_lock\(7375646, 1\).+count\(\*\).+is_sudo and is_active') { throw 'Falta serialización del último sudo' }
if ($migration -notmatch '(?is)claim_pending_invitation\(\)\s*returns boolean.+if v_membership_id is null then\s*return false;.+return true;') { throw 'claim_pending_invitation no usa el contrato booleano' }
if ($migration -match '(?is)memberships_scoped_read.+?create policy roles_authenticated_read.+has_group_role\(group_id, ''nutritionist''\)') { throw 'Nutritionist conserva lectura general de memberships' }
if ($migration -match '(?is)user_roles_scoped_read.+?create policy audit_sudo_read.+has_group_role\(gm\.group_id, ''nutritionist''\)') { throw 'Nutritionist conserva lectura general de roles' }
if ($migration -notmatch '(?is)revoke all on function public\.list_manageable_patients\(\) from public.+grant execute on function public\.list_manageable_patients\(\) to authenticated') { throw 'Faltan permisos endurecidos de list_manageable_patients' }
if ($migration -notmatch '(?is)revoke all on function public\.list_manageable_members\(\) from public.+grant execute on function public\.list_manageable_members\(\) to authenticated') { throw 'Faltan permisos endurecidos de list_manageable_members' }
if ($migration -notmatch '(?is)list_manageable_groups\(\).+current_user_is_sudo\(\).+has_group_role\(g\.id, ''group_admin''\)') { throw 'list_manageable_groups no limita los grupos al alcance administrable' }
if ($migration -notmatch '(?is)revoke all on function public\.list_manageable_groups\(\) from public.+grant execute on function public\.list_manageable_groups\(\) to authenticated') { throw 'Faltan permisos endurecidos de list_manageable_groups' }
if ($migration -notmatch '(?is)save_daily_plan\(\s*target_user uuid,\s*target_date date,\s*meals jsonb\s*\).+security definer\s+set search_path = ''''.+can_manage_plan\(target_user\).+jsonb_array_elements\(meals\).+for update.+revoke all on function public\.save_daily_plan\(uuid, date, jsonb\) from public.+grant execute on function public\.save_daily_plan\(uuid, date, jsonb\) to authenticated') { throw 'save_daily_plan no cumple el contrato atómico y seguro' }
if ($migration -notmatch '(?is)from pg_catalog\.pg_policies.+tablename = ''profiles''.+drop policy if exists %I on public\.profiles') { throw 'Falta retirar dinámicamente las policies de profiles' }
if ($migration -notmatch '(?is)profiles_scoped_read.+?current_user_is_active\(\).+?id = \(select auth\.uid\(\)\) or public\.current_user_is_sudo\(\)') { throw 'profiles permite un alcance mayor que propio/sudo' }
if ($migration -notmatch '(?is)set_member_roles\(p_membership_id uuid, p_roles text\[\]\).+?p_roles is null or cardinality\(p_roles\) = 0.+?delete from public\.user_roles') { throw 'set_member_roles no rechaza arrays NULL/vacíos antes de borrar' }
if ($migration -notmatch '(?is)disable_membership.+?not public\.current_user_is_sudo\(\).+?role_code not in \(''patient'', ''self_manager''\).+?permission_audit_log') { throw 'disable_membership no protege roles elevados' }
if ($migration -notmatch '(?is)set_user_sudo\(target_user uuid, sudo boolean\).+?security definer\s+set search_path = ''''.+?pg_advisory_xact_lock\(7375646, 1\).+?current_user_is_sudo\(\).+?target_user = v_actor.+?where id = target_user and is_active.+?count\(\*\).+?is_sudo and is_active.+?permission_audit_log') { throw 'set_user_sudo no cumple autorización/bloqueo/auditoría' }
if ($migration -notmatch '(?is)revoke all on function public\.set_user_sudo\(uuid, boolean\) from public.+grant execute on function public\.set_user_sudo\(uuid, boolean\) to authenticated') { throw 'Faltan permisos endurecidos de set_user_sudo' }
if ($migration -notmatch '(?is)list_manageable_members\(\)\s*returns table \(.+?is_sudo boolean,.+?is_active boolean.+?case when public\.current_user_is_sudo\(\) then p\.is_sudo else null end') { throw 'list_manageable_members no limita metadatos sudo' }
foreach ($policy in @('profiles_scoped_read', 'groups_scoped_read', 'memberships_scoped_read', 'roles_authenticated_read', 'user_roles_scoped_read', 'audit_sudo_read')) {
  if ($migration -notmatch "(?is)create policy $policy.+?current_user_is_active\(\)") {
    throw "La política $policy no exige usuario activo"
  }
}
if ($rlsTest -notmatch '(?is)^\s*begin;.+select plan\(15\).+select \* from finish\(\);\s*rollback;\s*$') { throw 'La prueba RLS no es transaccional o no finaliza pgTAP' }
foreach ($coverage in @('group_admin only lists its own group', 'group_admin cannot list members outside its group', 'group_admin cannot act on another group', 'group_admin cannot assign nutritionist', 'sudo manages identities in any group', 'sudo without a functional role cannot read another user daily plan')) {
  if ($rlsTest -notmatch [regex]::Escape($coverage)) { throw "Falta cobertura RLS: $coverage" }
}
foreach ($coverage in @('group_admin cannot disable a protected-role member', 'sudo can grant sudo to another active user', 'sudo can revoke sudo from another user', 'sudo cannot revoke its own last sudo privilege', 'self_manager can read its own daily plan', 'nutritionist cannot read a patient in another group')) {
  if ($rlsTest -notmatch [regex]::Escape($coverage)) { throw "Falta cobertura final RLS: $coverage" }
}

Write-Output 'Static migration checks passed'
