# User Settings and Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir ajustes personales protegidos por permisos y permitir seleccionar `Tema Alba` o `Tema Oscuro` con aplicación inmediata y persistencia en Supabase.

**Architecture:** Los permisos continúan en `membership_features`; `access_settings` protege la ruta y `change_theme` protege el control concreto. Las preferencias viven en `user_preferences`, se cargan mediante un proveedor React global y se aplican con un atributo `data-theme` y variables CSS compartidas.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Supabase/PostgreSQL con RLS, Node test runner.

---

### Task 1: Ampliar las capacidades de funcionalidades

**Files:**
- Modify: `lib/feature-permissions.js`
- Modify: `lib/feature-permissions.d.ts`
- Modify: `tests/feature-permissions.test.mjs`

- [ ] **Step 1: Escribir pruebas que fallen para los permisos nuevos**

Añadir casos que exijan esta forma exacta:

```js
assert.deepEqual(deriveFeatureCapabilities(['access_settings']), {
  canRateRecipes: false,
  canSendReport: false,
  canOpenNotes: false,
  canAccessSettings: true,
  canChangeTheme: false,
});

assert.deepEqual(deriveFeatureCapabilities(['access_settings', 'change_theme']), {
  canRateRecipes: false,
  canSendReport: false,
  canOpenNotes: false,
  canAccessSettings: true,
  canChangeTheme: true,
});

assert.equal(deriveFeatureCapabilities(['change_theme']).canChangeTheme, false);
```

- [ ] **Step 2: Ejecutar la prueba y confirmar el fallo esperado**

Run: `node --test tests/feature-permissions.test.mjs`

Expected: FAIL porque `canAccessSettings` y `canChangeTheme` todavía no existen.

- [ ] **Step 3: Implementar la derivación con dependencia explícita**

```js
const canAccessSettings = assigned.has('access_settings');
const canChangeTheme = canAccessSettings && assigned.has('change_theme');
```

Devolver ambas capacidades y ampliar `FeatureCode`:

```ts
export type FeatureCode =
  | 'rate_recipes'
  | 'send_report'
  | 'access_settings'
  | 'change_theme';
```

- [ ] **Step 4: Ejecutar la prueba focalizada**

Run: `node --test tests/feature-permissions.test.mjs`

Expected: PASS.

### Task 2: Crear la migración de permisos y preferencias

**Files:**
- Create: `supabase/migrations/202609140003_user_settings_themes.sql`
- Create: `tests/user-settings-migration.test.mjs`

- [ ] **Step 1: Escribir una prueba estática que falle**

La prueba debe leer la migración y comprobar:

```js
assert.match(sql, /access_settings/);
assert.match(sql, /change_theme/);
assert.match(sql, /create table public\.user_preferences/);
assert.match(sql, /check \(theme in \('alba', 'dark'\)\)/);
assert.match(sql, /user_id = \(select auth\.uid\(\)\)/);
assert.match(sql, /insert into public\.membership_features[\s\S]+cross join public\.features/);
```

- [ ] **Step 2: Ejecutar la prueba y confirmar el fallo por migración ausente**

Run: `node --test tests/user-settings-migration.test.mjs`

Expected: FAIL al no existir `202609140003_user_settings_themes.sql`.

- [ ] **Step 3: Crear la migración transaccional**

La migración debe:

```sql
begin;

alter table public.features drop constraint features_code_check;
alter table public.features add constraint features_code_check
  check (code in ('rate_recipes', 'send_report', 'access_settings', 'change_theme'));

insert into public.features (code, label) values
  ('access_settings', 'Acceso a ajustes'),
  ('change_theme', 'Cambiar tema')
on conflict (code) do update set label = excluded.label;

insert into public.membership_features (membership_id, feature_code)
select gm.id, f.code
from public.group_memberships gm
cross join public.features f
where gm.status = 'active'
  and f.code in ('access_settings', 'change_theme')
on conflict do nothing;

create table public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  theme text not null default 'alba' check (theme in ('alba', 'dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Añadir RLS `select`, `insert` y `update` para `user_id = auth.uid()` y exigir `has_feature('access_settings')`; las escrituras exigirán además `has_feature('change_theme')`. Conceder únicamente los privilegios necesarios a `authenticated`. Añadir trigger de `updated_at` siguiendo cualquier función existente del proyecto o una función dedicada con `search_path = ''`.

- [ ] **Step 4: Ejecutar la prueba de migración**

Run: `node --test tests/user-settings-migration.test.mjs`

Expected: PASS.

- [ ] **Step 5: Aplicar la migración en Supabase**

Ejecutar el contenido completo en el SQL Editor del proyecto y verificar:

```sql
select code from public.features
where code in ('access_settings', 'change_theme') order by code;

