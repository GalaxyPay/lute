/**
 * Cross-context cache invalidation, extension only.
 *
 * The side panel and the options page are separate apps with separate Pinia
 * instances over one IndexedDB, so a write made in either is invisible to the
 * other. IndexedDB has no change-notification API — but browser.storage does,
 * so a revision counter there stands in as the signal: dbLute bumps it after
 * every write worth reloading for, and each shell reloads on the change event.
 *
 * Deriving the signal from the write itself rather than broadcasting from each
 * call site covers every path at once, works in both directions, and cannot
 * drift as new writers are added — the same reasoning as Unlock.watch().
 *
 * storage.session rather than storage.local: the counter means nothing across
 * a browser restart, every context reads fresh on mount anyway, and this avoids
 * a disk write per settings change.
 *
 * The web build has neither browser.storage nor a second context worth
 * notifying — a main tab and a dApp-opened sign popup share nothing but
 * IndexedDB. Syncing those would need a BroadcastChannel, a separate question.
 * Every browser.* reference therefore lives inside an isWeb guard, because
 * `browser` is only auto-imported in extension builds.
 */

const REV_KEY = "dbRev";

// Serializes the read-modify-write so two writes in flight at once cannot both
// read the same revision and collapse into a single bump.
let pending: Promise<void> = Promise.resolve();

const Sync = {
  /**
   * Signal that cached state changed. Called by dbLute, never by a write site:
   * the whole point is that a writer does not have to remember.
   */
  async bump() {
    const store = useAppStore();
    if (store.isWeb) return;
    pending = pending.then(async () => {
      const stored = await browser.storage.session.get(REV_KEY);
      const rev = (stored[REV_KEY] as number | undefined) ?? 0;
      await browser.storage.session.set({ [REV_KEY]: rev + 1 });
    });
    await pending;
  },

  /**
   * Reload cached state whenever a watched store is written. Also fires in the
   * context that did the writing, which is harmless — reloading is idempotent.
   */
  watch(reload: () => void) {
    const store = useAppStore();
    if (store.isWeb) return;
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "session" || !(REV_KEY in changes)) return;
      reload();
    });
  },
};

export default Sync;
