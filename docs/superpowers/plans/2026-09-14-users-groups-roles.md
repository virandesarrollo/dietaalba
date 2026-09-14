# Users, Groups and Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incorporar grupos, roles acumulables, invitaciones y permisos seguros para administrar usuarios y dietas con alcance propio, de grupo o global.

**Architecture:** Supabase conserva la autoridad mediante tablas normalizadas, funciones `security definer` y RLS. Next.js consume una vista de capacidades común: `/admin` adapta el selector de pacientes y `/users` reutiliza una interfaz limitada por el alcance del actor.

**Tech Stack:** PostgreSQL/Supabase Auth y RLS, Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, `node:test` para lógica pura.

---

## Estructura de archivos

- Crear `supabase/migrations/202609140001_users_groups_roles.sql`: esquema, migración de datos, funciones, auditoría y RLS.
- Crear `lib/authz.js`: cálculo puro de capacidades para la interfaz.
- Crear `lib/authz.d.ts`: tipos consumidos desde TypeScript.
- Crear `tests/authz.test.mjs`: pruebas unitarias de combinaciones de roles.
- Modificar `package.json`: script `test` basado en Node, sin dependencias nuevas.
- Modificar `app/auth/callback/route.ts`: reclamar invitación tras OAuth.
- Modificar `app/admin/page.tsx`: sustituir el rol único por capacidades y pacientes autorizados.
- Crear `app/users/page.tsx`: administración compartida para `sudo` y `group_admin`.

No ejecutar operaciones Git: el directorio actual no es un repositorio y el usuario no ha solicitado inicializarlo ni crear commits.

### Task 1: Esquema normalizado y migración de los usuarios actuales

**Files:**
- Create: `supabase/migrations/202609140001_users_groups_roles.sql`

- [ ] **Step 1: Crear tablas y restricciones**

Crear tipos, tablas e índices con este contrato:

```sql
create type public.membership_status as enum ('pending', 'active', 'disabled');

alter table public.profiles
  add column if not exists is_sudo boolean not null default false,
  add column if not exists is_active boolean not null default true;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  user_id uuid references public.profiles(id),
  invited_email text,
  status public.membership_status not null default 'pending',
  invited_by uuid references public.profiles(id),
  invited_at timestamptz not null default now(),
  activated_at timestamptz,
  disabled_at timestamptz,
  check (user_id is not null or invited_email is not null),
  check (status <> 'active' or user_id is not null)
);

create unique index one_active_group_per_user
  on public.group_memberships(user_id)
  where status = 'active';
create unique index one_pending_invitation_per_group_email
  on public.group_memberships(group_id, lower(invited_email))
  where status = 'pending';

create table public.roles (
  code text primary key check (code in ('patient', 'self_manager', 'nutritionist', 'group_admin')),
  label text not null
);

insert into public.roles(code, label) values
  ('patient', 'Paciente'),
  ('self_manager', 'Autogestión'),
  ('nutritionist', 'Nutricionista'),
  ('group_admin', 'Administrador de grupo')
on conflict (code) do update set label = excluded.label;

create table public.user_roles (
  membership_id uuid not null references public.group_memberships(id) on delete cascade,
  role_code text not null references public.roles(code),
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  primary key (membership_id, role_code)
);

create table public.permission_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  target_type text not null,
  target_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 2: Migrar Andrés y Alba sin perder `profiles.role`**

Añadir al final de la migración un bloque transaccional que cree `Enredaos`, active una membresía para todos los perfiles existentes y traduzca el rol anterior. La primera ejecución debe establecer manualmente el correo sudo en una variable revisable:

```sql
do $$
declare
  enredaos_id uuid;
begin
  if (select count(*) from public.profiles where role = 'nutritionist') <> 1 then
    raise exception 'La migración inicial exige exactamente un nutritionist existente';
  end if;

  insert into public.groups(name, slug)
  values ('Enredaos', 'enredaos')
  on conflict (slug) do update set name = excluded.name
  returning id into enredaos_id;

  insert into public.group_memberships(group_id, user_id, status, activated_at)
  select enredaos_id, p.id, 'active', now()
  from public.profiles p
  on conflict do nothing;

  insert into public.user_roles(membership_id, role_code)
  select gm.id,
         case when p.role = 'nutritionist' then 'nutritionist' else 'patient' end
  from public.group_memberships gm
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = enredaos_id
  on conflict do nothing;

  insert into public.user_roles(membership_id, role_code)
  select gm.id, 'patient'
  from public.group_memberships gm
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = enredaos_id and p.role = 'nutritionist'
  on conflict do nothing;

  update public.profiles
  set is_sudo = true
  where role = 'nutritionist';
