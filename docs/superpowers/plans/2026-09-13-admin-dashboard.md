# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear `/admin` para que nutricionistas autorizados gestionen los planes diarios de pacientes.

**Architecture:** Un Client Component aislado en `app/admin/page.tsx` reutiliza el cliente Supabase existente. La página valida sesión y rol, carga pacientes y filas de `daily_plan`, y guarda cada bloque mediante actualización o inserción para respetar el esquema real consumido por la vista de paciente.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase, Tailwind CSS 4, lucide-react.

---

### Task 1: Dashboard protegido y editor

**Files:**
- Create: `app/admin/page.tsx`

- [ ] **Step 1: Confirmar el contrato existente**

Revisar `lib/supabase.js` y las consultas de `app/page.tsx` para usar los nombres reales: `user_id`, `date`, `meal_type`, `title`, `ingredients`, `is_completed`.

- [ ] **Step 2: Crear el componente cliente**

Implementar tipos `Profile`, `DailyPlanRow` y `MealDraft`; guard de sesión/rol; carga de pacientes; selector de fecha; editor de seis comidas; estados de carga, error y éxito; navegación a `/`; y cierre de sesión.

- [ ] **Step 3: Implementar persistencia mínima**

Consultar filas por paciente y fecha. En `Guardar Plan`, actualizar por `id` cuando exista y añadir una fila cuando no exista, manteniendo `is_completed` en registros existentes.

- [ ] **Step 4: Verificar estáticamente**

Run: `npx eslint app/admin/page.tsx`
Expected: exit code 0, sin errores.

Run: `npx tsc --noEmit`
Expected: exit code 0, sin errores TypeScript.

Run: `npm run build`
Expected: exit code 0 y ruta `/admin` compilada.

### Task 2: Revisión final

**Files:**
- Verify: `app/admin/page.tsx`

- [ ] **Step 1: Confirmar alcance**

Verificar que `app/page.tsx` y el resto de la web no se han modificado.

- [ ] **Step 2: Confirmar requisitos**

Comprobar en el código los iconos solicitados, el fondo `#FAF7F2`, sidebar de escritorio, seis bloques de comida, selector de paciente/fecha, guard de rol, guardado y notificación.
