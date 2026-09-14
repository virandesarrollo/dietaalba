import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');

test('el panel deriva capacidades sin consultar profiles.role', () => {
  assert.match(page, /deriveCapabilities/);
  assert.doesNotMatch(page, /profiles[^\n]*\.select\([^\n]*role/);
});

test('el nutricionista obtiene pacientes mediante la RPC acotada', () => {
  assert.match(page, /rpc\('list_manageable_patients'\)/);
  assert.doesNotMatch(page, /\.from\('profiles'\)[\s\S]{0,160}\.order\(/);
});

test('el guardado usa una única RPC y bloquea los controles de contexto', () => {
  assert.equal(page.match(/rpc\('save_daily_plan'/g)?.length, 1);
  assert.doesNotMatch(page, /Promise\.all\(operations\)/);
  assert.match(page, /disabled=\{saving\}/);
  assert.match(page, /disabled=\{saving \|\| !selectedPatientId\}/);
});

test('el guardado bloquea los campos editables hasta finalizar', () => {
  assert.equal(page.match(/disabled=\{!selectedPatientId \|\| saving\}/g)?.length, 2);
});
