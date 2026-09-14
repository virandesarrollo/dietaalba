# Feature Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que `sudo` y `group_admin` asignen por usuario el acceso a valoraciones de recetas y al envío del informe, ocultando y bloqueando las funciones no autorizadas.

**Architecture:** Una segunda migración Supabase crea un catálogo de funcionalidades y asignaciones por membresía, expone RPC acotadas y reemplaza las políticas de `recipe_reviews`. La aplicación obtiene capacidades mediante RPC y usa helpers puros para decidir qué controles renderizar; `/users` edita roles y funcionalidades por separado.

**Tech Stack:** PostgreSQL/Supabase Auth y RLS, Next.js 16, React 19, JavaScript/TypeScript, Tailwind CSS 4, `node:test`, pgTAP.

---

## Estructura de archivos

- Crear `supabase/migrations/202609140002_feature_permissions.sql`: tablas, migración inicial, RPC, auditoría y RLS.
- Modificar `supabase/tests/users_groups_roles_static.ps1`: contrato estático de la nueva migración.
- Crear `supabase/tests/feature_permissions_rls.sql`: matriz pgTAP transaccional.
- Crear `lib/feature-permissions.js` y `lib/feature-permissions.d.ts`: capacidades y visibilidad puras.
- Crear `tests/feature-permissions.test.mjs`: cuatro combinaciones de permisos.
- Modificar `app/page.tsx`: carga de permisos, consultas condicionadas y controles ocultos.
- Modificar `lib/users-authz.js` y `lib/users-authz.d.ts`: permisos editables según alcance.
- Modificar `app/users/page.tsx`: selección al invitar y editar.
- Modificar las pruebas estáticas de `app/page.tsx` y `/users`.

No modificar la migración ya aplicada `202609140001_users_groups_roles.sql`. No ejecutar operaciones Git ni aplicar cambios a Supabase remoto durante la implementación.

### Task 1: Esquema de funcionalidades y migración inicial

**Files:**
- Create: `supabase/migrations/202609140002_feature_permissions.sql`
- Modify: `supabase/tests/users_groups_roles_static.ps1`

- [ ] **Step 1: Escribir comprobaciones estáticas que fallen**

Comprobar en PowerShell que la segunda migración contiene `features`, `membership_features`, `has_feature`, `get_my_features`, `set_member_features`, `invite_group_member_with_features`, limpieza RLS de `recipe_reviews` y grants restringidos.

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File supabase/tests/users_groups_roles_static.ps1`

Expected: FAIL porque la migración aún no existe.

- [ ] **Step 2: Crear tablas y catálogo**

```sql
begin;

create table public.features (
  code text primary key check (code in ('rate_recipes', 'send_report')),
  label text not null
);

insert into public.features(code, label) values
  ('rate_recipes', 'Valorar recetas y escribir notas'),
  ('send_report', 'Consultar y enviar informe')
on conflict (code) do update set label = excluded.label;

create table public.membership_features (
  membership_id uuid not null references public.group_memberships(id) on delete cascade,
  feature_code text not null references public.features(code),
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  primary key (membership_id, feature_code)
);
```

- [ ] **Step 3: Migrar Enredaos de forma inequívoca**

En un bloque `do`, bloquear las membresías activas de `Enredaos`, exigir exactamente dos, exigir exactamente un perfil sudo activo y asignar ambos permisos solo a la otra membresía. Si cualquier cardinalidad difiere, lanzar excepción. No asignar filas a Andrés.

```sql
insert into public.membership_features(membership_id, feature_code)
select alba_membership_id, f.code
from public.features f
on conflict do nothing;
```

Finalizar la migración con `commit;` para que cualquier validación fallida revierta todo.

- [ ] **Step 4: Ejecutar verificación estática**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File supabase/tests/users_groups_roles_static.ps1`

Expected: PASS.

### Task 2: Autorización, RPC y RLS de valoraciones

**Files:**
- Modify: `supabase/migrations/202609140002_feature_permissions.sql`
- Create: `supabase/tests/feature_permissions_rls.sql`

- [ ] **Step 1: Crear helpers de lectura**

Implementar con `security definer set search_path = ''`:

```sql
public.has_feature(p_feature text) returns boolean
public.get_my_features() returns table(feature_code text)
```

Ambas exigen perfil activo y membresía activa. `has_feature` comprueba una fila de `membership_features`; ningún rol concede funcionalidades implícitamente.

- [ ] **Step 2: Crear asignación segura de permisos**

