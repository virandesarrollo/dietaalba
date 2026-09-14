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
    'invite_group_member',
    'set_member_roles',
    'disable_membership',
    'set_user_active',
    'set_user_sudo',
  ]) {
    assert.match(page, new RegExp(`rpc\\(['\"]${rpc}['\"]`));
  }
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
