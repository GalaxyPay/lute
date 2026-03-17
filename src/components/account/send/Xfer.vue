<template>
  <v-form
    ref="form"
    @submit.prevent="submit()"
    validate-on="blur"
    autocomplete="off"
  >
    <v-container class="px-0 pt-6">
      <template v-if="!rekey">
        <v-row>
          <v-col cols="12" sm="6">
            <v-autocomplete
              v-model="asset"
              :items="assets"
              :item-props="assetProps"
              label="Asset"
              :rules="[required]"
              :hint="itemBalance"
              persistent-hint
              variant="outlined"
              class="pb-3"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="amount"
              type="number"
              :label="amountLabel"
              :rules="[required]"
            >
              <template #append-inner>
                <v-btn text="Max" @click="maxAmount()" />
              </template>
            </v-text-field>
          </v-col>
        </v-row>

        <v-combobox
          v-model="to"
          :items="toAuto"
          :item-props="toProps"
          :return-object="false"
          :label="`To Address${ns}`"
          spellcheck="false"
          @keyup="lookupNs(to)"
          :rules="[required, validAddress]"
          class="pb-2"
        />
        <v-checkbox-btn
          v-model="showNote"
          label="Note"
          @update:model-value="note = undefined"
        />
        <v-textarea v-if="showNote" v-model="note" rows="2" label="Note" />
        <v-checkbox-btn
          v-model="showCloseRemainderTo"
          @update:model-value="closeRemainderTo = undefined"
        >
          <template #label>
            Close Remainder To
            <span>
              <v-icon size="x-small" class="ml-2" :icon="mdiInformation" />
              <v-tooltip
                activator="parent"
                location="bottom"
                :text="closeRemainderToTip"
              />
            </span>
          </template>
        </v-checkbox-btn>
        <v-text-field
          v-if="showCloseRemainderTo"
          v-model="closeRemainderTo"
          label="Close Remainder To"
          :rules="[validAddress]"
        />
        <v-checkbox-btn
          v-model="showRevocationTarget"
          @update:model-value="assetSender = undefined"
        >
          <template #label>
            Revocation Target
            <span>
              <v-icon size="x-small" class="ml-2" :icon="mdiInformation" />
              <v-tooltip
                activator="parent"
                location="bottom"
                text="Specify this field to indicate a clawback transaction. This is
                  the address from which the funds will be withdrawn."
              />
            </span>
          </template>
        </v-checkbox-btn>
        <v-text-field
          v-if="showRevocationTarget"
          v-model="assetSender"
          label="Revocation Target"
          :rules="[validAddress]"
        />
      </template>
      <v-combobox
        v-if="rekey"
        v-model="rekeyTo"
        :items="rekeyToAuto"
        :return-object="false"
        :label="`Rekey To Address${ns}`"
        spellcheck="false"
        @keyup="lookupNs(rekeyTo)"
        :rules="[required, validAddress]"
        class="pb-2"
      />
    </v-container>
    <v-card-actions>
      <v-spacer />
      <v-btn text="Send" type="submit" />
    </v-card-actions>
  </v-form>
  <v-dialog v-model="showInboxWarning" max-width="600" persistent>
    <v-card
      title="WARNING"
      text="The recipient is not opted-in to the asset, so the asset will be sent using the Inbox Router.
        Custodial accounts, like those on an exchange, may not be able to claim the asset."
    >
      <v-card-actions>
        <v-btn text="Cancel" color="grey" @click="showInboxWarning = false" />
        <v-btn text="Use Inbox" @click="arc59SendAsset()" />
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { Arc59Factory } from "@/clients/Arc59Client";
import Algo from "@/services/Algo";
import NameService from "@/services/NameService";
import type { AccountInfo } from "@/types";
import {
  bigintToString,
  getAssetInfo,
  send,
  stringToBigint,
  whenLoaded,
} from "@/utils";
import { luteSigner } from "@/utils/signers";
import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import { mdiInformation } from "@mdi/js";
import algosdk, { modelsv2 } from "algosdk";

const props = defineProps<{ acct: AccountInfo; rekey: boolean }>();

const store = useAppStore();
const form = ref();
const required = (v: any) => !!v || v === 0 || "Required";
const validAddress = (v: string) =>
  algosdk.isValidAddress(v) || "Invalid Address";
