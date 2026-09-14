import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveCapabilities, deriveAvailableViews } from '../lib/authz.js';

test('patient no abre administración', () => {
  assert.deepEqual(deriveCapabilities(false, ['patient']), {
    canOpenDietAdmin: false,
    canManageOwnPlan: false,
    canManageGroupPlans: false,
    canManageGroupUsers: false,
    canManageAllUsers: false,
  });
});

test('self_manager solo administra su dieta', () => {
  assert.deepEqual(deriveCapabilities(false, ['patient', 'self_manager']), {
    canOpenDietAdmin: true,
    canManageOwnPlan: true,
    canManageGroupPlans: false,
    canManageGroupUsers: false,
    canManageAllUsers: false,
  });
});

test('nutritionist abre administración y administra planes del grupo', () => {
  assert.deepEqual(deriveCapabilities(false, ['nutritionist']), {
    canOpenDietAdmin: true,
    canManageOwnPlan: false,
    canManageGroupPlans: true,
    canManageGroupUsers: false,
    canManageAllUsers: false,
  });
});

test('nutritionist con patient también administra su propio plan', () => {
  assert.deepEqual(deriveCapabilities(false, ['patient', 'nutritionist']), {
    canOpenDietAdmin: true,
    canManageOwnPlan: true,
    canManageGroupPlans: true,
    canManageGroupUsers: false,
    canManageAllUsers: false,
  });
});

test('group_admin solo administra usuarios del grupo', () => {
  assert.deepEqual(deriveCapabilities(false, ['group_admin']), {
    canOpenDietAdmin: false,
    canManageOwnPlan: false,
    canManageGroupPlans: false,
    canManageGroupUsers: true,
    canManageAllUsers: false,
  });
});

test('sudo solo amplía la gestión de identidades', () => {
  assert.deepEqual(deriveCapabilities(true, ['patient']), {
    canOpenDietAdmin: false,
    canManageOwnPlan: false,
    canManageGroupPlans: false,
    canManageGroupUsers: false,
    canManageAllUsers: true,
  });
});

test('las vistas disponibles se derivan de permisos y siempre incluyen mi dieta', () => {
  assert.deepEqual(deriveAvailableViews(deriveCapabilities(false, ['patient'])), ['patient']);
  assert.deepEqual(deriveAvailableViews(deriveCapabilities(false, ['self_manager'])), ['patient', 'admin']);
  assert.deepEqual(deriveAvailableViews(deriveCapabilities(false, ['group_admin'])), ['patient', 'users']);
  assert.deepEqual(
    deriveAvailableViews(deriveCapabilities(true, ['nutritionist'])),
    ['patient', 'admin', 'users'],
  );
});

test('ajustes solo aparece con acceso a ajustes', () => {
  const roles = deriveCapabilities(false, ['patient']);
  assert.deepEqual(deriveAvailableViews(roles, { canAccessSettings: false }), ['patient']);
  assert.deepEqual(deriveAvailableViews(roles, { canAccessSettings: true }), ['patient', 'settings']);
});
