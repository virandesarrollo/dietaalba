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
