// The theme lives in localStorage, not IndexedDB, because only a synchronous
// read can reach createVuetify before the first paint. Keep it to per-device
// display preferences like this one: data, secrets and anything synced or
// written alongside other state stay in IndexedDB.

export const THEME_KEY = "theme";

/** Null when unset or when storage is unavailable. */
export function readTheme(): string | null {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

/** False when storage is unavailable. */
export function saveTheme(name: string) {
  try {
    localStorage.setItem(THEME_KEY, name);
    return true;
  } catch {
    return false;
  }
}
