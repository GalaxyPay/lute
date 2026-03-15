import type { _ProtocolWithReturn } from "webext-bridge";

declare module "webext-bridge" {
  export interface ProtocolMap {
    // define message protocol types
    // see https://github.com/antfu/webext-bridge#type-safe-protocols
    "connect-request": {
      appName: string;
      genesisID: string;
    };
    "sign-txns-request": {
      appName: string;
    };
    "sign-data-request": {
      domain: string;
    };
    "swap-request": {
      tx1: string;
      tx2: string;
    };
    "add-network-request": {
      appName: string;
    };
  }
}