Implementar `set_member_features(p_membership_id uuid, p_features text[])`. Rechazar `null`, duplicados y códigos desconocidos; permitir array vacío para retirar todos. Autorizar a sudo global o `group_admin` del mismo grupo, prohibir modificar la membresía propia, reemplazar filas de forma transaccional y auditar solo los códigos resultantes.

- [ ] **Step 3: Crear invitación atómica**

Crear `invite_group_member_with_features(p_group_id uuid, p_email text, p_roles text[], p_features text[]) returns uuid`. Repetir dentro de una sola función las validaciones de alcance/roles de `invite_group_member`, validar funcionalidades, crear membresía, roles y permisos, y escribir una sola auditoría sin correo en `details`.

No llamar desde SQL a la RPC antigua como usuario autenticado; compartir validación mediante helpers internos o implementar el flujo completo para garantizar una sola transacción.

- [ ] **Step 4: Extender listados de gestión**

Reemplazar `list_manageable_members()` conservando columnas actuales y añadiendo `features text[]`. Sudo recibe todos; `group_admin`, solo su grupo. No exponer columnas personales nuevas.

- [ ] **Step 5: Reemplazar RLS de recipe_reviews**

Habilitar RLS, eliminar dinámicamente todas las políticas existentes solo de `recipe_reviews` y crear:

```sql
select: user_id = auth.uid() and (has_feature('rate_recipes') or has_feature('send_report'))
insert: user_id = auth.uid() and has_feature('rate_recipes')
update/delete: user_id = auth.uid() and has_feature('rate_recipes')
```

Habilitar RLS en las dos tablas nuevas. Lectura de `features` para usuarios activos; `membership_features` solo para propia membresía, sudo o `group_admin` del grupo. Sin escrituras directas: solo RPC. Revocar `public` y conceder `execute` a `authenticated` en las RPC públicas.

- [ ] **Step 6: Escribir matriz pgTAP**

Dentro de `begin`/`rollback`, probar al menos:

1. Sin permisos no se leen ni escriben valoraciones.
2. `rate_recipes` permite CRUD propio, no ajeno.
3. `send_report` permite lectura propia pero no escritura.
4. Ambos permisos combinan capacidades.
5. Sudo o roles sin permiso no obtienen acceso funcional.
6. `group_admin` no asigna fuera del grupo ni se autoedita.
7. Invitación crea membresía, roles y permisos atómicamente.

Run: `npx supabase test db`

Expected: pgTAP PASS. Si no hay Docker/Podman, registrar la limitación y ejecutar la comprobación estática; no aplicar remoto como sustituto.

### Task 3: Capacidades puras de funcionalidades

**Files:**
- Create: `lib/feature-permissions.js`
- Create: `lib/feature-permissions.d.ts`
- Create: `tests/feature-permissions.test.mjs`

- [ ] **Step 1: Escribir pruebas que fallen**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveFeatureCapabilities } from '../lib/feature-permissions.js';

const cases = [
  [[], { canRateRecipes: false, canSendReport: false, canOpenNotes: false }],
  [['rate_recipes'], { canRateRecipes: true, canSendReport: false, canOpenNotes: true }],
  [['send_report'], { canRateRecipes: false, canSendReport: true, canOpenNotes: true }],
  [['rate_recipes', 'send_report'], { canRateRecipes: true, canSendReport: true, canOpenNotes: true }],
];

