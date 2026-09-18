export function deriveFeatureCapabilities(features) {
  const assigned = new Set(features);
  const canRateRecipes = assigned.has('rate_recipes');
  const canSendReport = assigned.has('send_report');
  const canAccessSettings = assigned.has('access_settings');
  const canChangeTheme = canAccessSettings && assigned.has('change_theme');
  const canTrackGymWorkouts = assigned.has('track_gym_workouts');
  const canManageGymWorkouts = assigned.has('manage_gym_workouts');
  const canTrackWeight = assigned.has('track_weight');
  const canTrackBloodPressure = assigned.has('track_blood_pressure');
  const canTrackHealth = assigned.has('track_health') || canTrackWeight || canTrackBloodPressure;

  return {
    canRateRecipes,
    canSendReport,
    canOpenNotes: canRateRecipes || canSendReport,
    canAccessSettings,
    canChangeTheme,
    canTrackGymWorkouts,
    canManageGymWorkouts,
    canTrackHealth,
    canTrackWeight,
    canTrackBloodPressure,
  };
}

export function createLatestRequestGuard() {
  let generation = 0;
  let latestRequestId = 0;

  return {
    currentGeneration() {
      return generation;
    },
    invalidate() {
      generation += 1;
      latestRequestId += 1;
      return generation;
    },
    invalidateRequests() {
      latestRequestId += 1;
    },
    isGenerationCurrent(candidate) {
      return candidate === generation;
    },
    startRequest(requestGeneration, userId, date) {
      latestRequestId += 1;
      return { generation: requestGeneration, requestId: latestRequestId, userId, date };
    },
    isCurrent(request) {
      return request.generation === generation && request.requestId === latestRequestId;
    },
  };
}

export function deriveReviewMap(data, error) {
  if (error || !data) return {};

  return Object.fromEntries(data.map((review) => [review.recipe_title, review]));
}

export function createMutationLock() {
  let busy = false;

  return {
    tryAcquire() {
      if (busy) return false;
      busy = true;
      return true;
    },
    release() {
      busy = false;
    },
    reset() {
      busy = false;
    },
    isBusy() {
      return busy;
    },
  };
}

export function normalizeFeatureRows(rows) {
  if (!Array.isArray(rows)) return [];
  if (!rows.every((row) => (
    row !== null
    && typeof row === 'object'
    && typeof row.feature_code === 'string'
  ))) return [];

  return rows.map((row) => row.feature_code);
}
