<template>
  <div
    class="overview-grid"
    :class="!priced && 'overview-grid--single'"
    :style="{ '--chars': chars }"
  >
    <v-card class="stat-card">
      <div class="stat-label">Balance</div>
      <div class="stat-value">
        <span v-if="store.isVoi" class="font-weight-bold">V </span>
        <algo-icon v-else color="currentColor" :width="16" class="algo-glyph" />
        <masked-value :text="algoText" />
      </div>
    </v-card>
    <template v-if="priced">
      <v-card class="stat-card">
        <div class="stat-label">
          Assets
          <span v-if="holdings.size" class="ml-auto text-dim">
            {{ pricedCount }} of {{ holdings.size }} priced
          </span>
        </div>
        <div class="stat-value">
          <algo-icon color="currentColor" :width="16" class="algo-glyph" />
          <masked-value :text="assetText" />
        </div>
      </v-card>
      <v-card class="stat-card">
        <div class="stat-label">Total value</div>
        <div class="stat-value">
          <algo-icon color="currentColor" :width="16" class="algo-glyph" />
          <masked-value :text="totalText" />
        </div>
      </v-card>
      <v-card class="stat-card">
        <div class="stat-label">Total value (USD)</div>
        <div class="stat-value"><masked-value :text="usdText" /></div>
      </v-card>
    </template>
  </div>
</template>

<script lang="ts" setup>
import {
  formatAlgoValue,
  getAlgoUsd,
  getUnitPrices,
  unitPrices,
} from "@/services/Prices";
import { bigintToString } from "@/utils";

const store = useAppStore();
const priced = computed(() => store.networkName === "MainNet");

// Sub-accounts can show up under more than one parent, so count each address once.
const accts = computed(() => {
  const seen = new Map<
    string,
    NonNullable<(typeof store.acctInfo)[0]["info"]>
  >();
  for (const a of store.acctInfo)
    if (a.info && !seen.has(a.info.address)) seen.set(a.info.address, a.info);
  return [...seen.values()];
});
// Totals are unknown until every account's info has loaded.
const ready = computed(() => store.acctInfo.every((a) => a.info));
const algoTotal = computed(() =>
  accts.value.reduce((sum, i) => sum + i.amount, 0n)
);
// Non-zero balance per asset across all accounts.
const holdings = computed(() => {
  const m = new Map<bigint, bigint>();
  for (const i of accts.value)
    for (const h of i.assets ?? [])
      if (h.amount) m.set(h.assetId, (m.get(h.assetId) ?? 0n) + h.amount);
  return m;
});

const loading = ref(false);
const assetAlgo = ref<number>();
const algoUsd = ref<number>();
const pricedCount = ref(0);
let run = 0;

watch(
  [holdings, priced, ready],
  async () => {
    const id = ++run;
    if (!priced.value) {
      unitPrices.value = new Map();
      return;
    }
    if (!ready.value) {
      assetAlgo.value = undefined;
      loading.value = false;
      return;
    }
    loading.value = true;
    const held = holdings.value;
    const [units, usd] = await Promise.all([
      getUnitPrices([...held.keys()]),
      getAlgoUsd(),
    ]);
    if (id !== run) return;
    const known = [...units].map(
      ([assetId, unit]) => Number(held.get(assetId)) * unit
    );
    unitPrices.value = units;
    assetAlgo.value = known.reduce((a, b) => a + b, 0);
    pricedCount.value = known.length;
    algoUsd.value = usd;
    loading.value = false;
  },
  { immediate: true }
);

const pending = (v: number | undefined, f: (n: number) => string) =>
  loading.value ? "…" : v === undefined ? "—" : f(v);

const algoText = computed(() =>
  ready.value ? bigintToString(algoTotal.value, 6, false, 2) : "-"
);
const assetText = computed(() => pending(assetAlgo.value, formatAlgoValue));
const totalAlgo = computed(() =>
  assetAlgo.value === undefined
    ? undefined
    : Number(algoTotal.value) / 1e6 + assetAlgo.value
);
const totalText = computed(() => pending(totalAlgo.value, formatAlgoValue));
const usdText = computed(() =>
  pending(
    totalAlgo.value !== undefined && algoUsd.value !== undefined
      ? totalAlgo.value * algoUsd.value
      : undefined,
    (n) =>
      n.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      })
  )
);
// Every card shrinks to the longest amount so the row stays even. Hidden
// amounts keep the default size, which would otherwise hint at magnitude.
const chars = computed(() =>
  store.hideBalances
    ? 8
    : Math.max(
        8,
        ...[algoText, assetText, totalText, usdText].map((t) => t.value.length)
      )
);
</script>

<style scoped>
.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.overview-grid--single {
  grid-template-columns: minmax(0, 1fr);
  max-width: 280px;
}
.stat-card {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
}
.stat-label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 18px;
  font-size: 12px;
  color: rgb(var(--v-theme-text-muted));
}
.stat-value {
  --max: 20px;
  --glyph: 16px;
  display: flex;
  align-items: baseline;
  gap: 0.35em;
  font: 500 var(--max) / 1.2 var(--font-mono);
  font-size: clamp(
    12px,
    (100cqi - var(--glyph)) / (var(--chars) * 0.6 + 0.35),
    var(--max)
  );
  letter-spacing: -0.02em;
  white-space: nowrap;
}
@media (max-width: 959.98px) {
  .overview-grid {
    grid-template-columns: 1fr 1fr;
  }
}
.page--flush .overview-grid {
  gap: 10px;
  padding: 0 14px;
  margin-bottom: 14px;
}
.page--flush .overview-grid--single {
  max-width: none;
}
.page--flush .stat-card {
  padding: 12px 14px;
  gap: 4px;
}
.page--flush .stat-value {
  --max: 17px;
  --glyph: 13px;
}
</style>
