export const LIVE_SETTINGS_KEY = 'bar-live-settings';
export const LIVE_SETTINGS_MIGRATION_KEY = 'bar-live-settings-migration';
export const GIFT_CATALOG_KEY = 'bar-live-gift-catalog';
export const ADMIN_TEST_EVENT_KEY = 'bar-live-admin-test-event';
export const MAX_GIFT_CATALOG_ITEMS = 200;
export const MAX_LIVE_HINTS = 8;
const GIFT_MAPPINGS_MIGRATION = 'gift-mappings-v1';

export const SUGGESTED_GIFTS = [
  { name: 'Rose', aliases: ['Hoa hồng'] },
  { name: 'Finger Heart', aliases: ['Tim ngón tay'] },
  { name: 'TikTok', aliases: [] },
  { name: 'GG', aliases: [] },
  { name: 'Coffee', aliases: ['Cà phê'] },
  { name: 'Doughnut', aliases: ['Bánh donut'] },
  { name: 'Perfume', aliases: ['Nước hoa'] },
  { name: 'Heart Me', aliases: ['Trái tim'] },
  { name: 'Hand Heart', aliases: ['Trái tim bàn tay'] },
  { name: 'Love You', aliases: ['Yêu bạn'] },
  { name: 'Cap', aliases: ['Mũ'] },
  { name: 'Sunglasses', aliases: ['Kính râm'] },
  { name: 'Mishka Bear', aliases: ['Gấu Mishka'] },
  { name: 'Concert', aliases: ['Buổi hòa nhạc'] },
  { name: 'Lion', aliases: ['Sư tử'] },
  { name: 'Universe', aliases: ['Vũ trụ'] },
];

export const GIFT_EFFECTS = [
  { id: 'ZOOM', label: 'Zoom viewer' },
  { id: 'FLY_ZOOM', label: 'Bay lên + zoom' },
  { id: 'SANTO', label: 'Nhảy' },
  { id: 'BREAKDANCE', label: 'Breakdance' },
  { id: 'ĐI VÒNG', label: 'Đi vòng' },
  { id: 'PHÁO HOA', label: 'Pháo hoa' },
  { id: 'ĐỔI NHÂN VẬT', label: 'Đổi nhân vật' },
];

export const DEFAULT_LIVE_SETTINGS = {
  lightsEnabled: true,
  lasersEnabled: true,
  lightSpeed: 1,
  zoomOnLike: true,
  ledTitle: 'BAR LIVE',
  ledSubtitle: 'MUSIC · LIGHTS · DANCE',
  djName: 'DJ TaiJ8888',
  mcName: 'MC TaiMC8888',
  ledImage: '',
  liveHints: [],
  commentMappings: {
    ZOOM: '',
    FLY_ZOOM: '',
    SANTO: '',
    BREAKDANCE: '',
    'ĐI VÒNG': '',
    'PHÁO HOA': '',
    'ĐỔI NHÂN VẬT': 'hey hey',
  },
  giftMappings: {
    ZOOM: 'Rose;Hoa hồng',
    FLY_ZOOM: 'Finger Heart',
    SANTO: 'Heart Me',
    BREAKDANCE: 'TikTok',
    'ĐI VÒNG': 'Love you so much',
    'PHÁO HOA': 'Glow Stick',
    'ĐỔI NHÂN VẬT': 'Ice Cream Cone',
  },
};

export function normalizeLiveSettings(value) {
  const settings = value && typeof value === 'object' ? value : {};
  const giftMappings = settings.giftMappings && typeof settings.giftMappings === 'object'
    ? settings.giftMappings
    : {};
  const commentMappings = settings.commentMappings && typeof settings.commentMappings === 'object'
    ? settings.commentMappings
    : {};
  const liveHints = Array.isArray(settings.liveHints)
    ? settings.liveHints
    : [];

  return {
    lightsEnabled: typeof settings.lightsEnabled === 'boolean'
      ? settings.lightsEnabled
      : DEFAULT_LIVE_SETTINGS.lightsEnabled,
    lasersEnabled: typeof settings.lasersEnabled === 'boolean'
      ? settings.lasersEnabled
      : DEFAULT_LIVE_SETTINGS.lasersEnabled,
    lightSpeed: Number.isFinite(settings.lightSpeed)
      ? Math.min(2, Math.max(0.5, settings.lightSpeed))
      : DEFAULT_LIVE_SETTINGS.lightSpeed,
    zoomOnLike: typeof settings.zoomOnLike === 'boolean'
      ? settings.zoomOnLike
      : DEFAULT_LIVE_SETTINGS.zoomOnLike,
    ledTitle: typeof settings.ledTitle === 'string'
      ? settings.ledTitle.trim().slice(0, 40)
      : DEFAULT_LIVE_SETTINGS.ledTitle,
    ledSubtitle: typeof settings.ledSubtitle === 'string'
      ? settings.ledSubtitle.trim().slice(0, 80)
      : DEFAULT_LIVE_SETTINGS.ledSubtitle,
    djName: typeof settings.djName === 'string'
      ? settings.djName.trim().slice(0, 32)
      : DEFAULT_LIVE_SETTINGS.djName,
    mcName: typeof settings.mcName === 'string'
      ? settings.mcName.trim().slice(0, 32)
      : DEFAULT_LIVE_SETTINGS.mcName,
    ledImage: typeof settings.ledImage === 'string'
      && settings.ledImage.length <= 300_000
      && /^data:image\/jpeg;base64,/.test(settings.ledImage)
      ? settings.ledImage
      : '',
    liveHints: liveHints
      .filter((hint) => !(
        (hint?.trigger === 'Thả Tym' && hint?.effect === 'Zoom')
        || (hint?.trigger === 'Cmt: Hey hey' && hint?.effect === 'đổi nhân vật')
      ))
      .slice(0, MAX_LIVE_HINTS)
      .map((hint) => ({
        trigger: typeof hint?.trigger === 'string' ? hint.trigger.trim().slice(0, 40) : '',
        effect: typeof hint?.effect === 'string' ? hint.effect.trim().slice(0, 40) : '',
      })),
    commentMappings: Object.fromEntries(GIFT_EFFECTS.map(({ id }) => {
      const mapping = commentMappings[id];
      if (typeof mapping === 'string') return [id, mapping.slice(0, 500)];
      if (!settings.commentMappings && id === 'ĐỔI NHÂN VẬT'
        && typeof settings.commentChangeCharacterKeyword === 'string') {
        return [id, settings.commentChangeCharacterKeyword.slice(0, 500)];
      }
      return [id, DEFAULT_LIVE_SETTINGS.commentMappings[id]];
    })),
    giftMappings: Object.fromEntries(GIFT_EFFECTS.map(({ id }) => {
      const mapping = giftMappings[id];
      return [id, typeof mapping === 'string' ? mapping.slice(0, 500) : DEFAULT_LIVE_SETTINGS.giftMappings[id]];
    })),
  };
}

