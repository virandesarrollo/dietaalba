# Diseño de permisos por funcionalidad

## Alcance

Añadir permisos configurables por usuario para controlar la valoración de recetas y el envío del informe a la nutricionista. Los roles seguirán representando responsabilidades administrativas y profesionales; estos permisos controlarán funciones concretas de la aplicación.

## Modelo de datos

### `features`

Catálogo de funcionalidades disponibles. La primera versión contiene:

- `rate_recipes`: valorar recetas, crear notas y editar o eliminar valoraciones propias.
- `send_report`: consultar, copiar y enviar por WhatsApp el resumen de valoraciones y notas propias.

### `membership_features`

Relaciona una membresía con las funcionalidades que tiene autorizadas. La ausencia de una fila significa que la funcionalidad está denegada. Los permisos pertenecen al contexto de la membresía del grupo y no se deducen de los roles.

Las funcionalidades son independientes: un usuario puede tener cualquiera de las cuatro combinaciones posibles.

## Interfaz del paciente

- Sin `rate_recipes`, se ocultan estrellas, botones para añadir notas y acciones para editar o eliminar valoraciones.
- Sin `send_report`, se ocultan las acciones de copiar, enviar por WhatsApp y la vista previa del informe.
- Con al menos uno de los permisos, la pestaña `Notas chica` permanece visible y muestra solo las funciones autorizadas.
- Sin ninguno, la pestaña se oculta completamente y, si estaba seleccionada cuando cambian los permisos, la interfaz vuelve a `Plan diario`.
- `send_report` sin `rate_recipes` permite consultar y enviar valoraciones existentes, pero no modificarlas.

Ocultar componentes mejora la experiencia, pero la base de datos será la autoridad final.

## Gestión de permisos

La pantalla `/users` permitirá seleccionar funcionalidades durante una invitación y modificarlas posteriormente.

- `sudo` puede gestionar permisos de cualquier usuario.
- `group_admin` puede gestionar permisos de otros miembros de su grupo.
- Ningún administrador puede cambiar sus propios permisos.
- Los permisos se seleccionan expresamente; no existen valores implícitos por rol.
- Cada cambio registra actor, membresía, funcionalidades resultantes y fecha en `permission_audit_log`, sin duplicar datos personales.

La invitación, sus roles y sus permisos deben guardarse en una sola transacción para evitar membresías parcialmente configuradas.

## Seguridad

Las funciones de asignación validarán el mismo alcance que la gestión de roles: global para `sudo` y limitado al grupo propio para `group_admin`.

Las políticas RLS de `recipe_reviews` permitirán operar sobre registros propios solo cuando la membresía activa incluya `rate_recipes`. El acceso necesario para generar el informe propio exigirá `send_report`. Como las dos capacidades tienen permisos distintos sobre los mismos datos, las lecturas se autorizarán con `rate_recipes` o `send_report`, mientras las escrituras exigirán `rate_recipes`.

Un usuario desactivado o sin membresía activa no tendrá acceso. `sudo`, `group_admin` y `nutritionist` no obtendrán acceso a valoraciones por su rol; necesitan el permiso de funcionalidad en su propia membresía.

## Migración inicial

La migración exigirá que `Enredaos` tenga exactamente dos membresías activas: una asociada al único perfil `sudo` activo, que representa a Andrés, y otra no sudo, que representa a Alba.

- Alba recibirá `rate_recipes` y `send_report`.
- Andrés no recibirá ninguna de las dos.

Si la identificación no es inequívoca, la migración abortará para evitar permisos incorrectos. No se modificarán roles existentes.

## Errores y consistencia

- Una funcionalidad desconocida o una lista duplicada se rechaza.
- Un fallo al asignar permisos durante una invitación revierte también la membresía y los roles.
- La interfaz solo confirma una modificación después de recargar correctamente los datos autorizados.
- Los mensajes no revelarán usuarios ni grupos fuera del alcance del administrador.

## Verificación

- Probar las cuatro combinaciones de `rate_recipes` y `send_report`.
- Verificar visibilidad de controles y retorno automático a `Plan diario`.
- Probar mediante RLS lectura, inserción, actualización y borrado de `recipe_reviews`.
- Verificar que roles sin permisos no obtienen acceso implícito.
- Verificar administración global de `sudo`, alcance de `group_admin` y prohibición de autoedición.
- Confirmar que invitación, roles y permisos son atómicos.
