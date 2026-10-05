/**
 * One-way sync of accounts and keys between the web app and the extension.
 *
 * The wallet the user started from (the sender) hands its accounts and keys to
 * the other (the receiver), which confirms, then adds what it lacks. Nothing
 * travels back except the result.
 *
 * Both sides generate an ephemeral ECDH key pair and derive a session key, so
 * the payload is never in plaintext on the channel, including in the
 * background relay. The payload is sealed with additional data naming its
 * direction, so it cannot be reflected back to its sender.
 *
 * Ordering is the security property that matters here. The sender unlocks
 * before the session starts, while the user is looking at it, but sends its
 * keys only after the receiver has confirmed (and unlocked). The receiver
 * writes nothing until the payload has opened and verified.
 *
 * This module has no browser APIs. It talks through a SyncTransport, so the
 * channel (Chrome externally_connectable today) can be swapped.
 */
import Transfer, {
  type Skipped,
  type TransferPayload,
  type WalletSide,
} from "@/services/Transfer";
import type { MasterKey } from "@/types";

export type SyncErrorCode =
  | "declined"
  | "cancelled"
  | "timeout"
  | "closed"
  | "busy"
  | "invalid"
  | "failed";

export type SyncMessage =
  | { t: "hello"; pub: string }
  | { t: "confirmed" }
  | { t: "payload"; data: string }
  | { t: "result"; added: number; skipped: Skipped[] }
  | { t: "error"; code: SyncErrorCode; message: string };

export interface SyncTransport {
  send(msg: SyncMessage): void;
  onMessage(cb: (msg: SyncMessage) => void): void;
  /** Fires when either side closes, including a local close(). */
  onClose(cb: () => void): void;
  close(): void;
}

export interface SyncResult {
  added: number;
  skipped: Skipped[];
}

export class SyncError extends Error {
  code: SyncErrorCode;
  // Raised by the other side (or its going away), so nothing to send back.
  fromPeer: boolean;
  constructor(code: SyncErrorCode, message: string, fromPeer = false) {
    super(message);
    this.name = "SyncError";
    this.code = code;
    this.fromPeer = fromPeer;
  }
}

export const SYNC_TIMEOUT_MS = 2 * 60_000;

const enc = new TextEncoder();
const INFO = enc.encode("lute-sync:v1");
const aad = (from: WalletSide) => enc.encode(`lute-sync:v1:from-${from}`);
const other = (side: WalletSide): WalletSide => (side === "web" ? "ext" : "web");

// WebCrypto's BufferSource typing rejects Uint8Array<ArrayBufferLike>.
const bs = (u: Uint8Array) => u as Uint8Array<ArrayBuffer>;

function concat(a: Uint8Array, b: Uint8Array) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

/** An ephemeral ECDH key pair. The private key never leaves WebCrypto. */
export async function createKeys() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"]
  );
  const pub = new Uint8Array(
    await crypto.subtle.exportKey("raw", pair.publicKey)
  );
  return { privateKey: pair.privateKey, pub };
}

/**
 * The session key: ECDH, then HKDF-SHA-256 salted with both public keys in a
 * fixed order (web first), so both sides derive the same key.
 */
export async function deriveSessionKey(
  privateKey: CryptoKey,
  peerPub: Uint8Array,
  webPub: Uint8Array,
  extPub: Uint8Array
) {
  const peer = await crypto.subtle.importKey(
    "raw",
    bs(peerPub),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: peer }, privateKey, 256)
  );
  try {
    const ikm = await crypto.subtle.importKey("raw", bits, "HKDF", false, [
      "deriveKey",
    ]);
    return await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: bs(concat(webPub, extPub)),
        info: INFO,
      },
      ikm,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  } finally {
    bits.fill(0);
  }
}

/** Seal a payload sent by `from`. Returns base64 of iv ‖ ciphertext. */
export async function seal(
  from: WalletSide,
  payload: TransferPayload,
  key: CryptoKey
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad(from) },
      key,
      enc.encode(Transfer.serialize(payload))
    )
  );
  return concat(iv, ct).toBase64();
}

/** Open a payload expected from `from`. Throws OperationError if it is not. */
export async function open(
  from: WalletSide,
  data: string,
  key: CryptoKey
): Promise<TransferPayload> {
  const raw = Uint8Array.fromBase64(data);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bs(raw.subarray(0, 12)), additionalData: aad(from) },
    key,
    bs(raw.subarray(12))
  );
  return Transfer.deserialize(new TextDecoder().decode(pt));
}

/** Messages in arrival order, with a deadline on each wait. */
class Inbox {
  private queue: SyncMessage[] = [];
  private waiter?: {
    resolve: (m: SyncMessage) => void;
    reject: (e: SyncError) => void;
  };
  private closed?: SyncError;

  isClosed() {
    return !!this.closed;
  }

  constructor(transport: SyncTransport) {
    transport.onMessage((m) => {
      if (this.waiter) {
        const w = this.waiter;
        this.waiter = undefined;
        w.resolve(m);
      } else this.queue.push(m);
    });
    transport.onClose(() => {
      this.closed = new SyncError("closed", "The other window closed.", true);
      this.waiter?.reject(this.closed);
      this.waiter = undefined;
    });
  }