end $$;
```

Mantener temporalmente `profiles.role` para permitir despliegue gradual; retirarlo solo en una migración posterior tras verificar producción.

- [ ] **Step 3: Validar la migración en Supabase local o staging**

Run: `npx supabase db reset`

Expected: migración aplicada si existe exactamente un `nutritionist`; `Enredaos` contiene los perfiles actuales, Andrés tiene `patient` + `nutritionist` e `is_sudo`, y Alba tiene `patient`. Si el proyecto no está vinculado a Supabase CLI, detener la aplicación remota y documentar esa limitación; no ejecutar SQL manual contra producción.

### Task 2: Funciones seguras, invitaciones y RLS

**Files:**
- Modify: `supabase/migrations/202609140001_users_groups_roles.sql`

- [ ] **Step 1: Crear funciones de consulta de permisos**

Añadir funciones `security definer`, con `set search_path = public`, que devuelvan solo escalares o filas autorizadas:

```sql
create or replace function public.current_user_is_sudo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_sudo and is_active from profiles where id = auth.uid()), false)
$$;

create or replace function public.current_user_is_active()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_active from profiles where id = auth.uid()), false)
$$;

create or replace function public.has_group_role(requested_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_memberships gm
    join user_roles ur on ur.membership_id = gm.id
    join profiles p on p.id = gm.user_id
    where gm.user_id = auth.uid()
      and gm.status = 'active'
      and p.is_active
      and ur.role_code = requested_role
  )
$$;

create or replace function public.can_manage_plan(target_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    (target_user = auth.uid() and has_group_role('patient'))
    or exists (
      select 1
      from group_memberships actor
      join user_roles actor_role on actor_role.membership_id = actor.id
      join group_memberships target on target.group_id = actor.group_id
      join user_roles target_role on target_role.membership_id = target.id
      where actor.user_id = auth.uid() and actor.status = 'active'
        and actor_role.role_code = 'nutritionist'
        and target.user_id = target_user and target.status = 'active'
        and target_role.role_code = 'patient'
    )
$$;
```

Revocar ejecución de `public` y concederla solo a `authenticated` para todas las funciones expuestas.

- [ ] **Step 2: Crear RPC de invitación y asignación**

Implementar `invite_group_member(email text, target_group uuid, requested_roles text[])`. Debe normalizar el correo, rechazar arrays vacíos o roles desconocidos y aplicar estas reglas:

```sql
if current_user_is_sudo() then
  null; -- cualquier grupo y rol del catálogo
elsif has_group_role('group_admin')
      and target_group = (select group_id from group_memberships
                          where user_id = auth.uid() and status = 'active')
      and requested_roles <@ array['patient', 'self_manager']::text[] then
  null;
else
  raise exception using errcode = '42501', message = 'No autorizado para asignar esos roles';
end if;
```

La función inserta `group_memberships`, sus `user_roles` y una fila `permission_audit_log` dentro de la misma transacción. Crear con la misma validación `set_member_roles(membership uuid, requested_roles text[])` y `disable_membership(membership uuid)`. `set_member_roles` debe impedir modificar los roles propios. `disable_membership` limita el acceso al grupo; una RPC sudo adicional `set_user_active(target_user uuid, active boolean)` controla `profiles.is_active`, registra auditoría e impide desactivar al último sudo activo.

- [ ] **Step 3: Crear RPC de activación**

Implementar `claim_pending_invitation()` sin parámetros. Debe leer `auth.jwt() ->> 'email'`, bloquear `for update` una invitación pendiente del mismo correo, rechazar una segunda membresía activa, enlazar `auth.uid()`, activar la membresía y registrar auditoría. Si no existe invitación, debe devolver `false`, no revelar otros correos.

- [ ] **Step 4: Aplicar RLS a identidades y dietas**

Habilitar RLS en `groups`, `group_memberships`, `roles`, `user_roles`, `permission_audit_log` y confirmar que ya está habilitada en `daily_plan`. Definir políticas de solo lectura para los datos del propio alcance; todas las mutaciones de identidad pasan por RPC.

Reemplazar las políticas de escritura de `daily_plan` por:

```sql
create policy daily_plan_read on public.daily_plan for select to authenticated
using (public.current_user_is_active()
       and (user_id = auth.uid() or public.can_manage_plan(user_id)));

create policy daily_plan_insert on public.daily_plan for insert to authenticated
with check (public.can_manage_plan(user_id));

create policy daily_plan_update on public.daily_plan for update to authenticated
using (public.can_manage_plan(user_id))
with check (public.can_manage_plan(user_id));

create policy daily_plan_delete on public.daily_plan for delete to authenticated
using (public.can_manage_plan(user_id));
```

Antes de crearlas, eliminar por nombre las políticas antiguas inspeccionadas con `select policyname, cmd, qual, with_check from pg_policies where tablename = 'daily_plan';`; no usar `drop policy ...` con nombres inventados.

- [ ] **Step 5: Verificar permisos directamente en staging**

Ejecutar consultas con JWT de Andrés, Alba y un usuario de otro grupo. Resultado esperado: sudo sin rol funcional no amplía acceso a dietas; Alba `patient` no escribe planes; Alba con `self_manager` solo escribe el suyo; Andrés `nutritionist` escribe planes `patient` de Enredaos; ningún actor cruza grupos.

### Task 3: Capacidades de interfaz con pruebas unitarias

**Files:**
- Create: `lib/authz.js`
- Create: `lib/authz.d.ts`
- Create: `tests/authz.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Escribir pruebas que fallen**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveCapabilities } from '../lib/authz.js';

