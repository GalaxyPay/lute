// Utilities
import type LuteTxns from "@/classes/LuteTxns";
import { networks } from "@/data";
import { get, getAll, keys, set } from "@/dbLute";
import type {
  AccountHD,
  AccountInfo,
  Arc55App,
  LuteAccount,
  Network,
  NsObject,
  SeedData,
  SnackBar,
  TinyAsset,
} from "@/types";
import { deepClone, formatAddr } from "@/utils";
import { defineStore } from "pinia";

export const useAppStore = defineStore("app", {
  state: () => ({
    loading: 0,
    overlay: false,
    accounts: [] as LuteAccount[],
    info: [] as AccountHD[],
    nsObj: {} as NsObject,
    snackbar: {
      text: "",
      color: "",
      timeout: 0,
      display: false,
    } as SnackBar,
    refresh: 0,
    networkName: networks[0]!.name,
    hotWallet: true,
    keys: [] as string[],
    seeds: [] as SeedData[],
    drawer: false,
    debug: false,
    snoop: false,
    ledgerSelect: false,
    experimental: false,
    tinyman: undefined as TinyAsset[] | undefined,
    sandboxRouter: undefined as number | undefined,
    isWeb: document.location.protocol === "https:",
    customNetworks: [] as Network[],
    signData: false,
    luteTxns: undefined as LuteTxns | undefined,
    fallback: false,
    device: {
      transport: (navigator.hid ? "hid" : navigator.usb ? "usb" : undefined) as
        | "hid"
        | "usb"
        | undefined,
      showSelector: false,
      list: [] as (HIDDevice | USBDevice)[],
    },
  }),
  getters: {
    acctInfo(state) {
      const val: AccountInfo[] = [];
      this.accounts
        .filter(
          (a) => this.signData || !a.network || a.network === this.networkName
        )
        .forEach((a) => {
          function getCanSign(acct: LuteAccount) {
            const isHot = state.keys.includes(acct.addr);
            const canSign = isHot || acct.slot != null || !!acct.falcon;
            return { info, isHot, canSign };
          }
          const info = this.info.find((i) => i.address === a.addr);
          const { isHot, canSign } = getCanSign(a);
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
              canSign,
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
                  canSign,
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
                  canSign,
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
  },
  actions: {
    async getCache() {
      try {
        await crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign"]);
      } catch {
        this.hotWallet = false;
      }
      const nn = await get("app", "networkName");
      this.customNetworks = (await get("app", "customNetworks")) || [];
      this.networkName =
        this.allNetworks.find((n) => n.name === nn)?.name || networks[0]!.name;
      this.sandboxRouter = await get("app", "sandboxRouter");
      this.accounts = (await get("app", "accounts")) || [];
      this.debug = (await get("app", "debug")) ?? this.debug;
      this.snoop = (await get("app", "snoop")) ?? this.snoop;
      this.ledgerSelect =
        (await get("app", "ledgerSelect")) ?? this.ledgerSelect;
      this.experimental =
        (await get("app", "experimental")) ?? this.experimental;
      this.keys = (await keys("keys")) as string[];
      this.seeds = await getAll("seeds");
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
