<template>
  <div class="msig-app">
    <div class="d-flex flex-column ga-2 min-w-0">
      <div class="d-flex align-center ga-2">
        <span class="msig-title">Application {{ appId }}</span>
        <v-spacer />
        <v-btn
          icon
          variant="text"
          size="small"
          :href="store.network.explorer + '/application/' + appId"
          target="_blank"
        >
          <v-icon :icon="mdiInformationOutline" size="16" />
          <v-tooltip activator="parent" text="App Details" location="bottom" />
        </v-btn>
        <v-btn
          v-if="signingAddr && isAdmin"
          icon
          variant="text"
          size="small"
          color="error"
          @click="Msig.destroyApp(app, signingAddr!)"
        >
          <v-icon :icon="mdiDelete" size="16" />
          <v-tooltip activator="parent" text="Destroy App" location="bottom" />
        </v-btn>
      </div>
      <template v-if="app">
        <div class="msig-label">Members:</div>
        <div v-for="addr in app.addrs" :key="addr" class="msig-member">
          {{ addr }}
        </div>
        <div class="msig-label">
          Threshold:
          <b class="text-high-emphasis">
            {{ app.arc55_threshold }} of {{ app.addrs.length }}
          </b>
        </div>
      </template>
    </div>
    <div v-if="app">
      <v-select
        label="Signing Account"
        :items="signingAccts"
        v-model="signingAddr"
        item-value="addr"
        hide-details
      />
    </div>
  </div>
  <template v-if="signingAddr">
    <div class="msig-intro">
      <div class="msig-title">Transactions</div>
      <div class="text-muted text-body-2">
        When you connect to dApps with your Lute Multi-Sig address, instead of
        signing the transactions Lute will add them here to be signed by all
        parties.
      </div>
    </div>
    <div v-for="grp in shownGroups" :key="Number(grp.nonce)" class="msig-group">
      <div class="msig-group-header">
        <span class="font-weight-medium">Group {{ grp.nonce }}</span>
        <v-spacer />
        <span class="text-muted">
          Status:
          <span class="text-high-emphasis">{{ status(grp) }}</span>
        </span>
      </div>
      <div v-show="app?.groups.length" class="msig-txns">
        <div v-for="(txn, tix) in grp.txns" :key="tix" class="msig-box">
          <div class="msig-box-label">
            Transaction {{ tix + 1 }}
            {{ grp.stxns[tix] ? "(Not to be Signed)" : "" }}
          </div>
          <pre>{{ algosdk.encodeJSON(txn, { space: 2 }) }}</pre>
        </div>
      </div>
      <div class="msig-box msig-sigs">
        <div class="msig-box-label">Signatures Gathered</div>
        <div v-if="!grp.sigs.length" class="text-muted text-body-2">None</div>
        <div v-for="sig in grp.sigs" :key="sig.addr" class="msig-member">
          {{ sig.addr }}
        </div>
      </div>
      <v-card-actions class="card-footer">
        <v-btn
          v-show="!isSigned(grp)"
          variant="flat"
          text="Add Your Signature"
          :disabled="
            isSubmitted(grp.nonce) ||
            isExpired(grp) ||
            !app?.addrs.includes(signingAddr)
          "
          @click="
            showAddSig = true;
            signGroup = grp;
          "
        />
        <v-btn
          v-show="isSigned(grp)"
          variant="outlined"
          text="Remove Your Signature"
          @click="Msig.clearSigs(appId, grp.nonce, signingAddr!)"
        />
        <v-spacer />
        <v-btn
          variant="flat"
          text="Submit"
          :disabled="
            isSubmitted(grp.nonce) || isExpired(grp) || !metThreshold(grp)
          "
          @click="Msig.submitGroup(app, grp.nonce)"
        />
        <v-btn
          text="Delete Group"
          color="error"
          @click="Msig.deleteGroup(appId, grp, signingAddr!)"
        />
      </v-card-actions>
    </div>
  </template>
  <v-dialog v-model="showAddSig" max-width="440" persistent>
    <v-card>
      <v-card-title class="d-flex">
        Add Your Signature
        <v-spacer />
        <v-icon :icon="mdiClose" @click="closeAddSig()" />
      </v-card-title>
      <v-card-text class="d-flex flex-column ga-3">
        <v-btn
          block
          variant="outlined"
          text="Sign Transaction Group"
          @click="gatherSigs()"
          :disabled="!!signedTxns.length"
          :append-icon="!!signedTxns.length ? mdiCheck : ''"
        />
        <v-btn
          block
          variant="flat"
          text="Send Signatures to Contract"
          @click="sendSigs()"
          :disabled="!signedTxns.length"
        />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import router from "@/router";
