<template>
  <v-card>
    <v-card-title class="d-flex">
      {{ title }}
      <v-spacer />
      <v-icon v-if="finished" :icon="mdiClose" size="small" @click="close()" />
    </v-card-title>
    <template v-if="state === 'confirm'">
      <v-card-text>
        {{ otherName }} wants to send its accounts and keys to this wallet.
        Accounts already here are left as they are, and nothing is removed.
      </v-card-text>
      <v-card-text class="pt-0 text-warning">
        Only continue if you started this sync yourself.
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn text="Decline" @click="answer(false)" />
        <v-btn text="Add Accounts" color="primary" @click="answer(true)" />
      </v-card-actions>
    </template>
    <template v-else-if="result">
      <sync-result :summary="result.summary" :skipped="result.skipped" />
      <v-card-actions>
        <v-spacer />
        <v-btn text="Close" @click="close()" />
      </v-card-actions>
    </template>
    <template v-else-if="error">
      <v-card-text class="text-error">{{ error }}</v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn text="Close" @click="close()" />
      </v-card-actions>
    </template>
    <template v-else>
      <v-card-text class="d-flex align-center">
        <v-progress-circular indeterminate size="20" width="2" class="mr-3" />
        {{ status }}
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn text="Cancel" @click="cancel()" />
      </v-card-actions>
    </template>
  </v-card>
  <keystore-unlock ref="unlocker" />
</template>

<script lang="ts" setup>
import { syncWebOrigin } from "@/ext/syncOrigins";
import {
  type ReceiverState,
  runReceiver,
  runSender,
  type SenderState,
  type SyncTransport,
} from "@/services/SyncSession";
import {
  extensionSenderTransport,
  receiverTransport,
  webTransport,
} from "@/services/syncTransports";
import type { Skipped, WalletSide } from "@/services/Transfer";
import type { MasterKey, Unlocker } from "@/types";
import { mdiClose } from "@mdi/js";

const props = defineProps<{
  side: WalletSide;
  role: "send" | "receive";
  // Sending: the master key, unlocked by the caller before this opens, so
  // its password prompt is not competing with this dialog for focus.
  mk?: MasterKey;
  // Receiving on web: the one-time token from the extension's link.
  token?: string;
  // Receiving in the extension: the lute.app tab that started the sync.
  tabId?: number;
}>();
// `close`: the user closed it. `done`: a receiver finished or declined and
// its popup window can go away; the sender shows the result.
const emit = defineEmits(["close", "done"]);

const store = useAppStore();
const unlocker = ref<Unlocker>();
const state = ref<SenderState | ReceiverState>("connecting");
const result = ref<{ summary: string; skipped: Skipped[] }>();
const error = ref<string>();
const finished = computed(() => !!result.value || !!error.value);
let transport: SyncTransport | undefined;
// Closes the window the extension opened for the web app, when it sends.
let closeWebWindow: (() => void) | undefined;
let answerConfirm: ((ok: boolean) => void) | undefined;

const otherName = computed(() =>
  props.side === "web" ? "The Lute extension" : "The Lute web app"
);
const title = computed(() =>
  props.role === "send"
    ? props.side === "web"
      ? "Sync to Extension"
      : "Sync to Web App"
    : "Add Synced Accounts"
);
const status = computed(() => {
  switch (state.value) {
    case "connecting":
      return props.role === "send"
        ? `Opening the Lute ${props.side === "web" ? "extension" : "web app"}…`
        : "Connecting…";
    case "waiting":
      return "Confirm in the other window…";
    case "unlocking":
      return "Unlocking…";
    case "sending":
      return "Sending accounts…";
    case "adding":
      return "Adding accounts…";
    default:
      return "";
  }
});

onMounted(start);
onBeforeUnmount(() => transport?.close());

async function start() {
  const onState = (s: SenderState | ReceiverState) => (state.value = s);
  try {
    if (props.role === "send") await send(onState);
    else await receive(onState);
  } catch (err: any) {
    console.error(err);
    error.value = err?.message ?? "Sync failed.";
    if (props.role === "receive" && err?.code === "declined") emit("done");
  } finally {
    if (props.role === "send") closePopup();
  }
}

async function send(onState: (s: SenderState) => void) {
  // Unlocked by the caller while its window was in front; the keys only
  // leave after the other side confirms.
  const mk = props.mk;
  if (!mk) throw Error("The wallet is locked.");
  if (props.side === "web") transport = webTransport();
  else {
    const opened = await extensionSenderTransport(
      syncWebOrigin(import.meta.env.DEV)
    );
    transport = opened.transport;
    closeWebWindow = opened.close;
  }
  const { added, skipped } = await runSender(props.side, transport, {
    appVersion: __APP_VERSION__,
    onState,
    mk,
  });
  result.value = {
    summary: `${added} account${added === 1 ? "" : "s"} added to ${
      props.side === "web" ? "the extension" : "the web app"
    }.`,
    skipped,
  };
}

async function receive(onState: (s: ReceiverState) => void) {
  transport =
    props.side === "web"
      ? webTransport(props.token)
      : receiverTransport(props.tabId!);
  const { added, skipped } = await runReceiver(props.side, transport, {
    onState,
    confirm: () => new Promise((resolve) => (answerConfirm = resolve)),
    getMk: () => unlocker.value!.ensureMk(),
  });
  await store.getCache();
  store.refresh++;
  result.value = {
    summary: `${added} account${added === 1 ? "" : "s"} added.`,
    skipped,
  };
  // The sender shows the full result; this window has done its job.
  emit("done");
}

/** The web app's window closes itself when it finishes; this makes sure. */
function closePopup() {
  closeWebWindow?.();
  closeWebWindow = undefined;
}

function answer(ok: boolean) {
  answerConfirm?.(ok);
  answerConfirm = undefined;
}

function cancel() {
  transport?.send({
    t: "error",
    code: "cancelled",
    message: "The sync was cancelled in the other window.",
  });
  transport?.close();
}

function close() {
  transport?.close();
  emit("close");
}
</script>
