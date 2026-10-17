// Stand-in for the Pinia store in unit tests. Only the fields the services
// under test read are modelled.
import type { FalconSeedData, KeystoreMeta, KeystoreMode, SeedData } from "@/types";

export const testStore = {
  isWeb: true,
  autoLockMinutes: 0,
  unlocked: false,
  keystoreMode: "device" as KeystoreMode,
  keys: [] as string[],
  seeds: [] as SeedData[],
  falcon25Seeds: [] as FalconSeedData[],
  keystore: [] as KeystoreMeta[],
  snackbar: { display: false },
  setSnackbar() {},
};

export function useAppStore() {
  return testStore;
}
