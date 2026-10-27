// Utilities
import type LuteTxns from "@/classes/LuteTxns";
import { networks } from "@/data";
import { del, readCache, set } from "@/dbLute";
import { secretStatus } from "@/services/accountSecret";
import { readTheme, saveTheme, THEME_KEY } from "@/services/themePref";
import type {
  AccountHD,
  AccountInfo,
  Arc55App,
  FalconSeedData,
  KeystoreHeader,
  KeystoreMeta,
  KeystoreMode,
  KeystoreRecord,
  LuteAccount,
  Network,
  NsObject,
  SeedData,
  SnackBar,
  TinyAsset,
} from "@/types";
import vuetify from "@/plugins/vuetify";
import { deepClone, formatAddr, setIcon } from "@/utils";
import type { modelsv2 } from "algosdk";
import { defineStore } from "pinia";

// "app" store keys copied straight to the state field of the same name, with
// the value used when the key is unset.
const SETTINGS = {
  customNetworks: [] as Network[],
  sandboxRouter: undefined as number | undefined,
  // Favorite asset ids, keyed by favoritesKey(): per network and account.
  favoriteAssets: {} as Record<string, number[]>,
  debug: false,
  snoop: false,
  ledgerSelect: false,
  experimental: false,
  nsSend: true,
  hideBalances: false,
  autoLockMinutes: 0,
};

const hotWalletSupport = crypto.subtle
  .generateKey({ name: "Ed25519" }, false, ["sign"])
  .then(
    () => true,
    () => false
  );

let appliedTheme: string | undefined;

// Fires in every other same-origin page, e.g. the popup when options change it.
addEventListener("storage", (e) => {
  if (e.key === THEME_KEY) useAppStore().applyTheme(e.newValue || "dark");
});

