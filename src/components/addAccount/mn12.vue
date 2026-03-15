<template>
  <v-container v-if="!mn25">
    <v-radio-group
      v-model="wallet"
      inline
      hide-details
      class="d-flex justify-center"
    >
      <v-radio
        v-for="item in wallets"
        :key="item"
        :label="item"
        :value="item"
      />
    </v-radio-group>
    <input-mnemonic
      :number-of-words="12"
      button-text="Convert"
      @convert="handleConvert"
    />
  </v-container>
  <new-mnemonic v-else :convert="mn25" />
</template>

<script setup lang="ts">
import { HDKey } from "@scure/bip32";
import * as bip39 from "@scure/bip39";
import algosdk from "algosdk";
import slip10 from "micro-key-producer/slip10.js";

const wallets = ["Exodus", "Trust", "Coinomi"];
const wallet = ref("Exodus");
const mn25 = ref();

function handleConvert(mn12: string) {
  const seed = bip39.mnemonicToSeedSync(mn12);
  let hdKey: HDKey | slip10;
  if (wallet.value === "Exodus") {
    const rootKey = HDKey.fromMasterSeed(seed);
    hdKey = rootKey.derive(`m/44'/283'/0'/0/0`);
  } else {
    const rootKey = slip10.fromMasterSeed(seed);
    hdKey = rootKey.derive(`m/44'/283'/0'/0'/0'`);
  }
  if (!hdKey.privateKey) throw Error("Invalid Key");
  mn25.value = algosdk.mnemonicFromSeed(hdKey.privateKey);
}
</script>
