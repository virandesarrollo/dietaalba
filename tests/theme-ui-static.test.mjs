import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const patient = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
const users = readFileSync(new URL('../app/users/page.tsx', import.meta.url), 'utf8');

test('define Tema Alba y Tema Oscuro sin depender del tema del sistema', () => {
  assert.match(css, /\[data-theme=['"]dark['"]\]/);
  assert.match(css, /--app-bg/);
  assert.match(css, /--app-surface/);
  assert.doesNotMatch(css, /prefers-color-scheme/);
});

test('las vistas existentes usan la superficie temática raíz', () => {
  for (const page of [patient, admin, users]) {
    assert.match(page, /theme-page/);
  }
});
