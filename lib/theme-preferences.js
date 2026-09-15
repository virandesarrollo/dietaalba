export function normalizeTheme(value) {
  return value === 'dark' ? 'dark' : 'alba';
}

export const COLOR_KEYS = [
  'background', 'surface', 'surfaceSoft', 'text', 'heading', 'muted', 'border', 'accent',
];

const THEME_PALETTES = {
  alba: {
    background: '#faf7f2', surface: '#ffffff', surfaceSoft: '#f8fafc', text: '#334155',
    heading: '#1e293b', muted: '#64748b', border: '#ffe4e6', accent: '#f472b6',
  },
  dark: {
    background: '#111318', surface: '#1b1f27', surfaceSoft: '#242a35', text: '#e2e8f0',
    heading: '#f8fafc', muted: '#a8b1c2', border: '#343b49', accent: '#f08abb',
  },
};

export function getThemePalette(theme) {
  return { ...THEME_PALETTES[normalizeTheme(theme)] };
}

export function normalizeCustomColors(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== COLOR_KEYS.length || keys.some((key) => !COLOR_KEYS.includes(key))) return null;
  const palette = {};
  for (const key of COLOR_KEYS) {
    const color = value[key];
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) return null;
    palette[key] = color.toLowerCase();
  }
  return palette;
}

function relativeLuminance(hex) {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(left, right) {
  const light = Math.max(relativeLuminance(left), relativeLuminance(right));
  const dark = Math.min(relativeLuminance(left), relativeLuminance(right));
  return (light + 0.05) / (dark + 0.05);
}

export function validateColorPalette(value) {
  const palette = normalizeCustomColors(value);
  if (!palette) return { ok: false, error: 'Todos los colores deben usar el formato #RRGGBB.' };
  const pairs = [
    ['text', 'background'], ['text', 'surface'], ['text', 'surfaceSoft'],
    ['heading', 'background'], ['heading', 'surface'], ['muted', 'surface'],
  ];
  if (pairs.some(([foreground, background]) => contrastRatio(palette[foreground], palette[background]) < 4.5)) {
    return { ok: false, error: 'La combinación no tiene contraste suficiente para leer la aplicación.' };
  }
  return { ok: true, error: null };
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
