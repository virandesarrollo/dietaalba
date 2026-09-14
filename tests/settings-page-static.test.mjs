import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('ajustes protege la ruta y separa acceso de cambio de tema', () => {
  const page = readFileSync(new URL('../app/settings/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /canAccessSettings/);
  assert.match(page, /canChangeTheme/);
  assert.match(page, /router\.replace\('\/'\)/);
  assert.match(page, /No tienes ajustes disponibles/);
  assert.match(page, /Tema Alba/);
  assert.match(page, /Tema Oscuro/);
  assert.match(page, /useTheme/);
});

test('la navegación muestra ajustes según su funcionalidad', () => {
  const navigation = readFileSync(new URL('../components/ViewNavigation.tsx', import.meta.url), 'utf8');
  assert.match(navigation, /settings:[\s\S]+Ajustes[\s\S]+\/settings/);
  assert.match(navigation, /canAccessSettings/);
  assert.match(navigation, /get_my_features/);
});