  private next(timeoutMs: number) {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    if (this.closed) return Promise.reject(this.closed);
    return new Promise<SyncMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = undefined;
        reject(new SyncError("timeout", "The other window stopped responding."));
      }, timeoutMs);
      this.waiter = {
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
    });
  }

  /** The next message, which must be of type `t`. */
  async expect<T extends SyncMessage["t"]>(
    t: T,
    timeoutMs: number
  ): Promise<Extract<SyncMessage, { t: T }>> {
    const m = await this.next(timeoutMs);
    if (m?.t === "error")
      throw new SyncError(m.code ?? "failed", m.message ?? "Sync failed.", true);
    if (m?.t !== t) throw new SyncError("invalid", "Unexpected sync message.");
    return m as Extract<SyncMessage, { t: T }>;
  }
}

async function handshake(
  side: WalletSide,
  transport: SyncTransport,
  inbox: Inbox,
  timeoutMs: number
) {
  const { privateKey, pub } = await createKeys();
  transport.send({ t: "hello", pub: pub.toBase64() });
  const hello = await inbox.expect("hello", timeoutMs);
  let peer: Uint8Array;
  try {
    peer = Uint8Array.fromBase64(hello.pub);
  } catch {
    throw new SyncError("invalid", "Unexpected sync message.");
  }
  const [webPub, extPub] = side === "web" ? [pub, peer] : [peer, pub];
  return await deriveSessionKey(privateKey, peer, webPub, extPub);
}

/** Tell the other side why this one stopped, then rethrow. */
function fail(transport: SyncTransport, err: unknown): never {
  const e =
    err instanceof SyncError
      ? err
      : (err as any)?.name === "UserCancelled"
        ? new SyncError("cancelled", "The sync was cancelled.")
        : new SyncError("failed", (err as any)?.message ?? "Sync failed.");
  if (!e.fromPeer)
    try {
      transport.send({ t: "error", code: e.code, message: e.message });
    } catch {
      // Already closed.
    }
  throw e;
}

export type SenderState = "connecting" | "waiting" | "sending";
export type ReceiverState = "connecting" | "confirm" | "unlocking" | "adding";

export interface SenderHooks {
  /**
   * The master key, unlocked by typed password before the session starts (the
   * payload carries every key). Used only after the receiver confirms.
   */
  mk: MasterKey;
  onState?: (s: SenderState) => void;
  appVersion: string;
  timeoutMs?: number;
  build?: typeof Transfer.buildPayload;
}

export interface ReceiverHooks {
  /** Ask the user. False declines the sync. */
  confirm: () => Promise<boolean>;
  getMk: () => Promise<MasterKey>;
  onState?: (s: ReceiverState) => void;
  timeoutMs?: number;
  restore?: typeof Transfer.addPayload;
}

/** Send this wallet's accounts to the other side. */
export async function runSender(
  side: WalletSide,
  transport: SyncTransport,
  hooks: SenderHooks
): Promise<SyncResult> {
  const timeoutMs = hooks.timeoutMs ?? SYNC_TIMEOUT_MS;
  const inbox = new Inbox(transport);
  try {
    hooks.onState?.("connecting");
    const key = await handshake(side, transport, inbox, timeoutMs);
    hooks.onState?.("waiting");
    await inbox.expect("confirmed", timeoutMs);
    hooks.onState?.("sending");
    const payload = await (hooks.build ?? Transfer.buildPayload)(hooks.mk, {
      from: side,
      appVersion: hooks.appVersion,
    });
    transport.send({ t: "payload", data: await seal(side, payload, key) });
    const result = await inbox.expect("result", timeoutMs);
    return { added: result.added, skipped: result.skipped ?? [] };
  } catch (err) {
    fail(transport, err);
  } finally {
    transport.close();
  }
}

/** Receive the other side's accounts into this wallet. */
export async function runReceiver(
  side: WalletSide,
  transport: SyncTransport,
  hooks: ReceiverHooks
): Promise<SyncResult> {
  const timeoutMs = hooks.timeoutMs ?? SYNC_TIMEOUT_MS;
  const inbox = new Inbox(transport);
  try {
    hooks.onState?.("connecting");
    const key = await handshake(side, transport, inbox, timeoutMs);
    hooks.onState?.("confirm");
    if (!(await hooks.confirm()))
      throw new SyncError("declined", "The sync was declined.");
    hooks.onState?.("unlocking");
    // Unlocked before confirming to the sender, so its keys only leave once
    // this side is ready to take them.
    const mk = await hooks.getMk();
    transport.send({ t: "confirmed" });
    const msg = await inbox.expect("payload", timeoutMs);
    let payload: TransferPayload;
    try {
      payload = await open(other(side), msg.data, key);
    } catch {
      throw new SyncError("invalid", "The accounts sent could not be verified.");
    }
    if (payload.from !== other(side))
      throw new SyncError("invalid", "The accounts sent could not be verified.");
    // Cancelled while the payload was opening: write nothing.
    if (inbox.isClosed())
      throw new SyncError("cancelled", "The sync was cancelled.", true);
    hooks.onState?.("adding");
    const result = await (hooks.restore ?? Transfer.addPayload)(mk, payload);
    transport.send({ t: "result", ...result });
    return result;
  } catch (err) {
    fail(transport, err);
  } finally {
    transport.close();
  }
}
