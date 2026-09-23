const ALL_ROLES = ['patient', 'self_manager', 'nutritionist', 'group_admin', 'gym_patient', 'gym_coach'];
const GROUP_ADMIN_ROLES = ['patient', 'self_manager'];
const FEATURE_CODES = [
  'rate_recipes',
  'send_report',
  'access_settings',
  'change_theme',
  'track_gym_workouts',
  'manage_gym_workouts',
  'track_health',
  'track_weight',
  'track_blood_pressure',
  'track_water',
];

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
    canSetFeatures: !isSelf,
  };
}

export function normalizeFeatureCodes(features) {
  if (!Array.isArray(features) || features.some((feature) => !FEATURE_CODES.includes(feature))) return [];
  return [...new Set(features)];
}

export function toggleFeature(current, feature) {
  return current.includes(feature) ? current.filter((value) => value !== feature) : [...current, feature];
}

export function groupManageableMembers(groups, members) {
  const compare = (left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' });
  const membersByGroup = new Map(groups.map((group) => [group.id, []]));

  for (const member of members) {
    membersByGroup.get(member.group_id)?.push(member);
  }

  return [...groups]
    .sort((left, right) => compare(left.name, right.name) || compare(left.id, right.id))
    .map((group) => ({
      ...group,
      members: membersByGroup.get(group.id).sort((left, right) => {
        const leftName = left.full_name?.trim() || left.email;
        const rightName = right.full_name?.trim() || right.email;
        return compare(leftName, rightName) || compare(left.email, right.email) || compare(left.membership_id, right.membership_id);
      }),
    }));
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
