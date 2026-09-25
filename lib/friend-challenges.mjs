export function normalizeScore(value) {
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 ? score : 0;
}

export function normalizeChallenge(challenge) {
  return {
    ...challenge,
    my_score: normalizeScore(challenge.my_score),
    opponent_score: normalizeScore(challenge.opponent_score),
  };
}

export function challengeProgress(myScore, opponentScore) {
  const normalizedMyScore = normalizeScore(myScore);
  const normalizedOpponentScore = normalizeScore(opponentScore);
  const total = normalizedMyScore + normalizedOpponentScore;
  return total === 0 ? 50 : (normalizedMyScore / total) * 100;
}

export function weekStartFromDateString(dateString) {
  if (typeof dateString !== 'string') return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return '';

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (year < 1 || year > 9999) return '';
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month, day);
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month
    || date.getUTCDate() !== day
  ) return '';

  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  const weekYear = date.getUTCFullYear();
  if (weekYear < 1 || weekYear > 9999) return '';
  return `${String(weekYear).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function challengedFriendIdsForWeek(challenges, weekStart) {
  if (!Array.isArray(challenges)) return new Set();

  const ids = new Set();
  for (const challenge of challenges) {
    if (!challenge || typeof challenge !== 'object' || challenge.week_start !== weekStart) continue;
    for (const id of [challenge.challenger_id, challenge.opponent_id]) {
      if (typeof id === 'string' && id.trim().length > 0) ids.add(id);
    }
  }
  return ids;
}