test('patient no abre administración', () => {
  assert.deepEqual(deriveCapabilities(false, ['patient']), {
    canOpenDietAdmin: false, canManageOwnPlan: false,
    canManageGroupPlans: false, canManageGroupUsers: false,
    canManageAllUsers: false,
  });
});

test('self_manager solo administra su dieta', () => {
  assert.equal(deriveCapabilities(false, ['patient', 'self_manager']).canManageOwnPlan, true);
  assert.equal(deriveCapabilities(false, ['patient', 'self_manager']).canManageGroupPlans, false);
});

test('nutritionist abre administración del grupo', () => {
  assert.equal(deriveCapabilities(false, ['patient', 'nutritionist']).canManageGroupPlans, true);
});

test('sudo solo amplía gestión de identidades', () => {
  const value = deriveCapabilities(true, ['patient']);
  assert.equal(value.canManageAllUsers, true);
  assert.equal(value.canOpenDietAdmin, false);
  assert.equal(value.canManageGroupPlans, false);
});
```

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run: `node --test tests/authz.test.mjs`

Expected: FAIL porque `lib/authz.js` todavía no existe.

- [ ] **Step 3: Implementar la función mínima**

```js
export function deriveCapabilities(isSudo, roles) {
  const assigned = new Set(roles);
  const managesOwn = assigned.has('self_manager');
  const managesGroupPlans = assigned.has('nutritionist');
  return {
    canOpenDietAdmin: managesOwn || managesGroupPlans,
    canManageOwnPlan: managesOwn || managesGroupPlans,
    canManageGroupPlans: managesGroupPlans,
    canManageGroupUsers: assigned.has('group_admin'),
    canManageAllUsers: isSudo,
  };
}
```

Declarar en `lib/authz.d.ts` `RoleCode`, `Capabilities` y la firma exacta. Añadir `"test": "node --test tests/*.test.mjs"` a `scripts` de `package.json`.

- [ ] **Step 4: Ejecutar las pruebas**

Run: `npm test`

Expected: 4 tests PASS.

### Task 4: Activar invitaciones después de OAuth

**Files:**
- Modify: `app/auth/callback/route.ts`

- [ ] **Step 1: Reclamar la invitación tras crear la sesión**

Conservar el intercambio actual y, si no falla, ejecutar:

```ts
const { error: claimError } = await supabase.rpc('claim_pending_invitation');
if (claimError) {
  const url = new URL('/', origin);
  url.searchParams.set('error', 'invitation-claim-error');
  return NextResponse.redirect(url);
}
return NextResponse.redirect(new URL(next, origin));
```

Validar `next` antes de usarlo: aceptar solo rutas que comiencen por `/` y no por `//`; en otro caso usar `/`.

