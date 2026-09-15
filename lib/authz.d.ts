export type RoleCode =
  | 'patient'
  | 'self_manager'
  | 'nutritionist'
  | 'group_admin'
  | 'gym_patient'
  | 'gym_coach';

export interface Capabilities {
  canOpenDietAdmin: boolean;
  canManageOwnPlan: boolean;
  canManageGroupPlans: boolean;
  canManageGroupUsers: boolean;
  canManageAllUsers: boolean;
  isGymPatient: boolean;
  isGymCoach: boolean;
}

export function deriveCapabilities(
  isSudo: boolean,
  roles: readonly RoleCode[],
): Capabilities;

export type AppView = 'patient' | 'admin' | 'users' | 'settings' | 'training';

export function deriveAvailableViews(
  capabilities: Capabilities,
  featureCapabilities?: {
    canAccessSettings?: boolean;
    canTrackGymWorkouts?: boolean;
    canManageGymWorkouts?: boolean;
  },
): AppView[];
