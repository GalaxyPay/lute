import { describe, expect, it } from "vitest";
import { findNetwork, networkError } from "@/utils/networks";

describe("findNetwork", () => {
  const nets = [
    { name: "MainNet", genesisID: "mainnet-v1.0", genesisHash: "AAA" },
    { name: "Dockernet", genesisID: "dockernet-v1" },
  ] as any[];

  it("matches by id and, when both have one, by hash", () => {
    expect(findNetwork(nets, "mainnet-v1.0", "AAA")?.name).toBe("MainNet");
    expect(findNetwork(nets, "mainnet-v1.0")?.name).toBe("MainNet");
    expect(findNetwork(nets, "mainnet-v1.0", "BBB")).toBeUndefined();
    expect(findNetwork(nets, "dockernet-v1", "anything")?.name).toBe(
      "Dockernet"
    );
  });

  it("treats sandnet as dockernet", () => {
    expect(findNetwork(nets, "sandnet-v1")?.name).toBe("Dockernet");
  });

  it("finds nothing for an unknown or missing id", () => {
    expect(findNetwork(nets, "testnet-v1.0")).toBeUndefined();
    expect(findNetwork(nets, undefined)).toBeUndefined();
  });
});

describe("networkError", () => {
  const client = { url: "https://node.example", port: "", token: "" };
  const existing = [
    { name: "MainNet", genesisID: "mainnet-v1.0", algod: client },
  ] as any[];
  const proposed = (over: Record<string, unknown> = {}) => ({
    name: "MyNet",
    genesisID: "mynet-v1",
    algod: client,
    ...over,
  });

  it("accepts a well-formed new network", () => {
    expect(networkError(proposed(), existing)).toBeUndefined();
    expect(
      networkError(proposed({ indexer: { ...client, port: 443 } }), existing)
    ).toBeUndefined();
  });

  it.each([
    ["null", null],
    ["a string", "MyNet"],
    ["an array", [proposed()]],
    ["no name", proposed({ name: "" })],
    ["a blank name", proposed({ name: "  " })],
    ["no genesis id", proposed({ genesisID: undefined })],
    ["no algod", proposed({ algod: undefined })],
    ["an algod with no token", proposed({ algod: { url: client.url, port: "" } })],
    ["a non-http algod", proposed({ algod: { ...client, url: "javascript:alert(1)" } })],
    ["an unparseable algod url", proposed({ algod: { ...client, url: "not a url" } })],
    ["a broken indexer", proposed({ indexer: { url: client.url } })],
  ])("refuses %s", (_what, network) => {
    expect(networkError(network, existing)).toBe("Invalid Network");
  });

  it("refuses a known genesisID: overrides are for Settings only", () => {
    expect(
      networkError(proposed({ genesisID: "mainnet-v1.0" }), existing)
    ).toBe("Network Already Exists");
  });

  it("refuses a new network named like an existing one", () => {
    expect(networkError(proposed({ name: " mainnet " }), existing)).toBe(
      "Network Name Already Exists"
    );
  });
});
