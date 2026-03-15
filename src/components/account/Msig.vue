<template>
  <v-container>
    <v-card color="cardSecondary">
      <v-card-title class="d-flex">
        Application {{ appId }}
        <v-spacer />
        <v-btn
          icon
          size="small"
          :href="store.network.explorer + '/application/' + appId"
          target="_blank"
        >
          <v-icon :icon="mdiInformationOutline" color="grey" size="x-large" />
          <v-tooltip activator="parent" text="App Details" location="bottom" />
        </v-btn>
        <v-btn
          v-if="signingAddr && isAdmin"
          icon
          size="small"
          @click="Msig.destroyApp(app, signingAddr!)"
        >
          <v-icon :icon="mdiDelete" color="error" size="x-large" />
          <v-tooltip activator="parent" text="Destroy App" location="bottom" />
        </v-btn>
      </v-card-title>
      <template v-if="app">
        <v-card-text class="pl-6">
          <div>
            <b>Members:</b>
            <div
              v-for="addr in app.addrs"
              :key="addr"
              class="pl-3"
              style="font-family: monospace"
            >
              {{ addr }}
            </div>
            <div>
              <b>Threshold:</b>
              {{ app.arc55_threshold }} of {{ app.addrs.length }}
            </div>
          </div>
        </v-card-text>
        <v-container>
          <v-row justify="center">
            <v-col cols="12" sm="10" md="4">
              <v-select
                label="Signing Account"
                :items="signingAccts"
                v-model="signingAddr"
                item-value="addr"
              />
            </v-col>
          </v-row>
        </v-container>
      </template>
    </v-card>
  </v-container>
  <v-container v-if="signingAddr">
    <v-card title="Transactions" color="cardSecondary">
      <v-card-text class="pl-6">
        When you connect to dApps with your Lute Multi-Sig address, instead of
        signing the transactions Lute will add them here to be signed by all
        parties.
      </v-card-text>
      <v-container
        v-for="grp in app?.groups.toReversed()"
        v-show="grp.txns.length || grp.sigs?.length"
        :key="Number(grp.nonce)"
        class="pt-0"
      >
        <v-card>
          <v-card-title class="text-subtitle-1 pb-0 d-flex">
            Group {{ grp.nonce }} <v-spacer /> Status:
            {{ status(grp) }}
          </v-card-title>
          <v-container v-show="app?.groups.length" class="py-1">
            <v-row>
              <v-col v-for="(txn, tix) in grp.txns" :key="tix" cols="12" md="6">
                <div class="pa-1">
                  <v-card color="cardSecondary">
                    <v-card-title class="text-subtitle-2 pb-0">
                      Transaction {{ tix + 1 }}
                      {{ grp.stxns[tix] ? "(Not to be Signed)" : "" }}
                    </v-card-title>
                    <v-container class="py-1">
                      <pre style="overflow: auto; font-size: 0.75em">{{
                        algosdk.encodeJSON(txn, { space: 2 })
                      }}</pre>
                    </v-container>
                  </v-card>
                </div>
              </v-col>
            </v-row>
          </v-container>
          <v-container>
            <v-row justify="center">
              <v-col cols="12" md="10" lg="7" xl="5">
                <v-card color="cardSecondary">
                  <v-card-title class="text-subtitle-2 pb-0">
                    Signatures Gathered
                  </v-card-title>
                  <v-container class="text-center py-1">
                    <div
                      v-if="!grp.sigs.length"
                      class="font-italic"
                      style="font-size: 0.9em"
                    >
                      None
                    </div>
                    <div
                      v-for="sig in grp.sigs"
                      :key="sig.addr"
                      style="font-family: monospace; font-size: 0.85em"
                    >
                      {{ sig.addr }}
                    </div>
                  </v-container>
                </v-card>
              </v-col>
            </v-row>
          </v-container>
          <v-card-actions>
            <v-btn
              v-show="!isSigned(grp)"
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
              text="Remove Your Signature"
              @click="Msig.clearSigs(appId, grp.nonce, signingAddr!)"
            />
            <v-spacer />
            <v-btn
              text="Submit"
              :disabled="
                isSubmitted(grp.nonce) || isExpired(grp) || !metThreshold(grp)
              "
              @click="Msig.submitGroup(app, grp.nonce)"
            />
            <v-btn
              text="Delete Group"
              @click="Msig.deleteGroup(appId, grp, signingAddr!)"
            />
          </v-card-actions>
        </v-card>
      </v-container>
    </v-card>
  </v-container>
  <v-dialog v-model="showAddSig" max-width="400" persistent>
    <v-card>
      <v-card-title class="d-flex">
        Add Your Signature
        <v-spacer />
        <v-icon :icon="mdiClose" size="small" @click="closeAddSig()" />
      </v-card-title>
      <v-container>
        <v-row>
          <v-col>
            <v-btn
              block
              text="Sign Transaction Group"
              @click="gatherSigs()"
              :disabled="!!signedTxns.length"
              :append-icon="!!signedTxns.length ? mdiCheck : ''"
            />
          </v-col>
        </v-row>
        <v-row>
          <v-col>
            <v-btn
              block
              text="Send Signatures to Contract"
              @click="sendSigs()"
              :disabled="!signedTxns.length"
            />
          </v-col>
        </v-row>
      </v-container>
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

function isExpired(grp: MsigGroup) {
  return grp.txns[0]!.lastValid < currentRound.value;
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
        const txn: algosdk.Transaction = grp.txns[0]!;
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
        txn: Buffer.from(txn.toByte()).toString("base64"),
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
