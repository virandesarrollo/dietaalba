export interface CurrentAuthLoad {
  active: boolean;
  generation: number;
  userId: string | null;
}

export interface PendingAuthLoad {
  generation: number;
  userId: string;
  hasError?: boolean;
}

export function canCommitCapabilityLoad(current: CurrentAuthLoad, load: PendingAuthLoad): boolean;

export interface AuthIdentityState {
  initialized: boolean;
  generation: number;
  userId: string | null;
}

export function advanceAuthIdentity(
  current: AuthIdentityState,
  userId: string | null,
): { state: AuthIdentityState; changed: boolean };
