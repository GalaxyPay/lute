// Fail fast, with the fix, when localnet is not up: otherwise every test
// times out on its first algod call.
import { networks } from "../../src/data/index";

export default async function () {
  const local = networks.find((n) => n.name === "LocalNet")!;
  const url = `${local.algod.url}:${local.algod.port}/health`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw Error(`HTTP ${res.status}`);
  } catch (err: any) {
    throw Error(
      `LocalNet algod is not reachable at ${url} (${err.message}). ` +
        "Start it with `algokit localnet start`."
    );
  }
}
