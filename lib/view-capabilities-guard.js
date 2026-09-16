export function canCommitCapabilityLoad(current, load) {
  return current.active === true
    && load.hasError !== true
    && load.generation === current.generation
    && load.userId === current.userId;
}

export function advanceAuthIdentity(current, userId) {
  if (current.initialized && current.userId === userId) {
    return { state: current, changed: false };
  }
  return {
    state: {
      initialized: true,
      generation: current.generation + 1,
      userId,
    },
    changed: true,
  };
}
