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
    isGymPatient: assigned.has('gym_patient'),
    isGymCoach: assigned.has('gym_coach'),
  };
}

export function deriveAvailableViews(capabilities, featureCapabilities = {}) {
  const views = ['patient'];
  if (capabilities.canOpenDietAdmin) views.push('admin');
  if (capabilities.canManageGroupUsers || capabilities.canManageAllUsers) views.push('users');
  if (featureCapabilities.canAccessSettings) views.push('settings');
  if (
    (capabilities.isGymPatient && featureCapabilities.canTrackGymWorkouts)
    || (capabilities.isGymCoach && featureCapabilities.canManageGymWorkouts)
  ) views.push('training');
  if (capabilities.isGymCoach && featureCapabilities.canManageGymWorkouts) {
    views.push('gymAdmin');
  }
  return views;
}
