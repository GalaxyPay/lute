<template>
  <device-selector v-if="store.device.showSelector" />
  <v-container v-else class="pt-0">
    <v-card :loading="loading" :disabled="loading">
      <template v-if="!loading">
        <template v-if="showMsig">
          <div class="text-warning text-h5 pa-4">Warning</div>
          <v-card-text>
            Because you are connected to Lute with a
            <span class="text-warning">Multi-Sig account</span>, the requested
            transactions will be stored in the associated multi-sig contract
            instead of being signed.
          </v-card-text>
          <v-card-text>
            This action will require
            <span class="text-warning">{{ reviewTxns.length * 2 + 1 }}</span>
            transactions to be signed by a member of the Multi-Sig. Choose an
            account and Proceed to review those transactions.
          </v-card-text>
          <v-container class="pb-0">
            <v-row justify="center">
              <v-col cols="9">
                <v-select
                  label="Signing Account"
                  :items="signingAccts"
                  v-model="luteTxns.msig!.signerAddr"
                  item-value="addr"
                />
              </v-col>
            </v-row>
          </v-container>
          <v-container class="text-center">
            <v-btn text="Proceed" @click="luteTxns.addToMsig()" />
          </v-container>
        </template>
        <template v-else-if="showFalcon">
          <div class="text-warning text-h5 pa-4">Warning</div>
          <v-card-text>
            Because you are connected to Lute with a
            <span class="text-warning">Falcon account</span>, the requested
            transactions will be altered! Fees will be increased, and dummy
            transactions will be added.
          </v-card-text>
          <v-card-text>
            Also, the transactions will be submitted to the chain by the wallet
            and an error will be returned to the app.
          </v-card-text>
          <v-card-text v-if="falconRestrict" class="text-error">
            ERROR: Falcon accounts do not curretly support signing groups larger
            than 5 transactions.
          </v-card-text>
          <v-container class="text-center">
            <v-btn
              text="Proceed"
              @click="luteTxns.addDummyTxns()"
              :disabled="falconRestrict"
            />
          </v-container>
        </template>
        <template v-else>
          <div class="text-h5 pa-4">
            {{
              `${siteName} wants to sign ${signCount}
              transaction${signCount > 1 ? "s" : ""}
              for ${store.networkName}`
            }}
          </div>
          <div v-if="luteTxns.groupWarn" class="text-warning px-4">
            These transactions are NOT a single atomic group. Review carefully.
          </div>
          <v-container class="pt-0">
            <review-txn
              v-for="(txn, idx) in reviewTxns"
              :key="txn.txID()"
              :txn="txn"
              :idx="idx"
              :to-sign="!!luteTxns.atc.getStatus() || toSign(idx)"
              :assets="assets"
            />
            <v-row class="text-center">
              <v-col>
                <v-btn
                  :text="luteTxns.falcon?.adjusted ? 'Sign and Send' : 'Sign'"
                  @click="passwordCheck()"
                  :disabled="signing"
                />
              </v-col>
            </v-row>
          </v-container>
        </template>
      </template>
    </v-card>
  </v-container>
  <password-confirm :visible="showPass" @close="handlePass" />
</template>

<script lang="ts" setup>
import LuteTxns from "@/classes/LuteTxns";
import Algo from "@/services/Algo";
import { resetSidePanel, sendOrPostMessage, whenLoaded } from "@/utils";
import algosdk, { modelsv2 } from "algosdk";

const store = useAppStore();
const loading = ref(true);
const signing = ref(false);
const showPass = ref(false);
const assets = ref<modelsv2.Asset[]>([]);
const luteTxns = ref<LuteTxns>(new LuteTxns([]));
let who: string | null;
let tabId: number | undefined;

const reviewTxns = computed<algosdk.Transaction[]>(() =>
  luteTxns.value.atc.getStatus() // @ts-ignore
    ? luteTxns.value.atc?.transactions.map(
        (tws: algosdk.TransactionWithSigner) => tws.txn
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
const showFalcon = computed(
  () => !!luteTxns.value.falcon && !luteTxns.value.falcon.adjusted
);
const falconRestrict = computed(() => (luteTxns.value.falcon?.count || 0) > 5);

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
    window.opener.postMessage(message, "*");
    window.addEventListener("message", messageHandler);
  } else {
    browser.runtime.connect({ name: "luteSidepanel" });
    const params = new URLSearchParams(document.location.search);
    who = params.get("name");
    tabId = Number(params.get("tabId"));
    browser.runtime.onMessage.addListener(messageHandler);
    try {
      await browser.tabs.sendMessage(tabId, message);
    } catch {
      await resetSidePanel();
    }
  }
}

function messageHandler(event: any) {
  if (event.data.action === "sign") {
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
  // wait for refresh to complete before proceeding
  watch(
    () => store.loading,
    (val) => {
      if (!val) finishHandler();
    }
  );
  await luteTxns.value.validateNetwork();
}

async function finishHandler() {
  await luteTxns.value.validateGroup();
  await luteTxns.value.msigCheck();
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

async function passwordCheck() {
  try {
    signing.value = true;
    const authAddrs = luteTxns.value.txns.map((txn) => txn.authAddr);
    for (const [idx, txn] of luteTxns.value.dtxns.entries()) {
      if (!toSign(idx)) continue;
      const from = txn.sender.toString();
      const addr =
        luteTxns.value.msig?.signerAddr ||
        authAddrs?.[idx] ||
        store.info.find((i) => i.address === from)?.authAddr ||
        from;
      const acct = store.acctInfo.find((a) => a.addr === addr);
      if (acct?.seedId) {
        const seedData = store.seeds.find((s) => s.id === acct.seedId);
        if (!seedData) throw Error("Invalid Seed");
        if (seedData.data) showPass.value = true;
        break;
      }
    }
    if (!showPass.value) {
      await luteTxns.value.sign();
    }
  } catch (err: any) {
    luteTxns.value.handleError(err);
  }
  signing.value = false;
}

function handlePass(success: boolean, pass: string) {
  showPass.value = false;
  if (!success) {
    store.setSnackbar("Incorrect Password", "error");
  } else {
    luteTxns.value.sign(pass);
  }
}

window.onbeforeunload = () => {
  const message = { action: "close", debug: store.debug };
  sendOrPostMessage(message, tabId);
};
</script>
