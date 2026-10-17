<template>
  <v-form @submit.prevent="swap()" autocomplete="off">
    <v-container class="send-form">
      <v-row>
        <v-col cols="12" sm="6">
          <v-autocomplete
            v-model="fromId"
            :items="held"
            :item-props="itemProps"
            item-value="id"
            label="From"
            :hint="`Balance: ${balanceText}`"
            persistent-hint
            variant="outlined"
            class="pb-3 mono-hint"
          />
        </v-col>
        <v-col cols="12" sm="6">
          <v-text-field
            v-model="amount"
            type="number"
            :label="`Amount (${fromItem.unit})`"
            :error-messages="amountError"
          >
            <template #append-inner>
              <v-btn
                text="Max"
                variant="flat"
                color="surface-selected"
                size="x-small"
                class="max-btn"
                @click="maxAmount()"
              />
            </template>
          </v-text-field>
        </v-col>
      </v-row>
      <div class="d-flex justify-center">
        <v-btn
          :icon="mdiSwapVertical"
          variant="text"
          size="small"
          aria-label="Flip assets"
          @click="flip()"
        />
      </div>
      <v-autocomplete
        v-model="toId"
        :items="tokens"
        :item-props="itemProps"
        item-value="id"
        label="To"
        variant="outlined"
        class="pb-3"
      />

      <div class="text-body-2 mb-1">Slippage</div>
      <v-chip-group v-model="slippage" mandatory selected-class="text-primary">
        <v-chip v-for="s in SLIPPAGES" :key="s" :value="s" :text="`${s}%`" />
      </v-chip-group>

      <v-progress-linear v-if="quoting && !quote" indeterminate class="my-3" />
      <v-alert
        v-if="quoteError"
        type="error"
        variant="tonal"
        density="compact"
        class="my-3"
        :text="quoteError"
      />
      <div v-if="quote" class="quote my-3">
        <div class="quote-row">
          <span>You receive</span>
          <span class="amount">{{ outText }} {{ toItem.unit }}</span>
        </div>
        <div class="quote-row">
          <span>Minimum received</span>
          <span class="amount">{{ minText }} {{ toItem.unit }}</span>
        </div>
        <div class="quote-row">
          <span>Value</span>
          <span>{{ usd(quote.usdIn) }} → {{ usd(quote.usdOut) }}</span>
        </div>
        <div class="quote-row" :class="impactClass">
          <span>Price impact</span>
          <span>{{ impact.toFixed(2) }}%</span>
        </div>
        <div class="quote-row">
          <span>Route</span>
          <span>{{ routeText }}</span>
        </div>
        <div class="quote-row">
          <span>Router fee</span>
          <span>{{ FEE_BPS / 100 }}%</span>
        </div>
        <div v-if="needsOptIn" class="text-body-2 text-text-body mt-1">
          Includes an opt-in to {{ toItem.unit }}, which adds 0.1 ALGO to
          your minimum balance.
        </div>
        <v-checkbox-btn
          v-if="impact > IMPACT_CONFIRM"
          v-model="impactOk"
          color="error"
          label="I accept the high price impact"
        />
      </div>
    </v-container>
    <v-card-actions class="card-footer">
      <v-btn
        variant="flat"
        text="Swap"
        type="submit"
        :disabled="!canSwap"
        :loading="swapping"
      />
    </v-card-actions>
  </v-form>
</template>

<script lang="ts" setup>
import {
  executeSwap,
  FEE_BPS,
  getQuote,
  type SwapQuote,
} from "@/services/Swap";
import type { AccountInfo, TinyAsset } from "@/types";
import { bigintToString, getAssetInfo, stringToBigint } from "@/utils";
import { reportSignError } from "@/utils/signers";
import { minReceived, spendable } from "@/utils/swap";
import { mdiSwapVertical } from "@mdi/js";
import type { modelsv2 } from "algosdk";

const SLIPPAGES = [0.5, 1, 2];
const SLIPPAGE_KEY = "swap-slippage";
const IMPACT_WARN = 5;
const IMPACT_CONFIRM = 15;
const REFRESH_MS = 20_000;
const OPT_IN_MBR = 100_000n;

interface Item {
  id: bigint;
  name: string;
  unit: string;
  decimals: number;
}

const props = defineProps<{ acct: AccountInfo; from?: bigint }>();
const emit = defineEmits<{ complete: [] }>();
const store = useAppStore();

const ALGO: Item = { id: 0n, name: "Algorand", unit: "ALGO", decimals: 6 };
const asItem = (id: bigint, p: modelsv2.AssetParams): Item => ({
  id,
  name: p.name || String(id),
  unit: p.unitName || p.name || String(id),
  decimals: p.decimals,
});

const held = ref<Item[]>([ALGO]);
watch(
  () => props.acct.info?.assets,
  async (assets) => {
    const infos = await Promise.all(
      (assets ?? [])
        .filter((a) => a.amount > 0n)
        .map((a) => getAssetInfo(a.assetId, true))
    );
    held.value = [ALGO, ...infos.flatMap((i) => (i?.params ? [asItem(i.index, i.params)] : []))];
  },
  { immediate: true }
);
const tokens = computed<Item[]>(() => {
  const list = new Map<bigint, Item>(held.value.map((i) => [i.id, i]));
  for (const t of Object.values(store.tinyman ?? {}) as TinyAsset[]) {
    const id = BigInt(t.id);
    if (t.deleted || list.has(id)) continue;
    list.set(id, {
      id,
      name: t.name,
      unit: t.unit_name || t.name,
      decimals: t.decimals,
    });
  }
  return [...list.values()];
});
function itemProps(item: Item) {
  return { title: `${item.unit} · ${item.name}`, subtitle: item.id ? String(item.id) : undefined };
}

