export type DailyStepSummary = {
  steps: number;
  dailyGoal: number;
};

export type DailyStepProgress = {
  percent: number;
  achieved: boolean;
};

export type DailyStepsLoadPublication = {
  requestCurrent: boolean;
  sameLock: boolean;
  lockBusy: boolean;
  startRevision: number;
  currentRevision: number;
};

export type SerialTaskQueue = {
  run<T>(task: () => Promise<T> | T): Promise<T>;
};

export function createSerialTaskQueue(): SerialTaskQueue;
export function canPublishDailyStepsLoad(state: DailyStepsLoadPublication): boolean;
export function hasPendingDailyStepWrite(operations: unknown): boolean;
export function parseDailySteps(value: unknown): number | null;
export function parseStepGoal(value: unknown): number | null;
export function normalizeDailyStepRow(rows: unknown): DailyStepSummary;
export function dailyStepProgress(steps: unknown, dailyGoal: unknown): DailyStepProgress;
