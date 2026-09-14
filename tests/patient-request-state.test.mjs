import test from 'node:test';
import assert from 'node:assert/strict';
import * as patientState from '../lib/feature-permissions.js';

test('only the latest request in an auth generation remains current', () => {
  assert.equal(typeof patientState.createLatestRequestGuard, 'function');
  const guard = patientState.createLatestRequestGuard();
  const generation = guard.currentGeneration();
  const oldRequest = guard.startRequest(generation, 'user-a', '2026-09-14');
  const newRequest = guard.startRequest(generation, 'user-a', '2026-09-15');

  assert.equal(guard.isCurrent(oldRequest), false);
  assert.equal(guard.isCurrent(newRequest), true);
});

test('an auth change invalidates requests and delayed session snapshots', () => {
  assert.equal(typeof patientState.createLatestRequestGuard, 'function');
  const guard = patientState.createLatestRequestGuard();
  const delayedSessionGeneration = guard.currentGeneration();
  const oldUserRequest = guard.startRequest(delayedSessionGeneration, 'user-a', '2026-09-14');

  const newGeneration = guard.invalidate();
  const newUserRequest = guard.startRequest(newGeneration, 'user-b', '2026-09-14');

  assert.equal(guard.isGenerationCurrent(delayedSessionGeneration), false);
  assert.equal(guard.isCurrent(oldUserRequest), false);
  assert.equal(guard.isCurrent(newUserRequest), true);
});

test('review errors and absent data resolve to an empty fail-closed map', () => {
  assert.equal(typeof patientState.deriveReviewMap, 'function');
  assert.deepEqual(patientState.deriveReviewMap(undefined, new Error('denied')), {});
  assert.deepEqual(patientState.deriveReviewMap(null, null), {});
  assert.deepEqual(patientState.deriveReviewMap([
    { recipe_title: 'Gazpacho', rating: 4, notes: 'Bien' },
  ], null), {
    Gazpacho: { recipe_title: 'Gazpacho', rating: 4, notes: 'Bien' },
  });
});

test('an old review mutation cannot commit after the authenticated user changes', () => {
  const mutationGuard = patientState.createLatestRequestGuard();
  const oldMutation = mutationGuard.startRequest(
    mutationGuard.currentGeneration(),
    'user-a',
    'Gazpacho',
  );

  mutationGuard.invalidate();

  assert.equal(mutationGuard.isCurrent(oldMutation), false);
});

test('changing date invalidates the active request without changing auth generation', () => {
  const guard = patientState.createLatestRequestGuard();
  const generation = guard.currentGeneration();
  const oldDateRequest = guard.startRequest(generation, 'user-a', '2026-09-14');

  assert.equal(typeof guard.invalidateRequests, 'function');
  guard.invalidateRequests();

  assert.equal(guard.currentGeneration(), generation);
  assert.equal(guard.isCurrent(oldDateRequest), false);
});

test('a global review lock prevents a second delete from starting', () => {
  assert.equal(typeof patientState.createMutationLock, 'function');
  const lock = patientState.createMutationLock();
  let startedDeletes = 0;
  const startDelete = () => {
    if (!lock.tryAcquire()) return;
    startedDeletes += 1;
  };

  startDelete();
  startDelete();

  assert.equal(startedDeletes, 1);
  assert.equal(lock.isBusy(), true);
  lock.release();
  assert.equal(lock.isBusy(), false);
});

test('normalizes Supabase feature rows and fails closed for invalid shapes', () => {
  assert.equal(typeof patientState.normalizeFeatureRows, 'function');
  assert.deepEqual(patientState.normalizeFeatureRows([
    { feature_code: 'rate_recipes' },
    { feature_code: 'send_report' },
  ]), ['rate_recipes', 'send_report']);
  assert.deepEqual(patientState.normalizeFeatureRows(['rate_recipes']), []);
  assert.deepEqual(patientState.normalizeFeatureRows([{ feature_code: 123 }]), []);
  assert.deepEqual(patientState.normalizeFeatureRows(null), []);
});