export function getAutomaticLiveHints(settings) {
  const hints = [];
  GIFT_EFFECTS.forEach(({ id, label }) => {
    const keywords = [...new Set(settings.commentMappings[id]
      .split(';')
      .map((keyword) => keyword.trim().replace(/\s+/g, ' '))
      .filter(Boolean))];
    if (keywords.length) hints.push({
      icon: '💬',
      trigger: `Cmt: ${keywords.join(' · ')}`,
      effect: label,
    });
  });

  return hints;
}

function normalizeCommentText(text) {
  return typeof text === 'string'
    ? text.normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ')
    : '';
}

export function getCommentEffect(text, commentMappings) {
  const normalizedText = normalizeCommentText(text);
  if (!normalizedText) return null;

  const matches = [];
  GIFT_EFFECTS.forEach(({ id }) => {
    const mapping = commentMappings?.[id];
    if (typeof mapping !== 'string') return;
    mapping.split(';').forEach((keyword) => {
      const normalizedKeyword = normalizeCommentText(keyword);
      if (normalizedKeyword && ` ${normalizedText} `.includes(` ${normalizedKeyword} `)) {
        matches.push({ effect: id, length: normalizedKeyword.length });
      }
    });
  });

  matches.sort((left, right) => right.length - left.length);
  return matches[0]?.effect ?? null;
}

export function getLiveHints(settings) {
  return [...getAutomaticLiveHints(settings), ...settings.liveHints]
    .filter((hint) => hint.trigger || hint.effect)
    .map((hint) => ({ icon: hint.icon || '✨', ...hint }));
}

export function loadLiveSettings() {
  try {
    const serialized = window.localStorage.getItem(LIVE_SETTINGS_KEY);
    if (!serialized) {
      window.localStorage.setItem(LIVE_SETTINGS_MIGRATION_KEY, GIFT_MAPPINGS_MIGRATION);
      return DEFAULT_LIVE_SETTINGS;
    }

    const storedSettings = JSON.parse(serialized);
    if (window.localStorage.getItem(LIVE_SETTINGS_MIGRATION_KEY) !== GIFT_MAPPINGS_MIGRATION) {
      const migratedSettings = normalizeLiveSettings({
        ...storedSettings,
        giftMappings: DEFAULT_LIVE_SETTINGS.giftMappings,
      });
      window.localStorage.setItem(LIVE_SETTINGS_KEY, JSON.stringify(migratedSettings));
      window.localStorage.setItem(LIVE_SETTINGS_MIGRATION_KEY, GIFT_MAPPINGS_MIGRATION);
      return migratedSettings;
    }

    return normalizeLiveSettings(storedSettings);
  } catch (error) {
    console.error('Unable to load Bar Live settings from local storage:', error);
    return DEFAULT_LIVE_SETTINGS;
  }
}

export function saveLiveSettings(settings) {
  const normalized = normalizeLiveSettings(settings);
  window.localStorage.setItem(LIVE_SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}

export function normalizeGiftCatalog(value) {
  if (!Array.isArray(value)) return [];
  const gifts = new Map();
  value.forEach((item) => {
    const name = typeof item === 'string' ? item : item?.name;
    if (typeof name !== 'string') return;
    const normalizedName = name.trim().slice(0, 100);
    if (normalizedName) gifts.set(normalizedName.toLocaleLowerCase(), normalizedName);
  });
  return [...gifts.values()].slice(-MAX_GIFT_CATALOG_ITEMS);
}

export function loadGiftCatalog() {
  try {
    const serialized = window.localStorage.getItem(GIFT_CATALOG_KEY);
    return serialized ? normalizeGiftCatalog(JSON.parse(serialized)) : [];
  } catch (error) {
    console.error('Unable to load the observed gift catalog:', error);
    return [];
  }
}

export function saveGiftCatalog(gifts) {
  const catalog = normalizeGiftCatalog(gifts);
  window.localStorage.setItem(GIFT_CATALOG_KEY, JSON.stringify(catalog));
  return catalog;
}