const ns = computed(() =>
  store.network.nfdUrl ? " or NFD" : store.network.envoiUrl ? " or EnVoi" : ""
);
const to = ref();
const amount = ref();
const note = ref();
const showNote = ref(false);
const rekeyTo = ref();
const closeRemainderTo = ref();
const showCloseRemainderTo = ref(false);
const assetSender = ref();
const showRevocationTarget = ref(false);
const addrs = computed(() =>
  store.acctInfo.map((a) => ({
    title: a.name || a.ns?.name || a.addr,
    value: a.addr,
  }))
);
const toAuto = ref();
const rekeyToAuto = ref();
const assets = ref<modelsv2.Asset[]>([store.nativeAsset]);
const asset = ref<modelsv2.Asset>(store.nativeAsset);
const showInboxWarning = ref(false);

const amountLabel = computed(() => {
  return `Amount (${asset.value.params.unitName || asset.value.params.name})`;
});
const closeRemainderToTip = computed(() =>
  asset.value.index === 0n
    ? `Specify this field to close the sending account, and transfer all
      remaining funds, after the fee and amount are paid, to this address.`
    : `Specify this field to remove the asset holding from the sending
      account (opt-out), and transfer remainder of asset, after amount is
      paid, to this address.`
);

watch(
  () => props.rekey,
  () => {
    refresh();
  },
  { immediate: true }
);

function toProps(item: any) {
  return {
    subtitle: !algosdk.isValidAddress(item?.title) ? item?.value : undefined,
  };
}

function assetProps(item: modelsv2.Asset) {
  return {
    title: item.params.name,
    subtitle: item.index ? Number(item.index) : undefined,
  };
}

const itemBalance = computed(() => {
  let val = "Balance: ";
  if (!asset.value?.index) {
    const amt = props.acct.info?.amount || 0n;
    val += bigintToString(amt, 6, false);
  } else {
    val += `${assetBalance()}
  ${asset.value.params.unitName}`;
  }
  return val;
});

function assetBalance(plain = false) {
  const num = props.acct.info?.assets?.find(
    (a) => a.assetId === asset.value?.index
  )?.amount;
  const decimals = asset.value?.params.decimals;
  return num != null && decimals != null
    ? bigintToString(num, decimals, plain)
    : "-";
}

let nsTimeout: number;
async function lookupNs(q: string) {
  window.clearTimeout(nsTimeout);
  nsTimeout = window.setTimeout(async () => {
    const nsLookups = q ? await NameService.search(q) : [];
    toAuto.value = addrs.value.concat(nsLookups);
    rekeyToAuto.value = addrs.value.concat(nsLookups);
  }, 500);
}

function maxAmount() {
  if (!asset.value?.index) {
    const bal = props.acct.info?.amount;
    if (bal && bal > 101000)
      amount.value = bigintToString(bal - 101000n, 6, true);
    else amount.value = 0;
  } else {
    amount.value = assetBalance(true);
  }
}

async function submit() {
  try {
    const { valid } = await form.value.validate();
    if (!valid) return;

    const enc = new TextEncoder();
    const suggestedParams = await Algo.algod.getTransactionParams().do();
    const note64 = note.value ? enc.encode(note.value) : undefined;
    let txn;
    if (asset.value.index) {
      txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        assetIndex: asset.value.index,
        receiver: to.value,
        sender: props.acct.addr,
        note: note64,
        suggestedParams,
        amount: stringToBigint(amount.value, asset.value.params.decimals),
        closeRemainderTo: closeRemainderTo.value,
        assetSender: assetSender.value,
      });
      const toInfo = await Algo.algod.accountInformation(to.value).do();
      const receiverOptedIn = toInfo.assets?.some(
        (a) => a.assetId === asset.value!.index
      );
      if (!receiverOptedIn && store.network.inboxRouter) {
        showInboxWarning.value = true;
        return;
      }
    } else {
      if (props.rekey) {
        txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
          receiver: props.acct.addr,
          sender: props.acct.addr,
          suggestedParams,
          amount: 0,
          rekeyTo: rekeyTo.value,
        });
      } else {
        txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
          receiver: to.value,
          sender: props.acct.addr,
          note: note64,
          suggestedParams,
          amount: stringToBigint(amount.value, 6),
          closeRemainderTo: closeRemainderTo.value,
        });
      }
    }
    if (!txn) throw Error("Invalid Transaction");
    const stxn = await luteSigner([txn]);
    await send(stxn);
    form.value?.reset();
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
}

