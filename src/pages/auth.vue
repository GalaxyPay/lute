<template>
  <device-selector v-if="store.device.showSelector" />
  <v-container v-else class="pt-0">
    <v-card :loading="loading" :disabled="loading">
      <template v-if="!loading && luteData?.siwa">
        <v-container>
          <div class="text-h5">
            {{ luteData.stdSignData.domain }} wants you to sign in with your
            Algorand account:
          </div>
          <div style="font-size: 0.79em; font-family: monospace">
            {{ luteData.siwa.account_address }}
          </div>
          <v-chip
            size="x-small"
            @click="viewRaw = !viewRaw"
            :text="viewRaw ? 'View Summary' : 'View Raw'"
          />
          <v-container v-show="viewRaw" class="px-0">
            <pre style="overflow: auto; font-size: 0.75em">{{
              luteData.siwa
            }}</pre>
          </v-container>
          <v-container v-show="!viewRaw" class="px-0">
            <v-row v-if="luteData.siwa.statement">
              <v-col>
                {{ luteData.siwa.statement }}
              </v-col>
            </v-row>
            <v-row>
              <v-col>
                <pre style="overflow: auto; font-size: 0.75em">{{ msg }}</pre>
              </v-col>
            </v-row>
          </v-container>
          <v-row class="text-center">
            <v-col>
              <v-btn text="Sign" @click="passwordCheck()" :disabled="signing" />
            </v-col>
          </v-row>
        </v-container>
      </template>
    </v-card>
  </v-container>
  <password-confirm :visible="showPass" @close="handlePass" />
</template>

<script lang="ts" setup>
import LuteData from "@/classes/LuteData";
import LuteDataOld from "@/classes/LuteData.old";
import {
  resetSidePanel,
  sendOrPostMessage,
  signDataUnsafe,
  whenLoaded,
} from "@/utils";

const store = useAppStore();
const loading = ref(true);
const signing = ref(false);
const showPass = ref(false);
const viewRaw = ref(false);
const luteData = ref<LuteData>();

let referrer: string;
let tabId: number | undefined;
let msg: string;

onMounted(() => whenLoaded(ready));

async function ready() {
  store.networkName = "MainNet";
  const message = { action: "ready", debug: store.debug };
  if (store.isWeb) {
    referrer = document.referrer.split("/")[2];
    if (!referrer) throw Error("Invalid Referrer");
    window.opener.postMessage(message, "*");
    window.addEventListener("message", messageHandler);
  } else {
    browser.runtime.connect({ name: "luteSidepanel" });
    const params = new URLSearchParams(document.location.search);
    const name = params.get("name");
    if (!name) throw Error("Invalid Referrer");
    else referrer = name;
    tabId = Number(params.get("tabId"));
    browser.runtime.onMessage.addListener(messageHandler);
    try {
      await browser.tabs.sendMessage(tabId, message);
    } catch {
      await resetSidePanel();
    }
  }
}

async function messageHandler(event: any) {
  if (event.data.action === "data") {
    store.signingData = true;
    if (event.data.data) {
      luteData.value = new LuteDataOld(
        event.data.data,
        event.data.metadata,
        referrer,
        tabId
      );
    } else {
      const stdSignData = !store.isWeb
        ? signDataUnsafe(event.data.stdSignData)
        : event.data.stdSignData;
      luteData.value = new LuteData(
        stdSignData,
        event.data.metadata,
        referrer,
        tabId
      );
    }
    if (store.debug) {
      console.log("[Lute Debug]", {
        signData: luteData.value.stdSignData,
        metadata: luteData.value.metadata,
      });
    }
    await luteData.value.validate();
    luteData.value.setNetwork();
    msg = luteData.value.getMessage();
    loading.value = false;
  }
}

async function passwordCheck() {
  try {
    signing.value = true;
    const acct = store.accounts.find(
      (a) => a.addr === luteData.value!.siwa!.account_address
    );
    if (acct?.seedId && acct.slot != null) {
      const seedData = store.seeds.find((s) => s.id === acct.seedId);
      if (!seedData) throw Error("Invalid Seed");
      if (seedData.data) showPass.value = true;
    }
    if (!showPass.value) {
      await luteData.value!.sign();
    }
  } catch (err: any) {
    luteData.value?.handleError(err);
  }
  signing.value = false;
}

async function handlePass(success: boolean, pass: string) {
  showPass.value = false;
  if (!success) {
    store.setSnackbar("Incorrect Password", "error");
  } else {
    luteData.value!.sign(pass);
  }
}

window.onbeforeunload = () => {
  const message = { action: "close", debug: store.debug };
  sendOrPostMessage(message, tabId);
};
</script>