- [ ] **Step 2: Verificar callback**

Run: `npx eslint app/auth/callback/route.ts && npx tsc --noEmit`

Expected: exit code 0. Manualmente, una invitación con el correo correcto pasa a `active`; sin invitación, el inicio de sesión continúa; un error real redirige con `invitation-claim-error`.

### Task 5: Adaptar el panel de dietas

**Files:**
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: Sustituir el tipo de rol único**

Cambiar la carga de `profiles.role` por una consulta/RPC que devuelva el perfil actual, `is_sudo`, roles activos y pacientes autorizados. Derivar capacidades con `deriveCapabilities`. Redirigir a `/` cuando `canOpenDietAdmin` sea falso.

- [ ] **Step 2: Limitar el selector con datos autorizados**

Para `nutritionist`, cargar miembros activos de su mismo grupo que tengan `patient`. Para `self_manager` sin `nutritionist`, construir la lista con el perfil propio. No descargar todos los perfiles para filtrarlos en el cliente.

Mantener el editor y persistencia actuales; RLS valida cada lectura y escritura. Cambiar textos genéricos de error para distinguir `403` de fallos transitorios sin mostrar detalles sensibles.

- [ ] **Step 3: Verificar ambos modos**

Run: `npx eslint app/admin/page.tsx lib/authz.js && npx tsc --noEmit && npm test`

Expected: exit code 0; `patient` conserva todas las operaciones actuales sobre su propia dieta, `self_manager` ve una sola identidad en `/admin` y `nutritionist` ve solo pacientes activos de su grupo.

### Task 6: Crear gestión compartida de usuarios

**Files:**
- Create: `app/users/page.tsx`

- [ ] **Step 1: Implementar guard y carga por alcance**

Crear un Client Component que cargue capacidades. Permitir acceso si `canManageAllUsers || canManageGroupUsers`; sudo carga grupos y membresías globales, mientras `group_admin` recibe solo su grupo mediante una RPC/vista protegida.

- [ ] **Step 2: Implementar acciones autorizadas**

Formulario de invitación con correo, grupo (solo sudo) y roles. Para `group_admin`, mostrar exclusivamente `patient` y `self_manager`; para sudo, los cuatro roles. Usar `invite_group_member`, `set_member_roles` y `disable_membership`; recargar tras cada operación y presentar errores seguros.

Deshabilitar la edición de roles propios y la desactivación del propio usuario en la interfaz, aunque las RPC también deben rechazarlo.

- [ ] **Step 3: Verificar la matriz visual**

Comprobar manualmente:

1. Sudo ve todos los grupos y puede asignar cualquier rol.
2. `group_admin` solo ve Enredaos y solo asigna `patient`/`self_manager`.
3. `nutritionist` sin privilegios administrativos no abre `/users`.
4. Ningún usuario puede elevar sus propios permisos.

Run: `npx eslint app/users/page.tsx && npx tsc --noEmit`

Expected: exit code 0.

### Task 7: Verificación integral y despliegue gradual

**Files:**
- Verify: all files listed above

- [ ] **Step 1: Ejecutar comprobaciones locales**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`

Expected: todas las pruebas pasan, ESLint y TypeScript no informan errores y Next.js compila `/`, `/admin`, `/users` y `/auth/callback`.

- [ ] **Step 2: Validar RLS antes de publicar la interfaz**

Aplicar primero la migración en staging y ejecutar la matriz de Task 2. No desplegar las nuevas pantallas hasta confirmar accesos denegados entre grupos y que sudo no obtiene acceso implícito a dietas.

- [ ] **Step 3: Prueba funcional final**

Invitar una cuenta de prueba, activarla mediante Google, asignar `self_manager`, comprobar `/admin`, retirar el rol y confirmar que pierde acceso. Desactivar la membresía y verificar que conserva historial pero no puede operar.
