export function normalizeTheme(value) {
  return value === 'dark' ? 'dark' : 'alba';
}

export function createThemeSaveGuard() {
  let latest = 0;
  return {
    next(theme) {
      latest += 1;
      return { id: latest, theme };
    },
    isCurrent(request) {
      return request.id === latest;
    },
    invalidate() {
      latest += 1;
    },
  };
}