select count(*) from public.membership_features
where feature_code in ('access_settings', 'change_theme');
```

Expected: dos funcionalidades y dos asignaciones por cada membresía activa existente.

### Task 3: Añadir el proveedor global de tema

**Files:**
- Create: `lib/theme-preferences.js`
- Create: `lib/theme-preferences.d.ts`
- Create: `tests/theme-preferences.test.mjs`
- Create: `components/ThemeProvider.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Escribir pruebas unitarias que fallen para normalización y control de solicitudes**

```js
assert.equal(normalizeTheme('dark'), 'dark');
assert.equal(normalizeTheme('alba'), 'alba');
assert.equal(normalizeTheme('unknown'), 'alba');

const guard = createThemeSaveGuard();
const first = guard.next('dark');
const second = guard.next('alba');
assert.equal(guard.isCurrent(first), false);
assert.equal(guard.isCurrent(second), true);
```

- [ ] **Step 2: Ejecutar y confirmar el fallo por exportaciones ausentes**

Run: `node --test tests/theme-preferences.test.mjs`

Expected: FAIL porque aún no existen `normalizeTheme` ni `createThemeSaveGuard`.

- [ ] **Step 3: Implementar las utilidades puras**

```js
export function normalizeTheme(value) {
  return value === 'dark' ? 'dark' : 'alba';
}

export function createThemeSaveGuard() {
  let latest = 0;
  return {
    next(theme) { latest += 1; return { id: latest, theme }; },
    isCurrent(request) { return request.id === latest; },
    invalidate() { latest += 1; },
  };
}
```

- [ ] **Step 4: Ejecutar la prueba focalizada y confirmar PASS**

Run: `node --test tests/theme-preferences.test.mjs`

- [ ] **Step 5: Crear `ThemeProvider` con contexto global**

El contexto expondrá:

```ts
type ThemeContextValue = {
  theme: 'alba' | 'dark';
  loading: boolean;
  saving: boolean;
  error: string | null;
  setTheme: (theme: 'alba' | 'dark') => Promise<void>;
};
```

Al iniciar sesión: consultar `get_my_features`, fallar cerrado si falta `access_settings`, leer `user_preferences` con `maybeSingle()` y usar `alba` si no existe fila. Aplicar `document.documentElement.dataset.theme = theme`. En `setTheme`, actualizar la interfaz primero, hacer `upsert({ user_id, theme })`, ignorar respuestas antiguas mediante el guard y restaurar el valor anterior si falla la solicitud vigente. Al cerrar sesión, invalidar solicitudes y volver a `alba`.

- [ ] **Step 6: Montar el proveedor en el layout**

```tsx
<body className="font-sans antialiased">
  <ThemeProvider>{children}</ThemeProvider>
</body>
```

- [ ] **Step 7: Verificar TypeScript**

Run: `npx tsc --noEmit`

Expected: exit 0.

### Task 4: Aplicar variables visuales a las cuatro vistas

**Files:**
- Modify: `app/globals.css`
- Modify: `app/page.tsx`
- Modify: `app/admin/page.tsx`
- Modify: `app/users/page.tsx`
- Test: `tests/theme-ui-static.test.mjs`

- [ ] **Step 1: Escribir una prueba estática que falle**

Comprobar que `globals.css` contiene `[data-theme='dark']`, que las cuatro páginas usan clases semánticas `theme-page`/`theme-surface`, y que no existe `prefers-color-scheme` para evitar que el sistema sobrescriba la elección del usuario.

- [ ] **Step 2: Ejecutar la prueba y confirmar el fallo esperado**

Run: `node --test tests/theme-ui-static.test.mjs`

- [ ] **Step 3: Definir variables CSS de Tema Alba y Tema Oscuro**

```css
:root,
[data-theme='alba'] {
  --app-bg: #faf7f2;
  --app-surface: #ffffff;
  --app-surface-soft: #f8fafc;
  --app-text: #334155;
  --app-muted: #64748b;
  --app-border: #ffe4e6;
  --app-accent: #f472b6;
}

[data-theme='dark'] {
  color-scheme: dark;
  --app-bg: #111318;
  --app-surface: #1b1f27;
  --app-surface-soft: #242a35;
  --app-text: #f1f5f9;
  --app-muted: #a8b1c2;
  --app-border: #343b49;
  --app-accent: #f08abb;
}

.theme-page { background: var(--app-bg); color: var(--app-text); }
.theme-surface { background: var(--app-surface); }
.theme-muted { color: var(--app-muted); }
.theme-border { border-color: var(--app-border); }
```

- [ ] **Step 4: Sustituir únicamente los colores estructurales necesarios**

