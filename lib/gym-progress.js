export function buildProgressSessions(rows, limit) {
  const grouped = new Map();
  for (const row of rows) {
    const sets = grouped.get(row.workout_date) ?? [];
    sets.push({ weightKg: row.weight_kg, reps: row.reps });
    grouped.set(row.workout_date, sets);
  }

  const sessions = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, sets]) => ({
      date,
      bestSet: sets.reduce((best, set) =>
        set.weightKg > best.weightKg ||
        (set.weightKg === best.weightKg && set.reps > best.reps) ? set : best,
      ),
      sets,
    }));

  return Number.isInteger(limit) && limit > 0 ? sessions.slice(-limit) : sessions;
}

export function summarizeProgress(sessions) {
  if (sessions.length === 0) {
    return { latest: null, maximum: null, changeKg: null };
  }
  const latestSession = sessions[sessions.length - 1];
  const maximumSession = sessions.reduce((winner, session) =>
    session.bestSet.weightKg > winner.bestSet.weightKg ||
    (session.bestSet.weightKg === winner.bestSet.weightKg &&
      session.bestSet.reps > winner.bestSet.reps) ? session : winner,
  );
  return {
    latest: { date: latestSession.date, ...latestSession.bestSet },
    maximum: { date: maximumSession.date, ...maximumSession.bestSet },
    changeKg: Math.round((latestSession.bestSet.weightKg - sessions[0].bestSet.weightKg) * 100) / 100,
  };
}

export function buildProgressChartPoints(sessions) {
  if (sessions.length === 0) return [];
  if (sessions.length === 1) {
    return [{ date: sessions[0].date, ...sessions[0].bestSet, x: 50, y: 50 }];
  }
  const weights = sessions.map((session) => session.bestSet.weightKg);
  const minimum = Math.min(...weights);
  const maximum = Math.max(...weights);
  return sessions.map((session, index) => ({
    date: session.date,
    ...session.bestSet,
    x: Math.round((index / (sessions.length - 1)) * 10000) / 100,
    y: minimum === maximum
      ? 50
      : Math.round((85 - ((session.bestSet.weightKg - minimum) / (maximum - minimum)) * 70) * 100) / 100,
  }));
}
