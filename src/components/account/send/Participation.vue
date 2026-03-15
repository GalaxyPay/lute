<template>
  <v-form ref="form" @submit.prevent="submit()">
    <v-container class="px-0 pt-6">
      <v-row>
        <v-col>
          {{ `Your account is currently ${acct.info?.status}.` }}
          <v-btn
            v-if="acct.info?.status === 'Online'"
            text="Go Offline"
            size="small"
            color="error"
            @click="offline()"
          />
          <v-container v-if="acct.info?.status === 'Online' && expireMs">
            <v-row class="text-caption">
              Expire Round:
              {{ acct.info?.participation?.voteLastValid }}
            </v-row>
            <v-row class="text-caption">
              Expire Date/Time: {{ expireDt }}
            </v-row>
          </v-container>
        </v-col>
      </v-row>
      <v-row>
        <v-col cols="12" class="pt-0">
          <v-checkbox
            v-model="incentiveEligible"
            label="Make Incentive Eligible"
            density="comfortable"
            :hint="incentiveHint"
            persistent-hint
            :disabled="acct.info?.incentiveEligible"
          />
        </v-col>
        <v-col cols="12" sm="4">
          <v-text-field
            v-model.number="keyreg.voteFirst"
            label="First Round"
            :rules="[required]"
            @paste="handlePaste"
          />
        </v-col>
        <v-col cols="12" sm="4">
          <v-text-field
            v-model.number="keyreg.voteLast"
            label="Last Round"
            :rules="[required]"
            @paste="handlePaste"
          />
        </v-col>
        <v-col cols="12" sm="4">
          <v-text-field
            v-model.number="keyreg.voteKeyDilution"
            label="Key Dilution"
            :rules="[required]"
            @paste="handlePaste"
          />
        </v-col>
        <v-col cols="12" sm="6">
          <v-text-field
            v-model="keyreg.selectionKey"
            label="Selection Key"
            :rules="[required]"
            @paste="handlePaste"
          />
        </v-col>
        <v-col cols="12" sm="6">
          <v-text-field
            v-model="keyreg.voteKey"
            label="Voting Key"
            :rules="[required]"
            @paste="handlePaste"
          />
        </v-col>
        <v-col cols="12">
          <v-text-field
            v-model="keyreg.stateProofKey"
            label="State Proof Key"
            :rules="[required]"
            @paste="handlePaste"
          />
        </v-col>
      </v-row>
    </v-container>
    <v-card-actions>
      <span>
        <v-icon :icon="mdiInformationOutline" />
        <v-tooltip
          activator="parent"
          location="top end"
          text="ProTip: Paste entire output from 'goal account partkeyinfo' into any field"
        />
      </span>
      <v-spacer />
      <v-btn text="Send" type="submit" />
    </v-card-actions>
  </v-form>
</template>

<script lang="ts" setup>
import Algo from "@/services/Algo";
import type { AccountInfo, KeyRegTxn } from "@/types";
import { send } from "@/utils";
import { luteSigner } from "@/utils/signers";
import { mdiInformationOutline } from "@mdi/js";
import algosdk from "algosdk";

const props = defineProps<{ acct: AccountInfo }>();

const store = useAppStore();
const form = ref();
const required = (v: any) => !!v || v === 0 || "Required";
const keyreg = ref({} as KeyRegTxn);
const incentiveEligible = ref(false);
const incentiveHint = computed(() =>
  props.acct?.info?.incentiveEligible
    ? "Already Eligible"
    : incentiveEligible.value
    ? "This will increase the fee of this transaction to 2 Algo"
    : ""
);

const lastRound = ref<bigint>();
const avgBlockTime = ref<number>();
const expireMs = computed(() => {
  if (
    !props.acct?.info?.participation ||
    !avgBlockTime.value ||
    !lastRound.value
  )
    return 0;
  return (
    Number(props.acct.info?.participation.voteLastValid - lastRound.value) *
    avgBlockTime.value
  );
});
const expireDt = computed(() => {
  if (props.acct?.info?.status == "Online" && expireMs.value) {
    return `${formatDate(new Date().getTime() + expireMs.value)} (${Math.round(
      expireMs.value / 86400000
    )} days)`;
  }
  return undefined;
});

