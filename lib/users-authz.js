const ALL_ROLES = ['patient', 'self_manager', 'nutritionist', 'group_admin'];
const GROUP_ADMIN_ROLES = ['patient', 'self_manager'];

export function assignableRoles(isSudo) {
  return isSudo ? [...ALL_ROLES] : [...GROUP_ADMIN_ROLES];
}

export function deriveMemberActions(isSudo, currentUserId, memberUserId, membershipStatus, targetRoles, isAccountActive) {
  const isSelf = memberUserId === currentUserId;
  const membershipEnabled = membershipStatus !== 'disabled';
  const hasElevatedRole = targetRoles.includes('nutritionist') || targetRoles.includes('group_admin');
  return {
    canEditRoles: !isSelf && membershipEnabled,
    canDisableMembership: !isSelf && membershipEnabled && (isSudo || !hasElevatedRole),
    canSetAccountActive: isSudo && Boolean(memberUserId) && !isSelf,
    canSetSudo: isSudo && Boolean(memberUserId) && !isSelf && isAccountActive === true,
  };
}

export function mutationSucceededAfterReload(reloaded) {
  return reloaded === true;
}

export function destructiveActionConfirmation(action, fullName, email, groupName) {
  const identity = fullName ? `${fullName} (${email})` : email;
  if (action === 'membership') return `¿Desactivar la membresía de ${identity} en ${groupName}?`;
  if (action === 'account') return `¿Desactivar la cuenta de ${identity}, miembro de ${groupName}?`;
  return action === 'sudo-revoke'
    ? `¿Retirar el acceso sudo a ${identity}, miembro de ${groupName}?`
    : `¿Conceder acceso sudo a ${identity}, miembro de ${groupName}?`;
}
