export function validCoffeeMinutes(value: unknown): boolean;
export function coffeeCreditSeconds(seconds: number | undefined, maximumMinutes: number | undefined, countsAsWork: boolean | undefined): number;
export function coffeeCountdownSeconds(time: { active: boolean; open?: boolean; day_off: boolean; coffee_started_at?: string | null; coffee_seconds?: number; coffee_minutes?: number }, now: number): number | null;
