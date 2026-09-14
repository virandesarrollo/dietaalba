# Ajustes personales y temas

## Objetivo

Permitir que cada usuario autorizado acceda a sus ajustes personales y seleccione un tema visual. La primera versión ofrece `Tema Alba` y `Tema Oscuro`, aplica el cambio inmediatamente y lo conserva en Supabase para todos los dispositivos del usuario.

## Permisos

- `access_settings`: permite ver el acceso a Ajustes y abrir `/settings`.
- `change_theme`: permite utilizar el selector de tema dentro de Ajustes.
- Para cambiar el tema se requieren ambos permisos.
- Si un usuario tiene `access_settings` pero no `change_theme`, `/settings` muestra `No tienes ajustes disponibles`.
- Sin `access_settings`, el acceso se oculta y `/settings` rechaza la navegación directa.
- Los permisos se administran desde `/users` con el mismo alcance y reglas que las funcionalidades existentes.
- La migración concede ambos permisos a todos los usuarios existentes. En nuevas invitaciones, el administrador decide si los concede.

## Persistencia

Se crea una tabla `user_preferences` con una fila por usuario y, como mínimo:

- `user_id`, clave primaria y referencia al usuario.
- `theme`, limitado a `alba` o `dark`, con `alba` como valor predeterminado.
- marcas de tiempo para creación y actualización.

Las políticas RLS permiten a cada usuario autenticado leer y modificar únicamente sus preferencias. El tema no se guarda en `profiles` para mantener separadas identidad y preferencias.

## Interfaz y navegación

- Se añade la vista `Ajustes` al selector común de navegación cuando existe `access_settings`.
- `/settings` muestra el tema activo y dos opciones: `Tema Alba` y `Tema Oscuro`.
- La selección aplica el tema inmediatamente y guarda automáticamente en Supabase.
- Mientras se guarda se muestra estado de progreso. Si falla, se restaura el tema anterior y aparece un error.
- El tema se aplica a `/`, `/admin`, `/users` y `/settings`.

## Aplicación del tema

El tema activo se carga al iniciar la sesión. `Tema Alba` conserva la apariencia actual. `Tema Oscuro` define fondos, superficies, bordes, textos y acentos mediante variables CSS compartidas para evitar lógica duplicada en cada página.

Antes de conocer la preferencia remota se utiliza `Tema Alba`. Al cerrar sesión se elimina el tema personal de la interfaz y se vuelve a `Tema Alba`.

## Seguridad y errores

- Ocultar un acceso no sustituye la protección de la ruta ni las políticas RLS.
- La comprobación de permisos falla de forma cerrada: ante un error no se muestra Ajustes ni se permite cambiar el tema.
- El valor de tema se valida tanto en la aplicación como en la base de datos.
- Una escritura antigua no puede sobrescribir una selección posterior si el usuario cambia rápidamente de tema.

## Pruebas y verificación

- Capacidades derivadas para `access_settings` y `change_theme`, incluidas combinaciones parciales.
- Visibilidad de Ajustes y protección de `/settings`.
- Selección inmediata, guardado automático, restauración tras error y control de escrituras solapadas.
- Carga y aplicación del tema en las cuatro vistas.
- Migración, RLS, pruebas existentes, TypeScript y build de producción.

## Fuera de alcance

- Más ajustes personales aparte del tema.
- Temas adicionales o personalización de colores.
- Preferencia distinta por dispositivo.
