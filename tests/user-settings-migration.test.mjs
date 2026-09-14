import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('la migración crea permisos, preferencias y RLS por usuario', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/202609140003_user_settings_themes.sql', import.meta.url),
    'utf8',
  );

  assert.match(sql, /access_settings/);
  assert.match(sql, /change_theme/);
  assert.match(sql, /create table public\.user_preferences/);
  assert.match(sql, /check \(theme in \('alba', 'dark'\)\)/);
  assert.match(sql, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /insert into public\.membership_features[\s\S]+cross join public\.features/);
  assert.match(sql, /public\.has_feature\('access_settings'\)/);
  assert.match(sql, /public\.has_feature\('change_theme'\)/);
});
