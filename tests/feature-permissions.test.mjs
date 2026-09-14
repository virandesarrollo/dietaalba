import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveFeatureCapabilities } from '../lib/feature-permissions.js';

const cases = [
  [[], { canRateRecipes: false, canSendReport: false, canOpenNotes: false, canAccessSettings: false, canChangeTheme: false }],
  [['rate_recipes'], { canRateRecipes: true, canSendReport: false, canOpenNotes: true, canAccessSettings: false, canChangeTheme: false }],
  [['send_report'], { canRateRecipes: false, canSendReport: true, canOpenNotes: true, canAccessSettings: false, canChangeTheme: false }],
  [['rate_recipes', 'send_report'], { canRateRecipes: true, canSendReport: true, canOpenNotes: true, canAccessSettings: false, canChangeTheme: false }],
  [['access_settings'], { canRateRecipes: false, canSendReport: false, canOpenNotes: false, canAccessSettings: true, canChangeTheme: false }],
  [['access_settings', 'change_theme'], { canRateRecipes: false, canSendReport: false, canOpenNotes: false, canAccessSettings: true, canChangeTheme: true }],
  [['change_theme'], { canRateRecipes: false, canSendReport: false, canOpenNotes: false, canAccessSettings: false, canChangeTheme: false }],
];

for (const [features, expected] of cases) {
  test(`deriva capacidades para ${features.join(', ') || 'ningún permiso'}`, () => {
    assert.deepEqual(deriveFeatureCapabilities(features), expected);
  });
}

test('ignora permisos duplicados', () => {
  assert.deepEqual(deriveFeatureCapabilities(['rate_recipes', 'rate_recipes']), {
    canRateRecipes: true,
    canSendReport: false,
    canOpenNotes: true,
    canAccessSettings: false,
    canChangeTheme: false,
  });
});

test('los códigos desconocidos no conceden capacidades', () => {
  assert.deepEqual(deriveFeatureCapabilities(['unknown_feature']), {
    canRateRecipes: false,
    canSendReport: false,
    canOpenNotes: false,
    canAccessSettings: false,
    canChangeTheme: false,
  });
});