for (const [features, expected] of cases) {
  test(`capacidades para ${features.join(',') || 'ningún permiso'}`, () => {
    assert.deepEqual(deriveFeatureCapabilities(features), expected);
  });
}
```

- [ ] **Step 2: Confirmar fallo rojo**

Run: `node --test tests/feature-permissions.test.mjs`

Expected: FAIL porque el helper no existe.

- [ ] **Step 3: Implementar helper y tipos**

```js
export function deriveFeatureCapabilities(features) {
  const assigned = new Set(features);
  const canRateRecipes = assigned.has('rate_recipes');
  const canSendReport = assigned.has('send_report');
  return { canRateRecipes, canSendReport, canOpenNotes: canRateRecipes || canSendReport };
}
```

Declarar `FeatureCode`, `FeatureCapabilities` y la firma exacta en `.d.ts`.

- [ ] **Step 4: Confirmar verde**

Run: `npm test`

Expected: todas las pruebas pasan.

### Task 4: Aplicar permisos a la app del paciente

**Files:**
- Modify: `app/page.tsx`
- Create: `tests/patient-feature-permissions-static.test.mjs`

- [ ] **Step 1: Escribir regresiones estáticas iniciales**

Comprobar que `app/page.tsx` llama `get_my_features`, usa `deriveFeatureCapabilities`, condiciona consulta/escritura de `recipe_reviews` con `canRateRecipes || canSendReport`, condiciona controles de valoración con `canRateRecipes` y controles de informe con `canSendReport`.

Run: `node --test tests/patient-feature-permissions-static.test.mjs`

Expected: FAIL antes de modificar la página.

- [ ] **Step 2: Cargar capacidades antes de valoraciones**

Tras obtener sesión, llamar `get_my_features`, derivar capacidades y mantener un estado de carga. No consultar `recipe_reviews` si no existe ningún permiso. Si falla la RPC, aplicar denegación segura y mostrar un error genérico sin habilitar funciones.

- [ ] **Step 3: Ocultar controles no autorizados**

- Renderizar estrellas, añadir/editar/eliminar nota y su modal solo con `canRateRecipes`.
- Renderizar copiar, WhatsApp y vista previa solo con `canSendReport`.
- Renderizar pestaña `Notas chica` solo con `canOpenNotes`.
- Añadir un efecto que cambie `currentTab` a `plan` si `canOpenNotes` pasa a falso.
- Mantener visible el listado de notas para `send_report` aunque `canRateRecipes` sea falso.

- [ ] **Step 4: Añadir defensas en handlers**

`openReviewModal`, `saveReview` y `deleteReview` deben retornar inmediatamente si `canRateRecipes` es falso; `copyToClipboard`/generación de envío no deben activarse desde controles ausentes. RLS sigue siendo la barrera autoritativa.

- [ ] **Step 5: Verificar**

Run: `npm test && npx eslint app/page.tsx lib/feature-permissions.js tests/feature-permissions.test.mjs tests/patient-feature-permissions-static.test.mjs && npx tsc --noEmit`

Expected: pruebas y TypeScript pasan. Si ESLint informa errores preexistentes de `app/page.tsx`, corregir solo los introducidos por esta tarea y documentar los anteriores.

### Task 5: Gestionar funcionalidades desde /users

**Files:**
- Modify: `lib/users-authz.js`
- Modify: `lib/users-authz.d.ts`
- Modify: `app/users/page.tsx`
- Modify: `tests/users-authz.test.mjs`
- Modify: `tests/users-page-static.test.mjs`

- [ ] **Step 1: Ampliar pruebas de autorización**

Añadir capacidades `canSetFeatures` con esta matriz: sudo puede editar a otro usuario; `group_admin` puede editar a otro miembro de su grupo recibido por la RPC; nadie puede autoeditarse. Probar selección independiente y array vacío.

- [ ] **Step 2: Adaptar tipos y carga**

Añadir `features: FeatureCode[]` al tipo de miembro y leer la nueva columna de `list_manageable_members`. Mantener roles y funcionalidades en estados separados.

- [ ] **Step 3: Extender invitación**

Mostrar dos checkboxes independientes, inicialmente desmarcados. Enviar roles y permisos a `invite_group_member_with_features`. El botón debe quedar deshabilitado durante la operación; el éxito solo se muestra tras recarga satisfactoria.

- [ ] **Step 4: Editar permisos existentes**

Para cada miembro ajeno, mostrar los dos permisos y guardar mediante `set_member_features`. Ocultar/deshabilitar la edición propia usando el helper. Confirmar retirada de todos los permisos y conservar el error de recarga si ocurre.

- [ ] **Step 5: Verificar**

Run: `npm test && npx eslint app/users/page.tsx lib/users-authz.js tests/users-authz.test.mjs tests/users-page-static.test.mjs && npx tsc --noEmit && npm run build`

Expected: pruebas, ESLint focalizado, TypeScript y build pasan; `/users` y `/` aparecen en la salida del build.

### Task 6: Verificación integral

**Files:**
- Verify: todos los anteriores

- [ ] **Step 1: Ejecutar comprobaciones completas**

Run: `npm test`

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File supabase/tests/users_groups_roles_static.ps1`

Run: `npx tsc --noEmit`

Run: `npm run build`

Expected: todos con exit code 0.

- [ ] **Step 2: Ejecutar RLS local**

Run: `npx supabase test db`

Expected: todas las pruebas pgTAP pasan. Si Docker/Podman sigue sin estar disponible, no afirmar que RLS fue ejecutada; entregar la suite y la limitación exacta.

- [ ] **Step 3: Comprobar casos manuales en staging**

Verificar las cuatro combinaciones con usuarios de prueba, retirada de permisos durante una sesión, invitación con selección vacía y rechazo de `group_admin` fuera de grupo. No usar las cuentas reales de Andrés o Alba para pruebas destructivas.

