// Groups an algokit composer builds and sends (Settings > Create Router, the
// ARC-55 app calls) are signed through pricedSigner, which prices them for
// the signer first: a Falcon sender pays its surcharge.
import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import { beforeEach, expect, it, vi } from "vitest";
import { Arc59Factory } from "@/clients/Arc59Client";
import type LuteTxns from "@/classes/LuteTxns";
import { pricedSigner } from "@/utils/signers";
import { algorand, type Auth, falcon, funded, useLocalNet } from "./helpers";

vi.mock("@/router", () => ({ default: { replace: vi.fn() } }));

(globalThis as any).window = new EventTarget();

let signer: Auth;

beforeEach(async () => {
  signer = falcon();
  const store = useLocalNet({
    acctInfo: [{ addr: signer.addr, isFalcon25: true }],
  });
  // The sign dialog: approve each request with the Falcon key.
  Object.defineProperty(store, "luteTxns", {
    configurable: true,
    get: () => undefined,
    set(lt?: LuteTxns) {
      if (!lt) return;
      queueMicrotask(async () => {
        const txns = await Promise.all(lt.dtxns.map(signer.sign));
        window.dispatchEvent(
          new CustomEvent("modal-signer", {
            detail: { action: "signed", txns },
          })
        );
      });
    },
  });
});

it("raises a composer's fees to a Falcon sender's price", async () => {
  await algorand.send.payment({
    sender: (await funded(1)).addr,
    receiver: signer.addr,
    amount: (0.5).algo(),
  });
  const client = AlgorandClient.fromClients({ algod: algorand.client.algod });
  client.setDefaultSigner(pricedSigner);
  client.setDefaultValidityWindow(1000);
  const factory = new Arc59Factory({
    defaultSender: signer.addr,
    algorand: client,
  });

  const { result } = await factory.send.create.createApplication();

  expect(result.appId).toBeGreaterThan(0n);
  expect(result.transaction.fee).toBe(3000n);
});
