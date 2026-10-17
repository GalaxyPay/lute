// Sync windows are centred over the window the user started from so both
// stay in view.

/** The extension's popup, when its side panel could not open. */
export const SYNC_POPUP = { width: 420, height: 640 };

/**
 * The web app opens in a normal window so the address bar shows the site.
 * Chrome enforces a larger minimum size on those.
 */
export const SYNC_BROWSER_WINDOW = { width: 520, height: 720 };

interface WindowLike {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}

export function syncWindowBounds(over?: WindowLike, size = SYNC_POPUP) {
  const { width, height } = size;
  if (over?.left == null || over.top == null || !over.width || !over.height)
    return { width, height };
  return {
    width,
    height,
    left: Math.round(over.left + (over.width - width) / 2),
    top: Math.round(over.top + Math.max(0, (over.height - height) / 2)),
  };
}