import Algo from "@/services/Algo";
import Msig from "@/services/Msig";
import type { Arc55App, MsigGroup, WalletTransaction } from "@/types";
import { luteSignerWT } from "@/utils/signers";
import { mdiCheck, mdiClose, mdiDelete, mdiInformationOutline } from "@mdi/js";
import algosdk from "algosdk";

const props = defineProps<{ appId: bigint }>();
const app = ref<Arc55App>();
const signingAddr = ref<string>();
const signGroup = ref<MsigGroup>();
const store = useAppStore();
const submitted = ref<bigint[]>([]);
const loading = ref(false);
const showAddSig = ref(false);

onMounted(async () => {
  loading.value = true;
  try {
    app.value = await Msig.loadApp(props.appId);
    if (!app.value) throw Error("Application not found");
    signingAddr.value = store.msigSigner(app.value);
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
    router.replace("/");
  }
  await startWatching();
  await checkSubmitted();
  loading.value = false;
});

watch(
  () => store.refresh,
  async () => {
    app.value = await Msig.loadApp(props.appId);
    if (!app.value) {
      router.replace("/");
    }
  }
);

const signingAccts = computed(() =>
  store.signAcctInfo.filter(
    (ai) =>
      ai.addr === app.value?.arc55_admin || app.value?.addrs.includes(ai.addr)
  )
);

const msigAddr = computed(
  () => store.accounts.find((a) => a.appId == props.appId)?.addr
);

function status(grp: MsigGroup) {
  return isSubmitted(grp.nonce)
    ? "Submitted"
    : isExpired(grp)
      ? "Expired"
      : metThreshold(grp)
        ? "Ready"
        : isSigned(grp)
          ? "Signed"
          : "Pending";
}

const isAdmin = computed(() => {
  if (!app.value) return undefined;
  return signingAddr.value === app.value.arc55_admin;
});

// Every nonce up to the app's has a group, but a deleted group's boxes are
// gone: no txns, and maybe a member's signatures left behind.
const shownGroups = computed(() =>
  app.value?.groups.toReversed().filter((g) => g.txns.length || g.sigs.length)
);

/** A group with no txns left has nothing to sign or submit. */
function isExpired(grp: MsigGroup) {
  const txn = grp.txns.find(Boolean);
  return !txn || txn.lastValid < currentRound.value;
}

function isSigned(grp: MsigGroup) {
  return grp.sigs.some((s) => s.addr === signingAddr.value);
}

function metThreshold(grp: MsigGroup) {
  if (!app.value) return false;
  return (
    app.value.addrs.filter((a) => grp.sigs.some((s) => s.addr === a)).length >=
    app.value?.arc55_threshold
  );
}

function isSubmitted(nonce: bigint) {
  return submitted.value.some((s) => nonce === s);
}

async function checkSubmitted() {
  app.value?.groups
    ?.filter(
      (grp) => grp.txns.length && !submitted.value.some((s) => grp.nonce === s)
    )
    .forEach(async (grp: MsigGroup) => {
      try {
        const txn = grp.txns.find(Boolean);
        if (!txn) return;
        if (txn.lastValid < currentRound.value) {
          if (!Algo.indexer) throw Error("Indexer not configured");
          await Algo.indexer.lookupTransactionByID(txn.txID()).do();
        } else {
          await Algo.algod.pendingTransactionInformation(txn.txID()).do();
        }
        // if not 404, txn found
        submitted.value.push(grp.nonce);
      } catch (err: any) {
        if (err.status != 404) {
          console.error(err);
          store.setSnackbar(err.message, "error");
        }
      }
    });
}

let tracking = true;
const currentRound = ref();

onBeforeRouteLeave(() => {
  tracking = false;
});

