import test from 'node:test';
import assert from 'node:assert/strict';
import { createMutationLock } from '../lib/feature-permissions.js';
import {
  assignableRoles,
  deriveMemberActions,
  mutationSucceededAfterReload,
  destructiveActionConfirmation,
  normalizeFeatureCodes,
  toggleFeature,
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
    canSetFeatures: false,
  });
});

test('sudo y group_admin pueden editar funcionalidades ajenas recibidas por su scope', () => {
  assert.equal(deriveMemberActions(true, 'actor', 'other', 'active', ['patient'], true).canSetFeatures, true);
  assert.equal(deriveMemberActions(false, 'actor', 'other', 'pending', ['patient'], null).canSetFeatures, true);
  assert.equal(deriveMemberActions(false, 'actor', 'actor', 'active', ['patient'], true).canSetFeatures, false);
});

test('las funcionalidades RPC se validan fail closed', () => {
  assert.deepEqual(normalizeFeatureCodes(['rate_recipes', 'send_report']), ['rate_recipes', 'send_report']);
  assert.deepEqual(
    normalizeFeatureCodes(['access_settings', 'change_theme']),
    ['access_settings', 'change_theme'],
  );
  assert.deepEqual(normalizeFeatureCodes(['rate_recipes', 'unknown']), []);
  assert.deepEqual(normalizeFeatureCodes(null), []);
});

test('la selección de funcionalidades es independiente y permite quedar vacía', () => {
  assert.deepEqual(toggleFeature(['rate_recipes'], 'send_report'), ['rate_recipes', 'send_report']);
  assert.deepEqual(toggleFeature(['rate_recipes'], 'rate_recipes'), []);
});

test('un lock global impide solapar mutaciones distintas', async () => {
  const lock = createMutationLock();
  const started = [];
  async function mutate(name) {
    if (!lock.tryAcquire()) return false;
    try {
      started.push(name);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return true;
    } finally {
      lock.release();
    }
  }
  const first = mutate('roles');
  assert.equal(await mutate('sudo'), false);
  assert.equal(await first, true);
  assert.deepEqual(started, ['roles']);
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
