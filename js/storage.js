// 설정·갤러리 저장소 (브라우저 localStorage / sessionStorage)
const SETTINGS_KEY = 'texthip.settings.v1';
const SESSION_KEYS = 'texthip.keys.session';
const GALLERY_KEY = 'texthip.gallery.v1';
const GALLERY_MAX = 60;

const DEFAULT_SETTINGS = {
  provider: 'openai',
  baseUrls: {},   // provider -> url override
  models: {},     // provider -> model id
  keys: {},       // provider -> api key (rememberKey 일 때만 localStorage 에 저장)
  rememberKey: true,
};

function readJSON(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function loadSettings() {
  const saved = readJSON(localStorage, SETTINGS_KEY, {});
  const s = { ...DEFAULT_SETTINGS, ...saved };
  s.baseUrls = { ...(saved.baseUrls || {}) };
  s.models = { ...(saved.models || {}) };
  s.keys = { ...(saved.keys || {}) };
  if (!s.rememberKey) s.keys = readJSON(sessionStorage, SESSION_KEYS, {});
  return s;
}

export function saveSettings(s) {
  const toSave = { ...s };
  if (s.rememberKey) {
    sessionStorage.removeItem(SESSION_KEYS);
  } else {
    sessionStorage.setItem(SESSION_KEYS, JSON.stringify(s.keys || {}));
    toSave.keys = {};
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(toSave));
}

export function clearKeys() {
  const s = loadSettings();
  s.keys = {};
  saveSettings(s);
  sessionStorage.removeItem(SESSION_KEYS);
}

export function loadGallery() {
  return readJSON(localStorage, GALLERY_KEY, []);
}

export function addToGallery(spec) {
  const list = loadGallery().filter((g) => g.id !== spec.id);
  list.unshift({ ...spec, savedAt: Date.now() });
  localStorage.setItem(GALLERY_KEY, JSON.stringify(list.slice(0, GALLERY_MAX)));
}

export function removeFromGallery(id) {
  const list = loadGallery().filter((g) => g.id !== id);
  localStorage.setItem(GALLERY_KEY, JSON.stringify(list));
}
