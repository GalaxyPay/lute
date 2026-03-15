<template>
  <v-row class="mb-3">
    <v-col>
      <v-row class="text-info" no-gutters>
        <v-col>
          Transaction {{ idx + 1 }} {{ toSign ? "" : "(Not to be Signed)" }}:
        </v-col>
      </v-row>
      <v-row class="text-h6" no-gutters>
        <v-col>
          {{ ftxn.type }}
          <v-chip
            size="x-small"
            @click="viewRaw = !viewRaw"
            :text="viewRaw ? 'View Summary' : 'View Raw'"
          />
        </v-col>
      </v-row>
      <v-row v-show="viewRaw">
        <pre style="overflow: auto; font-size: 0.75em">{{
          algosdk.encodeJSON(txn, { space: 2 })
        }}</pre>
      </v-row>
      <v-row v-show="!viewRaw" no-gutters>
        <v-col :cols> From: {{ ftxn.from }} </v-col>
        <v-col :cols v-if="ftxn.to"> To: {{ ftxn.to }} </v-col>
        <v-col :cols v-if="ftxn.appId"> App ID: {{ ftxn.appId }} </v-col>
        <v-col :cols v-if="ftxn.asset"> Asset: {{ ftxn.asset }} </v-col>
        <v-col :cols v-if="ftxn.amount"> Amount: {{ ftxn.amount }} </v-col>
        <v-col :cols :class="txn.fee > 1000 && toSign ? 'text-warning' : ''">
          Fee: {{ ftxn.fee }}
        </v-col>
        <v-col :cols v-if="ftxn.voteFirst">
          First Vote Round: {{ ftxn.voteFirst }}
        </v-col>
        <v-col :cols v-if="ftxn.voteLast">
          Last Vote Round: {{ ftxn.voteLast }}
        </v-col>
        <v-col :cols v-if="ftxn.voteKeyDilution">
          Key Dilution: {{ ftxn.voteKeyDilution }}
        </v-col>
        <v-col v-if="ftxn.selectionKey">
          Selection Key: {{ ftxn.selectionKey }}
        </v-col>
        <v-col v-if="ftxn.voteKey"> Voting Key: {{ ftxn.voteKey }} </v-col>
        <v-col v-if="ftxn.stateProofKey">
          State Proof Key: {{ ftxn.stateProofKey }}
        </v-col>
        <v-col :cols v-if="ftxn.rekeyTo" :class="toSign ? 'text-error' : ''">
          RekeyTo: {{ ftxn.rekeyTo }}
        </v-col>
        <v-col
          :cols
          v-if="ftxn.closeRemainderTo"
          :class="toSign ? 'text-error' : ''"
        >
          CloseRemainderTo: {{ ftxn.closeRemainderTo }}
        </v-col>
        <v-col :cols v-if="ftxn.note?.length"> Note: {{ ftxn.note }} </v-col>
      </v-row>
    </v-col>
  </v-row>
</template>

<script lang="ts" setup>
import { decodeField, formatAddr, bigintToString } from "@/utils";
import algosdk, { modelsv2 } from "algosdk";
import { useDisplay } from "vuetify";

const props = defineProps({
  txn: { type: algosdk.Transaction, required: true },
  idx: { type: Number, required: true },
  toSign: { type: Boolean, required: true },
  assets: { type: Array<modelsv2.Asset>, required: true },
});

const store = useAppStore();
const { width } = useDisplay();
const cols = computed(() => (width.value < 500 ? "12" : "6"));
const viewRaw = ref(false);

const txnTypes = [
  { title: "Payment", type: "pay" },
  { title: "Asset Transfer", type: "axfer" },
  { title: "Key Registration", type: "keyreg" },
  { title: "Application", type: "appl" },
  { title: "Asset Config", type: "acfg" },
];

const txnAsset = computed(() =>
  props.assets.find((a) => a.index === props.txn.assetTransfer?.assetIndex)
);

const ftxn = computed(() => ({
  type: txnTypes.find((tt) => tt.type === props.txn.type)?.title,
  from: formatAddr(props.txn.sender.toString()),
  to: formatAddr(
    props.txn.payment?.receiver.toString() ||
      props.txn.assetTransfer?.receiver.toString()
  ),
  appId: props.txn.applicationCall?.appIndex,
  asset: txnAsset.value?.params.unitName,
  amount:
    props.txn.payment || props.txn.assetTransfer
      ? bigintToString(
          props.txn.payment?.amount || props.txn.assetTransfer?.amount || 0n,
          txnAsset.value?.params.decimals ?? 6
        )
      : undefined,
  fee: Number(props.txn.fee || 0) / 10 ** 6 + (store.isVoi ? " Voi" : " Algo"),
  voteFirst: props.txn.keyreg?.voteFirst,
  voteLast: props.txn.keyreg?.voteLast,
  voteKeyDilution: props.txn.keyreg?.voteKeyDilution,
  selectionKey: props.txn.keyreg?.selectionKey
    ? Buffer.from(props.txn.keyreg.selectionKey).toString("base64")
    : undefined,
  voteKey: props.txn.keyreg?.voteKey
    ? Buffer.from(props.txn.keyreg.voteKey).toString("base64")
    : undefined,
  stateProofKey: props.txn.keyreg?.stateProofKey
    ? Buffer.from(props.txn.keyreg.stateProofKey).toString("base64")
    : undefined,
  rekeyTo: props.txn.rekeyTo?.toString(),
  closeRemainderTo: formatAddr(
    props.txn.payment?.closeRemainderTo?.toString() ||
      props.txn.assetTransfer?.closeRemainderTo?.toString()
  ),
  note: decodeField(props.txn.note),
}));
</script>
