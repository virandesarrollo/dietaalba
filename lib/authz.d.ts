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
