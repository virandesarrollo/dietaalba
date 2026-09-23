export type FeatureCode =
  | 'rate_recipes'
  | 'send_report'
  | 'access_settings'
  | 'change_theme'
  | 'track_gym_workouts'
  | 'manage_gym_workouts'
  | 'track_health'
  | 'track_weight'
  | 'track_blood_pressure'
  | 'track_water'
  | 'track_snacks' | 'track_night_binges';

export type FeatureCapabilities = {
  canRateRecipes: boolean;
  canSendReport: boolean;
  canOpenNotes: boolean;
  canAccessSettings: boolean;
  canChangeTheme: boolean;
  canTrackGymWorkouts: boolean;
  canManageGymWorkouts: boolean;
  canTrackHealth: boolean;
  canTrackWeight: boolean;
  canTrackBloodPressure: boolean;
  canTrackWater: boolean;
  canTrackSnacks: boolean;
  canTrackNightBinges: boolean;
};

export function deriveFeatureCapabilities(
  features: readonly string[],
): FeatureCapabilities;

export type PatientRequest = {
  generation: number;
  requestId: number;
  userId: string;
  date: string;
};

export type LatestRequestGuard = {
  currentGeneration(): number;
  invalidate(): number;
  invalidateRequests(): void;
  isGenerationCurrent(candidate: number): boolean;
  startRequest(generation: number, userId: string, date: string): PatientRequest;
  isCurrent(request: PatientRequest): boolean;
};

export function createLatestRequestGuard(): LatestRequestGuard;

export function deriveReviewMap<T extends { recipe_title: string }>(
  data: readonly T[] | null | undefined,
  error: unknown,
): Record<string, T>;

export type MutationLock = {
  tryAcquire(): boolean;
  release(): void;
  reset(): void;
  isBusy(): boolean;
};

export function createMutationLock(): MutationLock;

export function normalizeFeatureRows(rows: unknown): string[];
