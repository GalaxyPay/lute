<template>
  <device-selector v-if="store.device.showSelector" />
  <div v-else class="ext-page sign-view" :class="loading && 'sign-view--busy'">
    <v-progress-linear v-if="loading" indeterminate height="3" />
    <template v-if="!loading">
      <template v-if="showMsig">
        <div class="ext-header">
          <div class="title-panel text-warning">Warning</div>
        </div>
        <div class="ext-body d-flex flex-column ga-4 text-text-body">
          <div>
            Because you are connected to Lute with a
            <span class="text-warning">multi-sig account</span>, the requested
            transactions will be stored in the associated multi-sig contract
            instead of being signed.
          </div>
          <div>
            This action will require
            <span class="text-warning">{{ reviewTxns.length * 2 + 1 }}</span>
            transactions to be signed by a member of the multi-sig. Choose an
            account and Proceed to review those transactions.
          </div>
          <v-select
            label="Signing account"
            :items="signingAccts"
            v-model="luteTxns.msig!.signerAddr"
            item-value="addr"
          />
        </div>
        <div class="ext-footer">
          <v-btn
            block
            size="large"
            variant="flat"
            text="Proceed"
            @click="luteTxns.addToMsig()"
          />
        </div>
      </template>
      <template v-else>
        <div class="sign-title">
          {{
            `${siteName} wants to sign ${signCount}
              transaction${signCount > 1 ? "s" : ""}
              for ${store.networkName}`
          }}
        </div>
        <div v-if="luteTxns.groupWarn" class="text-warning text-body-2 px-5">
          These transactions are NOT a single atomic group. Review carefully.
        </div>
        <div class="sign-list">
          <review-txn
            v-for="(txn, idx) in reviewTxns"
            :key="txn.txID()"
            :txn="txn"
            :idx="idx"
            :to-sign="!!luteTxns.atc.getStatus() || toSign(idx)"
            :assets="assets"
          />
        </div>
        <div class="ext-footer">
          <v-btn
            block
            size="large"
            variant="flat"
            text="Sign"
            @click="passwordCheck()"
            :disabled="signing"
          />
        </div>
      </template>
    </template>
  </div>
  <password-confirm :visible="showPass" @close="handlePass" />
</template>

<script lang="ts" setup>
import LuteTxns from "@/classes/LuteTxns";
import Algo from "@/services/Algo";
import Signer from "@/services/Signer";
import type { AccountInfo } from "@/types";
import { signingAddr } from "@/utils/signingAddr";
import {
  isFromOpener,
  postReady,
  resetSidePanel,
  sendOrPostMessage,
  whenLoaded,
} from "@/utils";
import { modelsv2, Transaction, type TransactionWithSigner } from "algosdk";

const store = useAppStore();
const loading = ref(true);
const signing = ref(false);
const showPass = ref(false);
const assets = ref<modelsv2.Asset[]>([]);
const luteTxns = ref<LuteTxns>(new LuteTxns([]));
let who: string | null;
let tabId: number | undefined;

const reviewTxns = computed<Transaction[]>(() =>
  luteTxns.value.atc.getStatus() // @ts-ignore
    ? luteTxns.value.atc?.transactions.map(
        (tws: TransactionWithSigner) => tws.txn
      )
    : luteTxns.value.dtxns
);

const signingAccts = computed(() =>
  store.signAcctInfo.filter(
    (ai) =>
      ai.addr === luteTxns.value.msig?.app?.arc55_admin ||
      luteTxns.value.msig?.app?.addrs.some((a) => ai.addr === a)
  )
);

const showMsig = computed(
  () =>
    luteTxns.value.msig &&
    !luteTxns.value.msig.bypass &&
    !luteTxns.value.atc.getStatus()
);

const signCount = computed(() =>
  luteTxns.value.atc.getStatus()
    ? luteTxns.value.atc?.count()
    : luteTxns.value.txns.filter((t) => !t.signers || t.signers.length).length
);