async function checkForAppChanges(round: number, appId: bigint) {
  const { block } = await Algo.algod.block(round).do();
  if (block.payset === undefined) return;
  await Promise.all(
    block.payset.map(async (txn) => {
      if (txn.signedTxn.signedTxn.txn.sender.toString() == msigAddr.value) {
        await checkSubmitted();
      }
      if (txn.signedTxn.signedTxn.txn.applicationCall?.appIndex == appId) {
        store.refresh++;
      }
    })
  );
}

async function watchBlock() {
  if (!tracking) return;
  try {
    const status = await Algo.algod.statusAfterBlock(currentRound.value).do();
    currentRound.value = status.lastRound;
    checkForAppChanges(currentRound.value, props.appId);
    watchBlock();
  } catch {
    tracking = false;
  }
}

async function startWatching() {
  const status = await Algo.algod.status().do();
  currentRound.value = status.lastRound;
  tracking = true;
  watchBlock();
}

const signedTxns = ref<Uint8Array[]>([]);

function closeAddSig() {
  showAddSig.value = false;
  signedTxns.value = [];
  store.snackbar.display = false;
}

async function gatherSigs() {
  try {
    if (!app.value) throw Error("Invalid App");
    const grp = app.value.groups[Number(signGroup.value?.nonce) - 1]!;
    const walletTxns: WalletTransaction[] = grp.txns.map((txn, idx) => {
      const wt: WalletTransaction = {
        txn: txn.toByte().toBase64(),
        authAddr: signingAddr.value,
      };
      const stxn = grp.stxns[idx];
      if (!stxn) return wt;
      wt.stxn = stxn;
      wt.signers = [];
      return wt;
    });
    signedTxns.value = await luteSignerWT(walletTxns);
    store.setSnackbar("Awaiting Next Step...", "info", -1);
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
  store.overlay = false;
}

async function sendSigs() {
  try {
    if (!app.value) throw Error("Invalid App");
    const appClient = Msig.getAppClient(app.value.info.id, signingAddr.value!);
    const grp = app.value!.groups[Number(signGroup.value?.nonce) - 1]!;
    const sigs = signedTxns.value.map(
      (t) => algosdk.decodeSignedTransaction(t).sig || new Uint8Array(64)
    ) as Uint8Array[];
    const suggestedParams = await Algo.algod.getTransactionParams().do();
    const mbrIncrease = 2500 + 400 * (42 + 64 * grp.txns.length);
    const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: signingAddr.value!,
      suggestedParams,
      receiver: app.value!.acct.address,
      amount: mbrIncrease,
    });
    await appClient.send.arc55SetSignatures({
      args: {
        costs: mbrPayment,
        transactionGroup: grp.nonce,
        signatures: sigs,
      },
      populateAppCallResources: true,
    });
    closeAddSig();
    store.setSnackbar("Signature(s) Added", "success");
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
  store.overlay = false;
}
</script>

<style scoped>
.msig-app {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 16px;
  padding: 18px;
  border-bottom: 1px solid rgb(var(--v-theme-border));
}
@media (max-width: 599.98px) {
  .msig-app {
    grid-template-columns: 1fr;
  }
}
.msig-app .v-input {
  margin-top: 0;
}
.msig-title {
  font-size: 14px;
  font-weight: 500;
}
.msig-label {
  font-size: 12px;
  color: rgb(var(--v-theme-text-muted));
}
.msig-member {
  font: 11.5px var(--font-mono);
  color: rgb(var(--v-theme-text-body));
  word-break: break-all;
}
.msig-intro {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 18px 6px;
}
.msig-group {
  margin: 8px 18px 18px;
  border: 1px solid rgb(var(--v-theme-border-strong));
  border-radius: 10px;
  overflow: hidden;
}
.msig-group-header {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  font-size: 13.5px;
  border-bottom: 1px solid rgb(var(--v-theme-border));
}
.msig-group-header .text-muted {
  font-size: 12.5px;
}
.msig-txns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
  padding: 12px 14px;
}
.msig-box {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: 8px;
  background: rgb(var(--v-theme-background));
}
.msig-box pre {
  font-size: 11px;
  max-height: 240px;
}
.msig-box-label {
  margin-bottom: 6px;
  font-size: 12.5px;
  color: rgb(var(--v-theme-text-muted));
}
.msig-sigs {
  margin: 0 14px 12px;
  text-align: center;
}
.msig-group .card-footer {
  padding: 12px 14px;
}
.min-w-0 {
  min-width: 0;
}
</style>
