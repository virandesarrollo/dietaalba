import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignableRoles,
  deriveMemberActions,
  mutationSucceededAfterReload,
  destructiveActionConfirmation,
} from '../lib/users-authz.js';

test('sudo puede asignar los cuatro roles', () => {
  assert.deepEqual(assignableRoles(true), ['patient', 'self_manager', 'nutritionist', 'group_admin']);
});

test('group_admin solo puede asignar patient y self_manager', () => {
  assert.deepEqual(assignableRoles(false), ['patient', 'self_manager']);
});

test('solo sudo puede cambiar el estado de una cuenta ajena', () => {
  assert.equal(deriveMemberActions(true, 'actor', 'other', 'active', ['patient'], true).canSetAccountActive, true);
  assert.equal(deriveMemberActions(false, 'actor', 'other', 'active', ['patient'], true).canSetAccountActive, false);
});

test('solo sudo puede cambiar sudo de otra cuenta activa', () => {
  assert.equal(deriveMemberActions(true, 'actor', 'other', 'active', ['patient'], true).canSetSudo, true);
  assert.equal(deriveMemberActions(true, 'actor', 'other', 'active', ['patient'], false).canSetSudo, false);
  assert.equal(deriveMemberActions(false, 'actor', 'other', 'active', ['patient'], true).canSetSudo, false);
});

test('group_admin no puede desactivar membresías con roles elevados', () => {
  assert.equal(deriveMemberActions(false, 'actor', 'other', 'active', ['nutritionist'], true).canDisableMembership, false);
  assert.equal(deriveMemberActions(false, 'actor', 'other', 'active', ['group_admin'], true).canDisableMembership, false);
  assert.equal(deriveMemberActions(false, 'actor', 'other', 'active', ['patient'], true).canDisableMembership, true);
  assert.equal(deriveMemberActions(true, 'actor', 'other', 'active', ['nutritionist'], true).canDisableMembership, true);
});

test('ningún administrador puede editarse a sí mismo', () => {
  assert.deepEqual(deriveMemberActions(true, 'actor', 'actor', 'active', ['group_admin'], true), {
    canEditRoles: false,
    canDisableMembership: false,
    canSetAccountActive: false,
    canSetSudo: false,
  });
});

test('una mutación no se considera exitosa si falla la recarga', () => {
  assert.equal(mutationSucceededAfterReload(false), false);
  assert.equal(mutationSucceededAfterReload(true), true);
});

test('la confirmación destructiva identifica usuario y grupo', () => {
  assert.equal(
    destructiveActionConfirmation('membership', 'Alba', 'alba@example.com', 'Enredaos'),
    '¿Desactivar la membresía de Alba (alba@example.com) en Enredaos?',
  );
  assert.equal(
    destructiveActionConfirmation('account', null, 'alba@example.com', 'Enredaos'),
    '¿Desactivar la cuenta de alba@example.com, miembro de Enredaos?',
  );
  assert.equal(
    destructiveActionConfirmation('sudo-revoke', 'Alba', 'alba@example.com', 'Enredaos'),
    '¿Retirar el acceso sudo a Alba (alba@example.com), miembro de Enredaos?',
  );
});
