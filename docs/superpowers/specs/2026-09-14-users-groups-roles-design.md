# Diseño de usuarios, grupos y roles

## Alcance

Diseñar la gestión de usuarios, grupos y permisos de Dieta Alba. Esta fase admite grupos independientes y un único grupo activo por usuario. La jerarquía entre grupos y los perfiles específicos de entrenamiento quedan fuera de alcance.

## Modelo de datos

### `profiles`

Una fila por usuario de Supabase Auth, con sus datos personales y `is_sudo`. `is_sudo` es un privilegio global de administración de identidades; no concede acceso a dietas ni a otros datos funcionales.

### `groups`

Representa grupos independientes, por ejemplo `Enredaos`. En esta fase no existen grupos padre ni herencia entre grupos.

### `group_memberships`

Relaciona un perfil con un grupo. Incluye el estado `pending`, `active` o `disabled`. La base de datos debe impedir que un usuario tenga más de una membresía activa.

Una invitación pendiente se identifica por correo. Cuando el usuario inicia sesión con la misma cuenta de Google, la membresía se vincula a su identificador de Supabase y pasa a `active`.

### `roles`

Catálogo inicial:

- `patient`
- `self_manager`
- `nutritionist`
- `group_admin`

### `user_roles`

Asigna uno o varios roles a una membresía. Los roles pertenecen al contexto del grupo y sus permisos se suman. No se modela herencia técnica entre roles.

## Permisos

### `patient`

Puede consultar su dieta y registrar sus comidas. No puede entrar en el panel de administración.

Conservará todas las operaciones disponibles en la aplicación actual sobre su propia dieta, incluidos cambios de recetas, comidas libres e intercambio de días.

### `self_manager`

Incluye las capacidades funcionales de `patient` y añade el acceso a `/admin`, limitado al plan propio. La diferencia respecto a `patient` es el acceso a ese flujo administrativo, no la pérdida de funciones de la aplicación actual.

### `nutritionist`

Puede consultar y modificar los planes de todos los miembros con rol `patient` de su grupo. Un nutricionista solo tiene dieta propia si también tiene el rol `patient`.

### `group_admin`

Gestiona miembros e invitaciones de su grupo. Puede asignar o retirar `patient` y `self_manager`, pero no `nutritionist`, `group_admin` ni `sudo`. No puede elevar sus propios privilegios.

### `sudo`

Puede gestionar usuarios, grupos, membresías y cualquier asignación de roles en todo el sistema. No puede consultar ni modificar dietas por ser `sudo`; necesita además el rol funcional correspondiente. El sistema debe impedir que se elimine o desactive el último usuario `sudo`.

## Interfaces y flujos

### Administración de dietas

Se reutilizará `/admin` con capacidades ajustadas al usuario:

- Un `nutritionist` verá como seleccionables los miembros `patient` de su grupo.
- Un `self_manager` sin `nutritionist` solo se verá a sí mismo.
- Un `patient` sin ninguno de esos roles no podrá abrir `/admin`.

La interfaz mostrará únicamente acciones autorizadas, pero Supabase será la barrera de seguridad efectiva.

### Gestión de usuarios

El `sudo` dispondrá de una vista global de usuarios y grupos. El `group_admin` reutilizará la misma gestión limitada a su grupo y a los roles que puede asignar.

El flujo de alta será:

1. El administrador introduce el correo del invitado.
2. Selecciona el grupo y los roles permitidos.
3. Se crea una membresía `pending` con trazabilidad del administrador que la generó.
4. El invitado inicia sesión con Google usando el mismo correo.
5. El sistema vincula la cuenta y activa la membresía.

No se incluyen enlaces de invitación abiertos en esta fase.

## Seguridad y trazabilidad

- Las políticas RLS deben impedir lecturas y escrituras entre grupos.
- Las operaciones sensibles de invitación y asignación de roles deben ejecutarse mediante funciones seguras de base de datos.
- Cada cambio de membresía o rol registrará actor, fecha, operación y entidad afectada.
- Desactivar un usuario conservará sus datos y su historial.
- Los mensajes de error no revelarán la existencia ni los datos de usuarios ajenos al alcance del actor.

## Casos iniciales

- Andrés pertenece a `Enredaos`, tiene `is_sudo = true` y los roles `patient` y `nutritionist`. Puede administrar identidades globalmente, editar su dieta y gestionar las dietas de los pacientes de `Enredaos`.
- Alba pertenece a `Enredaos` y tiene `patient`. Puede consultar su dieta y registrar comidas.
- Si Alba recibe también `self_manager`, usará `/admin` para editar exclusivamente su propio plan.

## Verificación

- Probar cada rol de forma aislada y las combinaciones previstas.
- Verificar que `sudo` sin rol funcional no puede acceder a dietas.
- Verificar que `nutritionist` no accede a usuarios de otros grupos.
- Verificar que `self_manager` solo consulta y modifica su propio plan.
- Verificar las restricciones para asignar roles y conservar al menos un `sudo`.
- Probar activación, correo incorrecto, invitación ya utilizada y membresía desactivada.