const fromId = ref<bigint>(props.from ?? 0n);
const toId = ref<bigint>();
const fromItem = computed(
  () => held.value.find((i) => i.id === fromId.value) ?? ALGO
);
const toItem = computed(
  () => tokens.value.find((i) => i.id === toId.value) ?? ALGO
);
const needsOptIn = computed(
  () =>
    !!toId.value &&
    !props.acct.info?.assets?.some((a) => a.assetId === toId.value)
);

const amount = ref<string>();
const base = computed(() => {
  try {
    return amount.value ? stringToBigint(amount.value, fromItem.value.decimals) : 0n;
  } catch {
    return 0n;
  }
});
const max = computed(() =>
  props.acct.info
    ? spendable(props.acct.info, fromId.value, needsOptIn.value ? OPT_IN_MBR : 0n)
    : 0n
);
const balanceText = computed(() =>
  bigintToString(max.value, fromItem.value.decimals)
);
const amountError = computed(() =>
  base.value > max.value ? "Insufficient balance" : undefined
);
function maxAmount() {
  amount.value = bigintToString(max.value, fromItem.value.decimals, true);
}
function flip() {
  if (toId.value == null || !held.value.some((i) => i.id === toId.value)) return;
  [fromId.value, toId.value] = [toId.value, fromId.value];
  amount.value = undefined;
}

const slippage = ref(readSlippage());
watch(slippage, (s) => {
  try {
    localStorage.setItem(SLIPPAGE_KEY, String(s));
  } catch {}
});
function readSlippage() {
  try {
    const s = Number(localStorage.getItem(SLIPPAGE_KEY));
    if (SLIPPAGES.includes(s)) return s;
  } catch {}
  return 1;
}

// Quotes: debounced, refreshed while shown, stale answers dropped.
const quote = ref<SwapQuote>();
const quoting = ref(false);
const quoteError = ref<string>();
let run = 0;
let debounce: number | undefined;
let refresher: number | undefined;
async function fetchQuote() {
  const id = ++run;
  if (toId.value == null || toId.value === fromId.value || !base.value || amountError.value) {
    quote.value = undefined;
    quoteError.value = undefined;
    // A request this cancels no longer resets it.
    quoting.value = false;
    return;
  }
  quoting.value = true;
  try {
    const q = await getQuote({
      from: fromId.value,
      to: toId.value!,
      amount: base.value,
      address: props.acct.addr,
      optIn: needsOptIn.value,
      // A Ledger confirms each txn on the device.
      maxGroupSize: props.acct.slot != null && props.acct.seedId == null ? 8 : undefined,
    });
    if (id !== run) return;
    quote.value = q;
    quoteError.value = q.quote ? undefined : "No route found";
  } catch (err: any) {
    if (id !== run) return;
    quote.value = undefined;
    quoteError.value = err.message || "Quote failed";
  } finally {
    if (id === run) quoting.value = false;
  }
}
watch([fromId, toId, base], () => {
  quote.value = undefined;
  impactOk.value = false;
  window.clearTimeout(debounce);
  debounce = window.setTimeout(fetchQuote, 500);
});
onMounted(() => {
  refresher = window.setInterval(() => {
    if (quote.value && !swapping.value && !document.hidden) fetchQuote();
  }, REFRESH_MS);
});
onBeforeUnmount(() => {
  run++;
  window.clearTimeout(debounce);
  window.clearInterval(refresher);
});

const outText = computed(() =>
  quote.value ? bigintToString(quote.value.quote, toItem.value.decimals) : ""
);
const minOut = computed(() =>
  quote.value ? minReceived(quote.value.quote, slippage.value) : 0n
);
const minText = computed(() => bigintToString(minOut.value, toItem.value.decimals));
// The router reports price impact in percent.
const impact = computed(() => quote.value?.userPriceImpact ?? 0);
const impactClass = computed(() =>
  impact.value > IMPACT_CONFIRM ? "text-error" : impact.value > IMPACT_WARN ? "text-warning" : ""
);
const impactOk = ref(false);
// Acceptance covers the impact seen, not a worse one a refresh brings.
watch(impact, (now, before) => {
  if (now > before) impactOk.value = false;
});
const routeText = computed(() => {
  const entries = Object.entries(quote.value?.flattenedRoute ?? {});
  // Shares may come as fractions or percents.
  const scale = entries.reduce((s, [, v]) => s + v, 0) <= 1.01 ? 100 : 1;
  return entries.map(([p, v]) => `${p} ${Math.round(v * scale)}%`).join(" / ");
});
const usd = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

const swapping = ref(false);
const canSwap = computed(
  () =>
    !!quote.value?.quote &&
    !quoting.value &&
    !swapping.value &&
    !amountError.value &&
    (impact.value <= IMPACT_CONFIRM || impactOk.value)
);

async function swap() {
  if (!canSwap.value || !quote.value) return;
  swapping.value = true;
  const summary =
    `Swap ${bigintToString(quote.value.amount, fromItem.value.decimals)} ${fromItem.value.unit}` +
    ` for at least ${minText.value} ${toItem.value.unit} via ${routeText.value}.` +
    (needsOptIn.value ? ` Includes an opt-in to ${toItem.value.unit}.` : "");
  try {
    await executeSwap({
      quote: quote.value,
      acct: props.acct,
      slippage: slippage.value,
      summary,
    });
    amount.value = undefined;
    emit("complete");
  } catch (err: any) {
    reportSignError(err);
  } finally {
    store.overlay = false;
    swapping.value = false;
  }
}
</script>

<style scoped>
.quote {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border: 1px solid rgb(var(--v-theme-border-subtle));
  border-radius: 8px;
}
.quote-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
}
</style>
