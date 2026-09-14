$ErrorActionPreference = 'Stop'
$migration = Get-Content -Raw (Join-Path $PSScriptRoot '..\migrations\202609140001_users_groups_roles.sql')
$featureMigrationPath = Join-Path $PSScriptRoot '..\migrations\202609140002_feature_permissions.sql'
$featureMigration = if (Test-Path -LiteralPath $featureMigrationPath) {
  Get-Content -Raw -LiteralPath $featureMigrationPath
} else {
  ''
}
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

if ($featureMigration -notmatch '(?is)^\s*begin\s*;.+commit\s*;\s*$') { throw 'La migración de funcionalidades no es transaccional' }
if ($featureMigration -notmatch "(?is)create table public\.features\s*\(.+code text primary key\s+check\s*\(code in \('rate_recipes', 'send_report'\)\).+label text not null") { throw 'Falta el catálogo features o su CHECK de códigos permitidos' }
if ($featureMigration -notmatch '(?is)create table public\.membership_features\s*\(.+membership_id uuid not null references public\.group_memberships\(id\) on delete cascade.+feature_code text not null references public\.features\(code\).+assigned_by uuid references public\.profiles\(id\).+assigned_at timestamptz not null default now\(\).+primary key\s*\(membership_id, feature_code\)') { throw 'Falta la relación membership_features o su trazabilidad' }
foreach ($feature in @('rate_recipes', 'send_report')) {
  if ($featureMigration -notmatch [regex]::Escape("('$feature'")) { throw "Falta la funcionalidad $feature" }
}
if ($featureMigration -notmatch "(?is)select count\(\*\).+where g\.slug = 'enredaos'.+gm\.status = 'active'.+v_active_memberships <> 2") { throw 'Falta exigir exactamente dos membresías activas en Enredaos' }
if ($featureMigration -notmatch "(?is)perform 1.+from public\.group_memberships gm.+where gm\.group_id = v_group_id.+gm\.status = 'active'.+for update of gm.+select count\(\*\)") { throw 'Falta bloquear las membresías activas de Enredaos antes de validarlas' }
if ($featureMigration -notmatch "(?is)do \$\$.+perform pg_catalog\.pg_advisory_xact_lock\(7375646, 1\).+select g\.id.+into v_group_id.+where g\.slug = 'enredaos'.+for update.+from public\.group_memberships gm.+where gm\.group_id = v_group_id.+order by gm\.id.+for update of gm.+from public\.profiles p.+order by p\.id.+for update of p.+select count\(\*\)") { throw 'Falta el orden de bloqueos advisory/grupo/membresías/perfiles previo a validar' }
if ($featureMigration -notmatch '(?is)count\(\*\) filter \(where p\.is_sudo\).+<> 1') { throw 'Falta exigir un único sudo activo en Enredaos' }
if ($featureMigration -notmatch '(?is)count\(\*\) filter \(where not p\.is_sudo\).+<> 1') { throw 'Falta exigir una única membresía no sudo en Enredaos' }
if ($featureMigration -notmatch '(?is)delete from public\.membership_features.+membership_id = v_sudo_membership_id') { throw 'Falta dejar al sudo inicial sin funcionalidades' }
if ($featureMigration -notmatch "(?is)select gm\.id, p\.id\s+into v_sudo_membership_id, v_sudo_profile_id.+insert into public\.membership_features \(membership_id, feature_code, assigned_by\).+select v_non_sudo_membership_id, code, v_sudo_profile_id.+from public\.features.+where code in \('rate_recipes', 'send_report'\)") { throw 'Falta asignar ambas funcionalidades a Alba con actor sudo' }
$featureRlsTestPath = Join-Path $PSScriptRoot 'feature_permissions_rls.sql'
if (-not (Test-Path -LiteralPath $featureRlsTestPath)) { throw 'Falta la matriz pgTAP de funcionalidades' }
$featureRlsTest = Get-Content -Raw -LiteralPath $featureRlsTestPath
foreach ($name in @('has_feature', 'get_my_features', 'set_member_features', 'invite_group_member_with_features', 'list_manageable_members')) {
  if ($featureMigration -notmatch "(?is)(create or replace|create) function public\.$name\b") { throw "Falta la función $name de Task 2" }
}
if ($featureMigration -notmatch "(?is)has_feature\(p_feature text\).+security definer\s+set search_path = ''") { throw 'has_feature no está endurecida' }
if ($featureMigration -notmatch "(?is)get_my_features\(\).+security definer\s+set search_path = ''") { throw 'get_my_features no está endurecida' }
if ($featureMigration -notmatch '(?is)set_member_features.+p_features is null.+count\(\*\) <> count\(distinct.+left join public\.features.+delete from public\.membership_features.+permission_audit_log') { throw 'set_member_features no valida/reemplaza/audita correctamente' }
if ($featureMigration -notmatch '(?is)invite_group_member_with_features.+p_roles is null.+group_admin.+p_features is null.+insert into public\.group_memberships.+insert into public\.user_roles.+insert into public\.membership_features.+permission_audit_log') { throw 'La invitación con funcionalidades no es completa' }
if ($featureMigration -notmatch '(?is)list_manageable_members\(\)\s*returns table \(.+is_active boolean,.+features text\[\]') { throw 'El listado gestionable no añade features conservando columnas' }
if ($featureMigration -notmatch "(?is)from pg_catalog\.pg_policies.+tablename = 'recipe_reviews'.+drop policy if exists %I on public\.recipe_reviews") { throw 'Falta limpiar solo las policies de recipe_reviews' }
foreach ($policy in @('recipe_reviews_feature_select', 'recipe_reviews_feature_insert', 'recipe_reviews_feature_update', 'recipe_reviews_feature_delete')) {
  if ($featureMigration -notmatch "(?is)create policy $policy") { throw "Falta la policy $policy" }
}
if ($featureMigration -notmatch "(?is)recipe_reviews_feature_select.+user_id = \(select auth\.uid\(\)\).+has_feature\('rate_recipes'\).+has_feature\('send_report'\)") { throw 'La lectura de valoraciones no exige propiedad y permiso' }
if ($featureMigration -notmatch '(?is)alter table public\.features enable row level security.+alter table public\.membership_features enable row level security') { throw 'Falta RLS en tablas de funcionalidades' }
if ($featureMigration -notmatch '(?is)revoke all on function public\.set_member_features\(uuid, text\[\]\) from public.+grant execute on function public\.set_member_features\(uuid, text\[\]\) to authenticated') { throw 'Faltan grants restringidos de set_member_features' }
if ($featureMigration -notmatch '(?is)set_member_features.+insert into public\.membership_features \(membership_id, feature_code, assigned_by\).+select p_membership_id, requested\.feature_code, v_actor') { throw 'set_member_features no registra el actor por funcionalidad' }
if ($featureMigration -notmatch '(?is)invite_group_member_with_features.+insert into public\.membership_features \(membership_id, feature_code, assigned_by\).+select v_membership_id, requested\.feature_code, v_actor') { throw 'invite_group_member_with_features no registra el actor por funcionalidad' }
if ($featureRlsTest -notmatch '(?is)^\s*begin;.+select plan\(40\).+select \* from finish\(\);\s*rollback;\s*$') { throw 'La matriz de funcionalidades no es transaccional o no contiene 40 pruebas' }
if ($featureRlsTest -notmatch "(?is)create function pg_temp\.reject_atomic_feature_insert\(\).+invited_email = 'atomic-fail@example\.test'.+create trigger feature_atomic_failure.+before insert on public\.membership_features.+invite_group_member_with_features\(.+?'atomic-fail@example\.test'.+?array\['patient'\].+?array\['rate_recipes'\].+drop trigger feature_atomic_failure on public\.membership_features.+drop function pg_temp\.reject_atomic_feature_insert\(\)") { throw 'La prueba atómica no falla después de crear membresía y roles o no limpia el trigger' }
foreach ($coverage in @('without features cannot read own reviews', 'rate_recipes allows own CRUD', 'rate_recipes cannot insert another review', 'rate_recipes cannot update another review', 'rate_recipes cannot delete another review', 'send_report only allows own reads', 'send_report cannot delete reviews', 'roles do not imply features', 'sudo without features cannot read recipe reviews', 'group_admin cannot assign outside its group', 'group_admin cannot edit own features', 'set_member_features records assigning actor', 'null member features are rejected', 'unknown member features are rejected', 'invitation rejects null features', 'invitation rejects duplicate features', 'invitation rejects unknown features', 'invitation rejects invalid roles', 'invitation rejects null roles', 'invitation rejects empty roles', 'feature insert failure aborts invitation atomically', 'failed invitation leaves no membership', 'failed invitation leaves no user roles', 'failed invitation leaves no membership features', 'failed invitation leaves no audit entry', 'invitation stores roles and features atomically', 'invitation features record assigning actor')) {
  if ($featureRlsTest -notmatch [regex]::Escape($coverage)) { throw "Falta cobertura de funcionalidades: $coverage" }
}

Write-Output 'Static migration checks passed'
