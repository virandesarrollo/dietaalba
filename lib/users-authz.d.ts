import type { RoleCode } from './authz.js';
import type { FeatureCode } from './feature-permissions.js';

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
  canSetFeatures: boolean;
};
export function normalizeFeatureCodes(features: readonly string[] | null | undefined): FeatureCode[];
export function toggleFeature(current: readonly FeatureCode[], feature: FeatureCode): FeatureCode[];
export function groupManageableMembers<
  TGroup extends { id: string; name: string },
  TMember extends { membership_id: string; group_id: string; full_name: string | null; email: string },
>(groups: readonly TGroup[], members: readonly TMember[]): Array<TGroup & { members: TMember[] }>;
export function mutationSucceededAfterReload(reloaded: boolean): boolean;
export function destructiveActionConfirmation(
  action: 'membership' | 'account' | 'sudo-grant' | 'sudo-revoke',
  fullName: string | null,
  email: string,
  groupName: string,
): string;
