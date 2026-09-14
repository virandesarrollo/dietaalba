export type FeatureCode = 'rate_recipes' | 'send_report';

export type FeatureCapabilities = {
  canRateRecipes: boolean;
  canSendReport: boolean;
  canOpenNotes: boolean;
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
