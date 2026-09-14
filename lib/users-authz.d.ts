import type { RoleCode } from './authz.js';

export function assignableRoles(isSudo: boolean): RoleCode[];
export function deriveMemberActions(
  isSudo: boolean,
  currentUserId: string,
  memberUserId: string | null,
  membershipStatus: 'pending' | 'active' | 'disabled',
  targetRoles: readonly RoleCode[],
  isAccountActive: boolean | null,
): {
  canEditRoles: boolean;
  canDisableMembership: boolean;
  canSetAccountActive: boolean;
  canSetSudo: boolean;
};
export function mutationSucceededAfterReload(reloaded: boolean): boolean;
export function destructiveActionConfirmation(
  action: 'membership' | 'account' | 'sudo-grant' | 'sudo-revoke',
  fullName: string | null,
  email: string,
  groupName: string,
): string;
