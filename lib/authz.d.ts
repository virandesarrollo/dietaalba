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

export type AppView = 'patient' | 'admin' | 'users' | 'settings' | 'training' | 'gymAdmin';

export function deriveAvailableViews(
  capabilities: Capabilities,
  featureCapabilities?: {
    canAccessSettings?: boolean;
    canTrackGymWorkouts?: boolean;
    canManageGymWorkouts?: boolean;
  },
): AppView[];

export type PersonalAppView = Extract<AppView, 'patient' | 'training' | 'settings'>;
export type AdminView = Extract<AppView, 'admin' | 'users' | 'gymAdmin'>;

export function deriveAppViews(availableViews: readonly unknown[]): PersonalAppView[];

export function deriveAdminViews(availableViews: readonly unknown[]): AdminView[];
