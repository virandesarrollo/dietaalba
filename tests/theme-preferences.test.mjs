import test from 'node:test';
import assert from 'node:assert/strict';
import { createThemeSaveGuard, normalizeTheme } from '../lib/theme-preferences.js';

test('normaliza el tema y falla cerrado a Tema Alba', () => {
  assert.equal(normalizeTheme('dark'), 'dark');
  assert.equal(normalizeTheme('alba'), 'alba');
  assert.equal(normalizeTheme('unknown'), 'alba');
  assert.equal(normalizeTheme(null), 'alba');
});

test('solo la última solicitud de guardado puede confirmar el tema', () => {
  const guard = createThemeSaveGuard();
  const first = guard.next('dark');
  const second = guard.next('alba');
  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
  guard.invalidate();
  assert.equal(guard.isCurrent(second), false);
});
