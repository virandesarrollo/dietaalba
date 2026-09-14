import test from 'node:test';
import assert from 'node:assert/strict';
import { applySavedMealIds, buildMealPayload } from '../lib/admin-plan.js';

test('buildMealPayload crea una fila por tipo sin incluir ids del cliente', () => {
  const drafts = {
    DESAYUNO: { id: 'old-id', title: '  Tostada  ', ingredients: '  Pan  ', isCompleted: true },
    CENA: { title: '', ingredients: '', isCompleted: false },
  };

  assert.deepEqual(buildMealPayload(drafts, ['DESAYUNO', 'CENA']), [
    { meal_type: 'DESAYUNO', title: 'Tostada', ingredients: 'Pan', is_completed: true },
    { meal_type: 'CENA', title: '', ingredients: '', is_completed: false },
  ]);
});

test('applySavedMealIds devuelve drafts nuevos con los ids confirmados', () => {
  const drafts = {
    DESAYUNO: { title: 'Tostada', ingredients: 'Pan', isCompleted: false },
    CENA: { id: 'old', title: 'Sopa', ingredients: '', isCompleted: false },
  };

  const result = applySavedMealIds(drafts, [
    { id: 'breakfast-id', meal_type: 'DESAYUNO' },
    { id: 'dinner-id', meal_type: 'CENA' },
  ]);

  assert.notEqual(result, drafts);
  assert.equal(result.DESAYUNO.id, 'breakfast-id');
  assert.equal(result.CENA.id, 'dinner-id');
  assert.equal(drafts.CENA.id, 'old');
});

