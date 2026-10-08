/**
 * Sync relay in the background: pairs two ports and passes messages through.
 * The payload is end-to-end encrypted (SyncSession), so nothing here can read
 * it.
 *
 * A Port drops messages sent while no listener is attached, and the first port
 * talks before its other half exists, so a waiting port's messages are held
 * until it is paired.
 *
 * Origins are checked here as well as by Chrome. Tokens are single use and
 * expire so a link from another site can't start a session. State is in
 * memory: a worker restart closes the ports and both sides see the sync end.
 *
 * No browser APIs: the background passes its Ports in, so this is testable.
 */

export interface RelayPort {
  name: string;
  sender?: { origin?: string; url?: string; tab?: { id?: number } };
  postMessage(msg: unknown): void;
  disconnect(): void;
  onMessage: {
    addListener(cb: (msg: any) => void): void;
    removeListener(cb: (msg: any) => void): void;
  };
  onDisconnect: { addListener(cb: () => void): void };
}

export interface RelayOptions {
  origins: string[];
  openReceiver: (tabId: number) => void | Promise<void>;
  ttlMs?: number;
  newToken?: () => string;
}

const RELAYED = new Set(["hello", "confirmed", "payload", "result", "error"]);

interface Waiting {
  port: RelayPort;
  timer: ReturnType<typeof setTimeout>;
  held: unknown[];
  hold: (m: any) => void;
  since: number;
}

function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

function senderOrigin(port: RelayPort) {
  const sender = port.sender;
  if (sender?.origin) return sender.origin;
  try {
    return sender?.url ? new URL(sender.url).origin : "";
  } catch {
    return "";
  }
}

function refuse(port: RelayPort, code: string, message: string) {
  try {
    port.postMessage({ t: "error", code, message });
  } catch {
    // Already gone.
  }
  try {
    port.disconnect();
  } catch {
    // Already gone.
  }
}

export function createSyncRelay(opts: RelayOptions) {
  const ttlMs = opts.ttlMs ?? 2 * 60_000;
  const newToken = opts.newToken ?? randomToken;
  let session: RelayPort[] | undefined;
  const waitingWeb = new Map<number, Waiting>();
  const waitingTokens = new Map<string, Waiting>();

  const busy = () =>
    !!session || waitingWeb.size > 0 || waitingTokens.size > 0;

  /** Hold a port, and what it sends, until its other half connects. */
  function wait<K>(map: Map<K, Waiting>, key: K, port: RelayPort) {
    const held: unknown[] = [];
    const hold = (m: any) => {
      if (m && RELAYED.has(m.t)) held.push(m);
    };
    port.onMessage.addListener(hold);
    const timer = setTimeout(() => {
      map.delete(key);
      refuse(port, "timeout", "The other window did not open in time.");
    }, ttlMs);
    map.set(key, { port, timer, held, hold, since: Date.now() });
    port.onDisconnect.addListener(() => {
      if (map.get(key)?.port !== port) return;
      clearTimeout(timer);
      map.delete(key);
    });
  }

  function take<K>(map: Map<K, Waiting>, key: K) {
    const entry = map.get(key);
    if (!entry) return undefined;
    map.delete(key);
    clearTimeout(entry.timer);
    entry.port.onMessage.removeListener(entry.hold);
    return entry;
  }

  function pair(waited: Waiting, b: RelayPort) {
    const a = waited.port;
    const ports = [a, b];
    session = ports;
    const forward = (to: RelayPort) => (m: any) => {
      if (m && RELAYED.has(m.t)) to.postMessage(m);
    };
    a.onMessage.addListener(forward(b));
    b.onMessage.addListener(forward(a));
    for (const m of waited.held) b.postMessage(m);
    const end = () => {
      if (session === ports) session = undefined;
      for (const p of ports)
        try {
          p.disconnect();
        } catch {
          // Already gone.
        }
    };
    a.onDisconnect.addListener(end);
    b.onDisconnect.addListener(end);
  }

  return {
    /** A port from a web page, through externally_connectable. */
    external(port: RelayPort) {
      if (!opts.origins.includes(senderOrigin(port))) return port.disconnect();
      if (port.name === "lute-sync") {
        const tabId = port.sender?.tab?.id;
        if (tabId == null) return port.disconnect();
        if (busy())
          return refuse(port, "busy", "Another sync is already in progress.");
        wait(waitingWeb, tabId, port);
        Promise.resolve(opts.openReceiver(tabId)).catch(() => {
          // Disconnecting our own end fires no onDisconnect here, so release
          // the wait now or the relay stays busy until the TTL.
          if (waitingWeb.get(tabId)?.port === port) take(waitingWeb, tabId);
          refuse(port, "failed", "The extension could not open its window.");
        });
      } else if (port.name.startsWith("lute-sync:")) {
        const sender = take(waitingTokens, port.name.slice("lute-sync:".length));
        if (!sender)
          return refuse(
            port,
            "invalid",
            "This sync link has expired or was already used."
          );
        pair(sender, port);
      } else {
        port.disconnect();
      }
    },

    /**
     * Releases the web app's wait now rather than at the TTL if the receiver
     * never connected. A wait newer than `openedAt` belongs to a later window.
     */
    receiverClosed(tabId: number, openedAt: number) {
      const web = waitingWeb.get(tabId);
      if (!web || web.since > openedAt) return;
      take(waitingWeb, tabId);
      refuse(web.port, "closed", "The extension window was closed.");
    },

    /** Returns false for a non-sync port. */
    internal(port: RelayPort) {
      if (port.name === "lute-sync-ext") {
        if (busy())
          refuse(port, "busy", "Another sync is already in progress.");
        else {
          const token = newToken();
          wait(waitingTokens, token, port);
          port.postMessage({ t: "token", token });
        }
        return true;
      }
      if (port.name.startsWith("lute-sync-receiver:")) {
        const tabId = Number(port.name.slice("lute-sync-receiver:".length));
        const web = take(waitingWeb, tabId);
        if (!web) refuse(port, "invalid", "There is no sync waiting.");
        else pair(web, port);
        return true;
      }
      return false;
    },
  };
}
