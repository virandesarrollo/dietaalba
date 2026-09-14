# Diseño del dashboard de administración

## Alcance

Añadir exclusivamente la ruta cliente `/admin`, sin modificar la vista actual de pacientes. La página permitirá a usuarios con rol `nutritionist` seleccionar un paciente, una fecha y gestionar sus comidas en la tabla `daily_plan` existente.

## Acceso y datos

- Al montar, obtener la sesión activa y consultar el perfil del usuario autenticado.
- Redirigir a `/` cuando no haya sesión, ocurra un error de autorización o el rol no sea `nutritionist`.
- Cargar los perfiles con rol `patient` y seleccionar el primero por defecto.
- Cargar `daily_plan` por `user_id` y `date`. La implementación respetará el esquema real de filas por comida usado por `app/page.tsx` (`meal_type`, `title`, `ingredients`, etc.), incluyendo seis bloques: desayuno, media mañana, almuerzo, merienda, cena y postre nocturno.
- Al guardar, actualizar o insertar cada bloque por paciente, fecha y tipo de comida. Conservar `id` e `is_completed` cuando exista una fila previa.

## Interfaz

- Escritorio con sidebar fijo a la izquierda y contenido principal flexible.
- Sidebar con identidad de la aplicación, perfil del nutricionista, selector/listado de pacientes, enlace a la vista del paciente y cierre de sesión.
- Cabecera principal con paciente seleccionado y controles de fecha anterior, hoy, fecha directa y siguiente.
- Editor en tarjetas pastel para las seis comidas, con campos de título e ingredientes.
- Botón destacado de guardado y aviso temporal de éxito; mostrar errores accionables y estados de carga/guardado.
- Fondo `#FAF7F2`, tarjetas blancas redondeadas, sombras suaves y acentos rosa, melocotón y verde.

## Errores y seguridad

- No mostrar el dashboard hasta completar la autorización.
- Deshabilitar acciones durante cargas o guardados y mantener el formulario consistente ante cambios de paciente o fecha.
- Mostrar errores de lectura/escritura sin registrar datos sensibles.
- El control cliente mejora la navegación, pero las políticas RLS de Supabase siguen siendo la barrera de seguridad autoritativa.

## Verificación

- Comprobar tipado con TypeScript, reglas de ESLint y compilación de Next.js.
- Verificar que solo se añade la ruta y documentación relacionadas, sin alterar `app/page.tsx`.