Aplicar las clases semánticas a fondos principales, cabeceras, paneles, tarjetas, navegación, campos y textos secundarios. Mantener los acentos rosas de Tema Alba y usar las mismas variables en el tema oscuro; no modificar estructura, espaciado ni comportamiento.

- [ ] **Step 5: Ejecutar la prueba estática**

Run: `node --test tests/theme-ui-static.test.mjs`

Expected: PASS.

### Task 5: Crear `/settings` y ampliar la navegación autorizada

**Files:**
- Create: `app/settings/page.tsx`
- Modify: `components/ViewNavigation.tsx`
- Modify: `lib/authz.d.ts`
- Modify: `app/users/page.tsx`
- Modify: `tests/users-page-static.test.mjs`
- Create: `tests/settings-page-static.test.mjs`

- [ ] **Step 1: Escribir pruebas que fallen para ajustes y navegación**

Verificar que:

```js
assert.match(settingsPage, /canAccessSettings/);
assert.match(settingsPage, /canChangeTheme/);
assert.match(settingsPage, /router\.replace\('\/'\)/);
assert.match(settingsPage, /No tienes ajustes disponibles/);
assert.match(settingsPage, /Tema Alba/);
assert.match(settingsPage, /Tema Oscuro/);
assert.match(navigation, /settings:[\s\S]+Ajustes[\s\S]+\/settings/);
assert.match(navigation, /canAccessSettings/);
```

Ampliar la prueba de `/users` para exigir etiquetas `Acceso a ajustes` y `Cambiar tema`.

- [ ] **Step 2: Ejecutar las pruebas y confirmar el fallo**

Run: `node --test tests/settings-page-static.test.mjs tests/users-page-static.test.mjs`

- [ ] **Step 3: Añadir los permisos al panel de usuarios**

```ts
const ALL_FEATURES = [
  { code: 'rate_recipes', label: 'Valorar recetas' },
  { code: 'send_report', label: 'Enviar informe' },
  { code: 'access_settings', label: 'Acceso a ajustes' },
  { code: 'change_theme', label: 'Cambiar tema' },
];
```

Mantener ambos checkboxes independientes. La capacidad efectiva `canChangeTheme` seguirá requiriendo ambos permisos.

- [ ] **Step 4: Ampliar la navegación**

Añadir `settings` a `AppView`, incorporar `Settings` de Lucide y renderizar la entrada solo cuando `deriveFeatureCapabilities` indique `canAccessSettings`. Cargar roles y funcionalidades en paralelo dentro de `ViewNavigation`; ante cualquier error, no mostrar accesos cuya autorización no haya podido comprobarse.

- [ ] **Step 5: Crear la página de Ajustes**

La página debe cargar `get_my_features`, redirigir a `/` sin `canAccessSettings`, mostrar el estado vacío sin `canChangeTheme`, y con permiso renderizar dos botones conectados al contexto:

```tsx
<button onClick={() => void setTheme('alba')} aria-pressed={theme === 'alba'}>
  Tema Alba
</button>
<button onClick={() => void setTheme('dark')} aria-pressed={theme === 'dark'}>
  Tema Oscuro
</button>
```

Deshabilitar ambos durante `saving`, mostrar `Guardando…` y un mensaje accesible `role="alert"` si falla.

- [ ] **Step 6: Ejecutar las pruebas focalizadas**

Run: `node --test tests/settings-page-static.test.mjs tests/users-page-static.test.mjs`

Expected: PASS.

### Task 6: Verificación integral

**Files:**
- Verify all modified files

- [ ] **Step 1: Ejecutar todas las pruebas**

Run: `npm test`

Expected: todas las pruebas pasan, sin fallos.

- [ ] **Step 2: Ejecutar TypeScript**

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 3: Ejecutar lint focalizado**

Run: `npx eslint components/ThemeProvider.tsx components/ViewNavigation.tsx app/settings/page.tsx lib/*.js`

Expected: exit 0.

- [ ] **Step 4: Crear build de producción**

Run: `npm run build`

Expected: compilación correcta y ruta `/settings` incluida.

- [ ] **Step 5: Validación manual por permisos**

Comprobar con cuentas representativas:

1. Sin `access_settings`: no ve Ajustes y `/settings` redirige.
2. Solo `access_settings`: ve Ajustes y el estado vacío.
3. Ambos permisos: cambia entre Alba/Oscuro, recarga y conserva el tema.
4. Solo `change_theme`: no ve Ajustes y no puede cambiar tema.
5. `sudo`/`group_admin`: pueden conceder o retirar ambos permisos dentro de su alcance.

No ejecutar commits durante el plan salvo que el usuario los solicite explícitamente.