function toSign(ix: number): boolean {
  return (
    !luteTxns.value.txns[ix]?.signers ||
    !!luteTxns.value.txns[ix].signers?.length
  );
}

const siteName = computed(() => {
  return luteTxns.value.msig || store.luteTxns
    ? "Lute"
    : store.isWeb
      ? window.name
      : who;
});

onMounted(() => whenLoaded(ready));

async function ready() {
  if (store.luteTxns) {
    luteTxns.value = store.luteTxns;
    beginHandler();
    return;
  }
  const message = { action: "ready", debug: store.debug };
  if (store.isWeb) {
    window.addEventListener("message", messageHandler);
    postReady(message);
  } else {
    browser.runtime.connect({ name: "luteSidepanel" });
    const params = new URLSearchParams(document.location.search);
    who = params.get("name");
    tabId = Number(params.get("tabId"));
    browser.runtime.onMessage.addListener(messageHandler);
    try {
      await browser.tabs.sendMessage(tabId, message, { frameId: 0 });
    } catch {
      await resetSidePanel();
    }
  }
}

function messageHandler(event: any) {
  if (store.isWeb && !isFromOpener(event)) return;
  if (event.data?.action === "sign") {
    luteTxns.value = new LuteTxns(event.data.txns, tabId);
    beginHandler();
  }
}

async function beginHandler() {
  if (store.debug)
    console.log("[Lute Debug]", {
      txns: luteTxns.value.txns,
      dtxns: luteTxns.value.dtxns,
    });
  if (store.luteTxns) {
    // internal modal signer: no refresh is triggered, proceed directly
    if (await luteTxns.value.validateNetwork()) await finishHandler();
    return;
  }
  // validateNetwork may trigger a refresh; finish only after it settles.
  const stop = watch(
    () => store.loading,
    (val) => {
      if (val) return;
      stop();
      finishHandler();
    }
  );
  await luteTxns.value.validateNetwork();
}

async function finishHandler() {
  // A failed check has already answered the requester; show nothing to sign.
  if (!(await luteTxns.value.prepare())) return;
  luteTxns.value.dtxns
    .filter((t) => t.assetTransfer)
    .map(async (t) => {
      const asset = await Algo.algod
        .getAssetByID(t.assetTransfer!.assetIndex)
        .do();
      assets.value.push(asset);
    });
  loading.value = false;
}

async function trySign(pass?: string) {
  // sign() returns false when the password failed to decrypt or
  // the unlock cache could not cover the seed;
  // fall back to the password prompt instead of failing the request.
  if ((await luteTxns.value.sign(pass)) === false) showPass.value = true;
}

async function passwordCheck() {
  try {
    signing.value = true;
    const authAddrs = luteTxns.value.txns.map((txn) => txn.authAddr);
    const accts: AccountInfo[] = [];
    for (const [idx, txn] of luteTxns.value.dtxns.entries()) {
      if (!toSign(idx)) continue;
      const addr = signingAddr(
        txn,
        authAddrs[idx],
        luteTxns.value.msig,
        store.info
      );
      const acct = store.acctInfo.find((a) => a.addr === addr);
      if (acct) accts.push(acct);
    }
    if ((await Signer.gate(accts)) === "password") showPass.value = true;
    else await trySign();
  } catch (err: any) {
    luteTxns.value.handleError(err);
  }
  signing.value = false;
}

async function handlePass(success: boolean, pass: string) {
  showPass.value = false;
  if (!success) return;
  await trySign(pass);
  // The first password entry may have moved 1.x seeds into the keystore; the
  // in-app signer stays open, so refresh what it shows.
  if (store.luteTxns) await store.getCache();
}

window.onbeforeunload = () => {
  const message = { action: "close", debug: store.debug };
  sendOrPostMessage(message, tabId);
};
</script>

<style scoped>
.sign-view--busy {
  pointer-events: none;
}
.sign-title {
  padding: 18px 18px 6px;
  font-size: 17px;
  font-weight: 500;
  line-height: 1.35;
}
.sign-list {
  padding: 0 18px;
}
</style>
