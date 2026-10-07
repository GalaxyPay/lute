import type { Network } from "@/types";

/**
 * The network a request names by genesis id and, when it carries one, genesis
 * hash. A network with no recorded hash matches any. "sandnet-v1" is the
 * legacy name of the dockernet genesis.
 */
export function findNetwork(
  networks: Network[],
  genesisID: string | undefined,
  genesisHash?: string
) {
  const id = genesisID === "sandnet-v1" ? "dockernet-v1" : genesisID;
  return networks.find(
    (n) =>
      n.genesisID === id &&
      (!genesisHash || !n.genesisHash || n.genesisHash === genesisHash)
  );
}

function validClient(c: any) {
  if (typeof c !== "object" || c === null) return false;
  if (c.port == null || c.token == null || typeof c.url !== "string")
    return false;
  try {
    return ["http:", "https:"].includes(new URL(c.url).protocol);
  } catch {
    return false;
  }
}

/**
 * Why a network a dapp asks to add cannot be added, or undefined if it can.
 * `existing` is every network the wallet already knows. A dapp may only add
 * new networks: overriding a known genesisID's node is for the user alone, in
 * Settings > Custom Networks.
 */
export function networkError(
  network: unknown,
  existing: Pick<Network, "name" | "genesisID">[]
) {
  const n = network as Partial<Network> | null;
  if (
    typeof n !== "object" ||
    n === null ||
    Array.isArray(n) ||
    typeof n.name !== "string" ||
    !n.name.trim() ||
    typeof n.genesisID !== "string" ||
    !n.genesisID ||
    !validClient(n.algod) ||
    (n.indexer != null && !validClient(n.indexer))
  )
    return "Invalid Network";
  if (existing.some((e) => e.genesisID === n.genesisID))
    return "Network Already Exists";
  // Networks are picked by name, so one named like another would be
  // unreachable behind it.
  const name = n.name.trim().toLowerCase();
  if (existing.some((e) => e.name.trim().toLowerCase() === name))
    return "Network Name Already Exists";
  return undefined;
}
