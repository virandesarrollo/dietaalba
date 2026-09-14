import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/users/page.tsx', import.meta.url), 'utf8');

test('users page guards access with shared capabilities', () => {
  assert.match(page, /'use client'/);
  assert.match(page, /deriveCapabilities/);
  assert.match(page, /canManageAllUsers\s*\|\|\s*capabilities\.canManageGroupUsers/);
});

test('users page uses only scoped identity RPCs for its data and actions', () => {
  for (const rpc of [
    'list_manageable_groups',
    'list_manageable_members',
    'invite_group_member_with_features',
    'set_member_roles',
    'set_member_features',
    'disable_membership',
    'set_user_active',
    'set_user_sudo',
  ]) {
    assert.match(page, new RegExp(`rpc\\(['\"]${rpc}['\"]`));
  }
});

test('users page keeps feature state separate and sends exact RPC arguments', () => {
  assert.match(page, /type Member = \{[\s\S]+features: FeatureCode\[\]/);
  assert.match(page, /const \[inviteFeatures, setInviteFeatures\] = useState<FeatureCode\[]>\(\[\]\)/);
  assert.match(page, /const \[draftFeatures, setDraftFeatures\]/);
  assert.match(page, /invite_group_member_with_features'[\s\S]+p_group_id: groupId[\s\S]+p_email: email[\s\S]+p_roles: inviteRoles[\s\S]+p_features: inviteFeatures/);
  assert.match(page, /set_member_features'[\s\S]+p_membership_id: member\.membership_id[\s\S]+p_features: features/);
  assert.match(page, /access_settings[\s\S]+Acceso a ajustes/);
  assert.match(page, /change_theme[\s\S]+Cambiar tema/);
});

test('feature removal requires confirmation and feature success follows reload', () => {
  assert.match(page, /features\.length === 0[\s\S]+window\.confirm/);
  assert.match(page, /rpc\('set_member_features'[\s\S]+await loadScopedData\(\)[\s\S]+mutationSucceededAfterReload/);
  assert.match(page, /actions\.canSetFeatures/);
});

test('invitation and feature writes use a synchronous mutation lock', () => {
  assert.match(page, /const mutationLockRef = useRef\(createMutationLock\(\)\)/);
  assert.match(page, /async function invite\(\)[\s\S]+tryAcquire\(\)[\s\S]+finally[\s\S]+release\(\)/);
  assert.match(page, /async function saveFeatures\([^)]*\)[\s\S]+tryAcquire\(\)[\s\S]+finally[\s\S]+release\(\)/);
});

test('all mutations share the lock and all mutable controls use global busy state', () => {
  for (const mutation of ['invite', 'saveFeatures', 'saveRoles', 'disableMembership', 'setAccountActive', 'setUserSudo']) {
    assert.match(page, new RegExp(`async function ${mutation}\\([^]*?tryAcquire\\(\\)[^]*?finally[^]*?release\\(\\)`));
  }
  assert.match(page, /const busy = savingKey !== null/);
  assert.doesNotMatch(page, /const busy = savingKey === member\.membership_id/);
});

test('users page limits group admins and prevents self editing in the UI', () => {
  assert.match(page, /assignableRoles/);
  assert.match(page, /deriveMemberActions\([^;]+member\.roles[^;]+member\.is_active\)/);
});

test('destructive actions require confirmation before calling their RPC', () => {
  assert.match(page, /if \(!window\.confirm\(destructiveActionConfirmation\('membership',[\s\S]+?\)\)\) return;[\s\S]+?rpc\('disable_membership'/);
  assert.match(page, /if \(!window\.confirm\(destructiveActionConfirmation\('account',[\s\S]+?\)\)\) return;[\s\S]+?rpc\('set_user_active'/);
});

test('sudo controls use account metadata and reload before success', () => {
  assert.match(page, /member\.is_active === true/);
  assert.match(page, /actions\.canSetSudo/);
  assert.match(page, /sudo \? 'sudo-grant' : 'sudo-revoke'/);
  assert.match(page, /rpc\('set_user_sudo',[\s\S]+?await loadScopedData\(\)[\s\S]+?mutationSucceededAfterReload/);
});
