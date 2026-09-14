export type RoleCode =
  | 'patient'
  | 'self_manager'
  | 'nutritionist'
  | 'group_admin';

export interface Capabilities {
  canOpenDietAdmin: boolean;
  canManageOwnPlan: boolean;
  canManageGroupPlans: boolean;
  canManageGroupUsers: boolean;
  canManageAllUsers: boolean;
}

export function deriveCapabilities(
  isSudo: boolean,
  roles: readonly RoleCode[],
): Capabilities;

export type AppView = 'patient' | 'admin' | 'users' | 'settings';

export function deriveAvailableViews(
  capabilities: Capabilities,
  featureCapabilities?: { canAccessSettings?: boolean },
): AppView[];
