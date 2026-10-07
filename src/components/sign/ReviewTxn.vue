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
        <v-col
          :cols
          v-if="ftxn.clawbackFrom"
          :class="toSign ? 'text-error' : ''"
        >
          Clawback From: {{ ftxn.clawbackFrom }}
        </v-col>
        <v-col :cols v-if="ftxn.appId"> App ID: {{ ftxn.appId }} </v-col>
        <v-col :cols v-if="ftxn.asset"> Asset: {{ ftxn.asset }} </v-col>
        <v-col :cols v-if="ftxn.amount"> Amount: {{ ftxn.amount }} </v-col>
        <v-col :cols :class="txn.fee > feeWarn && toSign ? 'text-warning' : ''">
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
import { formatTxn } from "@/utils/formatTxn";
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

const isFalcon25 = store.acctInfo.find(
  (ai) => ai.addr === props.txn.sender.toString()
)?.isFalcon25;
const feeWarn = isFalcon25 ? 3000 : 1000;

const txnAsset = computed(() =>
  props.assets.find((a) => a.index === props.txn.assetTransfer?.assetIndex)
);

const ftxn = computed(() =>
  formatTxn(props.txn, txnAsset.value, store.isVoi ? "Voi" : "Algo")
);
</script>