async function arc59SendAsset() {
  try {
    showInboxWarning.value = false;
    if (!asset.value) throw Error("Invalid Asset");
    if (!store.network.inboxRouter) throw Error("Invalid Router");
    const suggestedParams = await Algo.algod.getTransactionParams().do();
    const algorand = AlgorandClient.fromClients({ algod: Algo.algod });
    algorand.setDefaultSigner(luteSigner);
    algorand.setDefaultValidityWindow(1000);
    const factory = new Arc59Factory({
      defaultSender: props.acct.addr,
      algorand,
    });
    const appClient = factory.getAppClientById({
      appId: BigInt(store.network.inboxRouter),
    });
    const simParams = {
      allowEmptySignatures: true,
      allowUnnamedResources: true,
      fixSigners: true,
    };
    const sendAssetInfo = (
      await appClient
        .newGroup()
        .arc59GetSendAssetInfo({
          args: { asset: asset.value.index, receiver: to.value },
          signer: algosdk.makeEmptyTransactionSigner(),
        })
        .simulate(simParams)
    ).returns[0];
    if (!sendAssetInfo) throw Error("Simulate Failed");
    const [
      itxns,
      mbr,
      routerOptedIn,
      _receiverOptedIn,
      receiverAlgoNeededForClaim,
    ] = sendAssetInfo;
    const composer = appClient.newGroup();
    const appAddr = appClient.appClient.appAddress;
    const enc = new TextEncoder();
    const note64 = note.value ? enc.encode(note.value) : undefined;
    const axfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      assetIndex: asset.value.index,
      receiver: appAddr,
      sender: props.acct.addr,
      note: note64,
      suggestedParams,
      amount: stringToBigint(amount.value, asset.value.params.decimals),
      closeRemainderTo: closeRemainderTo.value,
      assetSender: assetSender.value,
    });
    // If the MBR is non-zero, send the MBR to the router
    if (mbr || receiverAlgoNeededForClaim) {
      const mbrPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        receiver: appAddr,
        sender: props.acct.addr,
        suggestedParams,
        amount: mbr + receiverAlgoNeededForClaim,
      });
      composer.addTransaction(mbrPayment, luteSigner);
    }
    // If the router is not opted in, add a call to arc59OptRouterIn to do so
    if (!routerOptedIn)
      composer.arc59OptRouterIn({ args: { asa: asset.value.index } });
    // An extra itxn is if we are also sending ALGO for the receiver claim
    const totalItxns = itxns + (receiverAlgoNeededForClaim === 0n ? 0n : 1n);
    const fee = Number(suggestedParams.minFee * (totalItxns + 1n)).microAlgos();
    const boxReferences = [algosdk.Address.fromString(to.value).publicKey];
    const inboxAddress = (
      await appClient
        .newGroup()
        .arc59GetInbox({
          args: { receiver: to.value },
          signer: algosdk.makeEmptyTransactionSigner(),
        })
        .simulate(simParams)
    ).returns[0];
    const accountReferences = [to.value, inboxAddress];
    const assetReferences = [asset.value.index];
    composer.arc59SendAsset({
      args: {
        axfer,
        receiver: to.value,
        additionalReceiverFunds: receiverAlgoNeededForClaim,
      },
      staticFee: fee,
      boxReferences,
      accountReferences,
      assetReferences,
    });
    await composer.send();
    store.refresh++;
    store.setSnackbar("Success", "success");
    form.value.reset();
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
  store.overlay = false;
}

async function refresh() {
  showNote.value = false;
  showCloseRemainderTo.value = false;
  showRevocationTarget.value = false;
  form.value?.reset();
  assets.value = [store.nativeAsset];
  asset.value = store.nativeAsset;
  toAuto.value = addrs.value;
  rekeyToAuto.value = addrs.value;
  if (!props.acct.info?.assets) return;
  await Promise.all(
    props.acct.info.assets.map(async (a) => {
      if (a.amount > 0) {
        const asset = await getAssetInfo(a.assetId, true);
        if (asset) assets.value.push(asset);
      }
    })
  );
}

watch(
  () => store.refresh,
  () => whenLoaded(refresh),
  { immediate: true }
);
</script>
