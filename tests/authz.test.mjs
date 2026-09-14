import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveCapabilities } from '../lib/authz.js';

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
