export type ScheduleSlot = { day: number; kind: 'gym' | 'work'; start: string; end: string };
export function minutes(time: string): number;
export function validSchedule(slots: unknown): slots is ScheduleSlot[];
export function normalizeSchedule(value: unknown): ScheduleSlot[];
export function daySchedule(slots: ScheduleSlot[], date: string): ScheduleSlot[];
export function scheduleHours(slots: ScheduleSlot[]): { gym: number; work: number };
export function formatDuration(totalMinutes: number): string;