function formatDate(e: number) {
  const d = new Date(e);
  let h = d.getHours();
  const ap = h >= 12 ? "pm" : "am";
  h = ((h + 11) % 12) + 1;
  return (
    [
      d.getFullYear(),
      (d.getMonth() + 1).toString().padStart(2, "0"),
      d.getDate().toString().padStart(2, "0"),
    ].join("-") +
    " " +
    [h.toString(), d.getMinutes().toString().padStart(2, "0")].join(":") +
    " " +
    ap
  );
}

function handlePaste(e: any) {
  const clip = e.clipboardData.getData("text/plain");
  if (clip.includes("\n")) {
    try {
      e.preventDefault();
      keyreg.value.voteFirst = Number(
        clip.match(/(?<=^First\sround:\s*)\d*$/gm)![0]
      );
      keyreg.value.voteLast = Number(
        clip.match(/(?<=^Last\sround:\s*)\d*$/gm)![0]
      );
      keyreg.value.voteKeyDilution = Number(
        clip.match(/(?<=^Key\sdilution:\s*)\d*$/gm)![0]
      );
      keyreg.value.selectionKey = clip.match(
        /(?<=^Selection\skey:\s*)[^\s]*$/gm
      )![0];
      keyreg.value.voteKey = clip.match(/(?<=^Voting\skey:\s*)[^\s]*$/gm)![0];
      keyreg.value.stateProofKey = clip.match(
        /(?<=^State\sproof\skey:\s*)[^\s]*$/gm
      )![0];
    } catch {
      store.setSnackbar("Failed to parse", "error");
    }
  }
}

async function calcAvgBlockTime() {
  const status = await Algo.algod.status().do();
  lastRound.value = status.lastRound;
  const currentRound = await Algo.algod.block(lastRound.value).do();
  const less100 = lastRound.value - 100n;
  if (less100 > 0) {
    const oldRound = await Algo.algod.block(lastRound.value - 100n).do();
    avgBlockTime.value =
      Math.floor(
        Number(
          currentRound.block.header.timestamp - oldRound.block.header.timestamp
        )
      ) * 10;
  } else {
    avgBlockTime.value = 2800;
  }
}

async function offline() {
  try {
    const suggestedParams = await Algo.algod.getTransactionParams().do();
    const txn = algosdk.makeKeyRegistrationTxnWithSuggestedParamsFromObject({
      sender: props.acct.addr,
      suggestedParams,
      nonParticipation: false,
    });
    const stxn = await luteSigner([txn]);
    await send(stxn);
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
}

function b64ToUint8(b64: string | undefined) {
  return b64 ? Buffer.from(b64, "base64") : undefined;
}

async function submit() {
  try {
    const { valid } = await form.value.validate();
    if (!valid) return;

    const suggestedParams = await Algo.algod.getTransactionParams().do();
    keyreg.value.sender = props.acct.addr;
    if (incentiveEligible.value) {
      suggestedParams.flatFee = true;
      suggestedParams.fee = 2n * 10n ** 6n;
    }
    const obj = {
      ...(keyreg.value as any),
      voteKey: b64ToUint8(keyreg.value.voteKey),
      selectionKey: b64ToUint8(keyreg.value.selectionKey),
      stateProofKey: b64ToUint8(keyreg.value.stateProofKey),
      suggestedParams,
    };
    const txn =
      algosdk.makeKeyRegistrationTxnWithSuggestedParamsFromObject(obj);
    const stxn = await luteSigner([txn]);
    await send(stxn);
    form.value?.reset();
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
}

onMounted(async () => {
  await calcAvgBlockTime();
});
</script>