export const useAppStore = defineStore("app", {
  state: () => ({
    loading: 0,
    overlay: false,
    accounts: [] as LuteAccount[],
    // Set by the first getCache; until then the account list is unknown.
    cacheLoaded: false,
    info: [] as AccountHD[],
    // The network `info` was loaded for. Until it matches networkName,
    // rekeyed accounts show as top-level rows instead of under their signer.
    infoNetwork: undefined as string | undefined,
    nsObj: {} as NsObject,
    snackbar: {
      text: "",
      color: "",
      timeout: 0,
      display: false,
    } as SnackBar,
    refresh: 0,
    theme: readTheme() || "dark",
    networkName: networks[0]!.name,
    hotWallet: true,
    keys: [] as string[],
    seeds: [] as SeedData[],
    falcon25Seeds: [] as FalconSeedData[],
    // Metadata only; ciphertext never enters the store.
    keystore: [] as KeystoreMeta[],
    hasKeystore: false,
    // Also the mode the wallet will take once its header is written.
    keystoreMode: "device" as KeystoreMode,
    // A 1.x password verifier not yet replaced by a keystore header.
    legacyVerifier: false,
    drawer: false,
    debug: false,
    snoop: false,
    ledgerSelect: false,
    experimental: false,
    nsSend: true,
    hideBalances: false,
    autoLockMinutes: 0,
    unlocked: false,
    tinyman: undefined as TinyAsset[] | undefined,
    sandboxRouter: undefined as number | undefined,
    isWeb: document.location.protocol.startsWith("http"),
    customNetworks: [] as Network[],
    // Favorite asset ids, keyed by favoritesKey(): per network and account.
    favoriteAssets: {} as Record<string, number[]>,
    signingData: false,
    luteTxns: undefined as LuteTxns | undefined,
    fallback: false,
    device: {
      transport: (navigator.hid ? "hid" : navigator.usb ? "usb" : undefined) as
        "hid" | "usb" | undefined,
      showSelector: false,
      list: [] as (HIDDevice | USBDevice)[],
    },
  }),
  getters: {
    acctInfo(state) {
      const val: AccountInfo[] = [];
      this.accounts
        .filter(
          (a) =>
            this.signingData || !a.network || a.network === this.networkName
        )
        .forEach((a) => {
          function getCanSign(acct: LuteAccount) {
            const secret = secretStatus(acct, state);
            const isFalcon25 =
              state.falcon25Seeds.some((s) => s.id === acct.addr) ||
              state.keystore.some((k) => k.id === `falcon25:${acct.addr}`);
            const isHot =
              !isFalcon25 &&
              (state.keys.includes(acct.addr) ||
                state.keystore.some((k) => k.id === `algo25:${acct.addr}`));
            const canSign = isHot || isFalcon25 || acct.slot != null;
            return { info, isHot, isFalcon25, canSign, secret };
          }
          const info = this.info.find((i) => i.address === a.addr);
          const { isHot, isFalcon25, canSign, secret } = getCanSign(a);
          if (isHot && !this.hotWallet) return;
          const authAcct = this.accounts.find(
            (a) => a.addr === info?.authAddr?.toString()
          );
          const auth = authAcct && getCanSign(authAcct);
          const globalIdx = this.accounts.findIndex((ga) => ga.addr === a.addr);
          if (!auth || (!canSign && !a.appId && !auth.canSign)) {
            val.push({
              ...a,
              title: formatAddr(a.addr),
              isHot,
              isFalcon25,
              canSign,
              secret,
              info,
              globalIdx,
              ns: this.nsObj[a.addr],
            });
          }
          if (canSign || a.appId) {
            this.info
              .filter((i) => i.authAddr?.toString() === a.addr)
              .sort((x, y) => x.address.localeCompare(y.address))
              .forEach((i) => {
                val.push({
                  addr: i.address,
                  title: formatAddr(i.address),
                  isHot: false,
                  isFalcon25,
                  canSign,
                  secret,
                  subType: "rekey",
                  info: i,
                  globalIdx,
                  ns: this.nsObj[i.address],
                });
              });
          }
          if (a.xpub) {
            this.info
              .filter((i) => i.sibling === a.addr)
              .sort((x, y) => x.addrIdx! - y.addrIdx!)
              .forEach((i) => {
                val.push({
                  addr: i.address,
                  title: formatAddr(i.address),
                  isHot: false,
                  isFalcon25: false,
                  canSign,
                  secret,
                  subType: "hd",
                  info: i,
                  globalIdx,
                  ns: this.nsObj[i.address],
                  slot: a.slot,
                  seedId: a.seedId,
                });
              });
          }
        });
      return val;
    },
    sendAcctInfo(): AccountInfo[] {
      return this.acctInfo.filter((ai) => ai.canSign || ai.appId);
    },
    signAcctInfo(): AccountInfo[] {
      return this.sendAcctInfo.filter((ai) => !ai.appId);
    },
    allNetworks(): Network[] {
      const resp: Network[] = deepClone(networks);
      this.customNetworks.forEach((cn) => {
        const ix = resp.findIndex((n) => n.genesisID === cn.genesisID);
        if (ix !== -1) {
          resp[ix]!.algod = cn.algod;
          resp[ix]!.indexer = cn.indexer;
          resp[ix]!.fallback = cn.fallback;
        } else {
          resp.push(cn);
        }
      });
      return resp;
    },
    network(): Network {
      const val = this.allNetworks.find((n) => n.name === this.networkName)!;
      if (this.networkName === "LocalNet") {
        val.inboxRouter = this.sandboxRouter;
      }
      return val;
    },
    isLutier(): boolean {
      return this.signAcctInfo.some((acct) =>
        acct.info?.assets?.some(
          (a) => Number(a.assetId) === this.network.lutier?.asset && a.amount
        )
      );
    },
    isVoi(): boolean {
      return this.networkName.startsWith("Voi");
    },
    showDialogSnack(): boolean {
      return (
        !!this.luteTxns &&
        !this.snackbar.text.includes("Awaiting Signatures...")
      );
    },
    nativeAsset(): modelsv2.Asset {
      return {
        index: 0n,
        params: { name: this.isVoi ? "Voi" : "Algo" },
      } as modelsv2.Asset;
    },
  },
  actions: {
    // One snapshot, one patch: a render between partial assignments shows
    // states that never existed (e.g. legacy secrets with no keystore yet).
    async getCache() {
      const [c, hotWallet] = await Promise.all([readCache(), hotWalletSupport]);
      const saved = readTheme();
      // @legacy-read: 1.x kept the theme in the "app" store.
      const legacyTheme: string | undefined = c.app.theme;
      if (!saved && legacyTheme && saveTheme(legacyTheme))
        await del("app", "theme");
      const theme = saved || legacyTheme || "dark";
      const settings = Object.fromEntries(
        Object.entries(SETTINGS).map(([k, d]) => [k, c.app[k] ?? d])
      ) as typeof SETTINGS;
      const nn = c.app.networkName;
      const header: KeystoreHeader | undefined = c.app.keystore;
      const legacyVerifier = !!c.app.password;
      this.$patch({
        ...settings,
        cacheLoaded: true,
        hotWallet,
        // allNetworks is the built-ins plus custom networks by name.
        networkName:
          [...networks, ...settings.customNetworks].find((n) => n.name === nn)
            ?.name || networks[0]!.name,
        hasKeystore: !!header,
        legacyVerifier,
        keystoreMode: header?.mode ?? (legacyVerifier ? "password" : "device"),
        accounts: c.app.accounts || [],
        keys: c.keys as string[],
        seeds: c.seeds,
        falcon25Seeds: c.falcon25Seeds,
        keystore: (c.keystore as KeystoreRecord[]).map(
          ({ id, kind, form }) => ({ id, kind, form })
        ),
      });
      await this.applyTheme(theme);
    },
    /** Vuetify already starts in the saved theme; the icon waits for this. */
    async applyTheme(name: string) {
      this.theme = name;
      if (name === appliedTheme) return;
      appliedTheme = name;
      vuetify.theme.change(name);
      await setIcon(name);
    },
    favoritesKey(addr: string) {
      return `${this.network.genesisID}/${addr}`;
    },
    async toggleFavoriteAsset(addr: string, assetId: number) {
      const key = this.favoritesKey(addr);
      const ids = this.favoriteAssets[key] || [];
      const next = ids.includes(assetId)
        ? ids.filter((id) => id !== assetId)
        : [...ids, assetId];
      const all = { ...this.favoriteAssets, [key]: next };
      if (!next.length) delete all[key];
      this.favoriteAssets = all;
      await set("app", "favoriteAssets", deepClone(all));
    },
    // Other open pages follow through the storage event below.
    async setTheme(name: string | null) {
      saveTheme(name || "dark");
      await this.applyTheme(name || "dark");
    },
    async setSnackbar(text: string, color = "info", timeout = 4000) {
      if (color === "error") timeout = 15000;
      this.snackbar = {
        text,
        color,
        timeout,
        display: true,
      };
    },
    msigSigner(app: Arc55App) {
      // return signer with highest voting power
      const voteMap = app.addrs.reduce(
        (a, c) => {
          a[c] = (a[c] || 0) + 1;
          return a;
        },
        {} as { [key: string]: number }
      );
      const orderedAddrs = Object.keys(voteMap).sort(function (a, b) {
        return voteMap[b]! - voteMap[a]!;
      });
      const member = orderedAddrs.find((addr) =>
        this.signAcctInfo.some((a) => addr === a.addr)
      );
      if (member) return member;
      throw Error("Not a Member of Multi-Sig");
    },
    async removeMsigAccount(appId: bigint) {
      const ix = this.accounts.findIndex((a) => a.appId === appId);
      if (ix === -1) return;
      const newVal = deepClone(this.accounts.toSpliced(ix, 1));
      await set("app", "accounts", newVal);
      await this.getCache();
    },
    async getDevices() {
      if (this.device.transport) {
        const devices = await navigator[this.device.transport].getDevices();
        this.device.list = devices.filter((d) => d.vendorId === 0x2c97);
      }
    },
    selectDevice(device: any) {
      console.log("action", device);
      return device;
    },
  },
});
