export function deriveCapabilities(isSudo, roles) {
  const assigned = new Set(roles);
  const managesGroupPlans = assigned.has('nutritionist');
  const managesOwnPlan =
    assigned.has('self_manager') ||
    (managesGroupPlans && assigned.has('patient'));

  return {
    canOpenDietAdmin: managesOwnPlan || managesGroupPlans,
    canManageOwnPlan: managesOwnPlan,
    canManageGroupPlans: managesGroupPlans,
    canManageGroupUsers: assigned.has('group_admin'),
    canManageAllUsers: isSudo,
  };
}

export function deriveAvailableViews(capabilities) {
  const views = ['patient'];
  if (capabilities.canOpenDietAdmin) views.push('admin');
  if (capabilities.canManageGroupUsers || capabilities.canManageAllUsers) views.push('users');
  return views;
}
