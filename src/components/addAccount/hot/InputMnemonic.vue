<template>
  <v-form ref="form" @submit.prevent="importKey()">
    <v-container class="pt-6 px-1 ml-1">
      <v-row>
        <v-col v-for="m in [0, 1]" :key="m" cols="6">
          <v-text-field
            v-for="n in wordIdxArray.filter((n) =>
              m ? n > splitIdx : n <= splitIdx
            )"
            :key="n"
            :id="`mn-${n}`"
            hide-details
            density="compact"
            :type="visible.includes(n) ? 'text' : 'password'"
            autocomplete="one-time-code"
            v-model="mnemonicArray[n]"
            @paste="handlePaste"
            @keydown="handleJumps"
            :rules="[required]"
            class="pb-1"
          >
            <template #prepend>
              {{ n < 9 ? "&nbsp;&nbsp;" + (n + 1) : n + 1 }}.
            </template>
            <template #append-inner>
              <v-icon
                :icon="visible.includes(n) ? mdiEye : mdiEyeOff"
                size="x-small"
                @click="toggleVisible(n)"
              />
            </template>
          </v-text-field>
        </v-col>
      </v-row>
    </v-container>
    <v-card-actions>
      <v-btn
        color="grey"
        text="Show All"
        :append-icon="mdiEye"
        @click="showAll()"
      />
      <v-btn
        color="grey"
        text="Hide All"
        :append-icon="mdiEyeOff"
        @click="visible = []"
      />
      <v-spacer />
      <v-btn :text="buttonText" type="submit" />
    </v-card-actions>
  </v-form>
</template>

<script lang="ts" setup>
import { set } from "@/dbLute";
import type { LuteAccount } from "@/types";
import { deepClone, storeKey } from "@/utils";
import { mdiEye, mdiEyeOff } from "@mdi/js";
import algosdk from "algosdk";

const props = defineProps({
  numberOfWords: { type: Number, required: true },
  buttonText: { type: String, required: true },
});

const splitIdx = Math.round(props.numberOfWords / 2) - 1;
const wordIdxArray = [...Array(props.numberOfWords).keys()];

const store = useAppStore();
const form = ref();
const mnemonicArray = ref<string[]>([]);
const visible = ref<number[]>([]);
const mnemonic = computed(() => mnemonicArray.value.join(" "));
const emit = defineEmits(["close", "convert"]);
const required = (v: string) => !!v || "Required";

function handlePaste(e: any) {
  const inputText = e.clipboardData.getData("text/plain");
  e.preventDefault();
  const inputArray = inputText.split(/[\s\t\r\n,]+/);

  if (inputArray.length === 1) {
    // If it is a single word then update that word placement in the array
    mnemonicArray.value[e.target.id.toString().replace("mn-", "")] = inputText;
  } else if (inputArray.length === props.numberOfWords) {
    // If it is multiple words then verify there are {numberOfWords} and split
    mnemonicArray.value = inputArray;
    const element = document.getElementById(`mn-${props.numberOfWords - 1}`);
    if (element) {
      element.focus();
    }
    return;
  } else {
    // If it is multiple words but they are not {numberOfWords} then warn
    alert(
      `[WARNING] - Paste must be a single word or the entire ${props.numberOfWords}-word mnemonic.`
    );
  }
}

function handleJumps(e: any) {
  const key = (e as KeyboardEvent).key;
  const separators = [" ", ",", "."];

  if (separators.includes(key)) {
    e.preventDefault();
    const currentIndex = +e.target.id.toString().replace("mn-", "");
    if (currentIndex < props.numberOfWords - 1) {
      const element = document.getElementById(`mn-${currentIndex + 1}`);
      if (element) {
        element.focus();
      }
    }
  }
}

function toggleVisible(wordIndex: number) {
  const idx = visible.value.indexOf(wordIndex);
  if (idx > -1) visible.value.splice(idx, 1);
  else visible.value.push(wordIndex);
}

function showAll() {
  visible.value = Array.from(Array(props.numberOfWords).keys());
}

async function importKey() {
  try {
    const { valid } = await form.value.validate();
    if (!valid) return;
    if (props.numberOfWords === 25) {
      const acct = algosdk.mnemonicToSecretKey(mnemonic.value);
      await storeKey(acct);
      const accts: LuteAccount[] = deepClone(store.accounts);
      if (accts.some((a) => a.addr === acct.addr.toString())) {
        emit("close");
        throw Error("Account Already Exists In Wallet");
      }
      accts.push({ addr: acct.addr.toString() });
      await set("app", "accounts", accts);
      await store.getCache();
      store.refresh++;
      store.setSnackbar("Account Imported", "success");
      emit("close");
    } else {
      emit("convert", mnemonic.value);
    }
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
}
</script>
