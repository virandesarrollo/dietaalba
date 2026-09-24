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

export type AppView = 'patient' | 'admin' | 'users' | 'settings' | 'training' | 'health' | 'friends' | 'gymAdmin' | 'patientControl';

export function deriveAvailableViews(
  capabilities: Capabilities,
  featureCapabilities?: {
    canAccessSettings?: boolean;
    canTrackGymWorkouts?: boolean;
    canManageGymWorkouts?: boolean;
    canTrackHealth?: boolean;
    canUsePatientFriends?: boolean;
  },
): AppView[];

export type PersonalAppView = Extract<AppView, 'patient' | 'training' | 'health' | 'friends' | 'settings'>;
export type AdminView = Extract<AppView, 'admin' | 'users' | 'gymAdmin' | 'patientControl'>;

export function deriveAppViews(availableViews: readonly unknown[]): PersonalAppView[];

export function deriveAdminViews(availableViews: readonly unknown[]): AdminView[];
