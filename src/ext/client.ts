// Runs in the page's main world at document_start (see src/ext/manifest.ts).
// Its only job is to announce the extension to dapps via `window.lute`.
(() => {
  try {
    // Defined before any page script runs and frozen so the page cannot
    // suppress or alter the detection flag afterwards.
    Object.defineProperty(window, "lute", {
      value: true,
      writable: false,
      configurable: false,
      enumerable: true,
    });
  } catch {
    // already defined (e.g. duplicate injection); nothing to do
  }
})();
