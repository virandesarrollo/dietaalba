import { ScheduleClient } from '@/components/ScheduleClient';
import { madridDateString } from '@/lib/historical-date.js';

function validDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ date?: string | string[] }> }) {
  const { date } = await searchParams;
  const requested = typeof date === 'string' && validDate(date) ? date : madridDateString();
  return <ScheduleClient initialDate={requested} />;
}
