<template>
  <v-form ref="form" validate-on="blur" @submit.prevent="importKey()">
    <v-container class="pt-6 px-1 ml-1">
      <v-row>
        <v-col v-for="m in [0, 1]" :key="m" cols="6">
          <div
            v-for="n in wordIdxArray.filter((n) =>
              m ? n > splitIdx : n <= splitIdx
            )"
            :key="n"
            class="word-wrap pb-1"
          >
            <v-text-field
              :id="`mn-${n}`"
              hide-details="auto"
              density="compact"
              :type="visible.includes(n) ? 'text' : 'password'"
              autocomplete="one-time-code"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              :model-value="mnemonicArray[n]"
              @update:model-value="(v: string) => setWord(n, v)"
              @paste="handlePaste"
              @keydown="handleKeydown"
              @focus="onFocus(n)"
              @blur="onBlur(n)"
              :rules="[required, validWord]"
              role="combobox"
              aria-autocomplete="list"
              :aria-expanded="focused === n && suggestions.length > 0"
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
            <v-sheet
              v-if="focused === n && suggestions.length"
              :class="['suggestions', { 'suggestions--up': opensUp(n) }]"
              elevation="4"
              rounded
              role="listbox"
            >
              <v-list density="compact" class="py-0">
                <v-list-item
                  v-for="(word, i) in suggestions"
                  :key="word"
                  :title="word"
                  :active="i === highlighted"
                  role="option"
                  :aria-selected="i === highlighted"
                  @mousedown.prevent
                  @mouseenter="highlighted = i"
                  @click="accept(n, word)"
                />
              </v-list>
            </v-sheet>
          </div>
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
import { mdiEye, mdiEyeOff } from "@mdi/js";
import { wordlist } from "@scure/bip39/wordlists/english.js";

// Algorand 25-word and Falcon mnemonics use the same English BIP39 wordlist.
const WORD_SET = new Set(wordlist);
// Number of typed letters before suggestions appear.
const MIN_SUGGEST_LENGTH = 2;
const MAX_SUGGESTIONS = 6;

const props = defineProps({
  numberOfWords: { type: Number, required: true },
  buttonText: { type: String, required: true },
});

const splitIdx = Math.round(props.numberOfWords / 2) - 1;
const wordIdxArray = [...Array(props.numberOfWords).keys()];
// Fields in the lower half of each column open their suggestions upward so
// the list is not clipped by a surrounding v-window / dialog edge.
const opensUp = (n: number) =>
  (n > splitIdx ? n - splitIdx - 1 : n) > splitIdx / 2;

const store = useAppStore();
const form = ref();
const mnemonicArray = ref<string[]>([]);
const visible = ref<number[]>([]);
const focused = ref(-1);
const highlighted = ref(0);
const dismissed = ref(false);
const mnemonic = computed(() => mnemonicArray.value.join(" "));
const emit = defineEmits(["close", "mn"]);
const required = (v: string) => !!v || "Required";
const validWord = (v: string) =>
  !v || WORD_SET.has(v) || "Not a valid mnemonic word";

const suggestions = computed(() => {
  if (focused.value < 0 || dismissed.value) return [];
  const prefix = mnemonicArray.value[focused.value] ?? "";
  if (prefix.length < MIN_SUGGEST_LENGTH) return [];
  const out: string[] = [];
  for (const w of wordlist) {
    if (w.startsWith(prefix)) {
      out.push(w);
      if (out.length === MAX_SUGGESTIONS) break;
    }
  }
  // Nothing to suggest if the only match is what has already been typed.
  if (out.length === 1 && out[0] === prefix) return [];
  return out;
});

watch(suggestions, (s) => {
  if (highlighted.value >= s.length) highlighted.value = 0;
});

function sanitize(v: string) {
  return v.toLowerCase().replace(/[^a-z]/g, "");
}

function setWord(n: number, v: string) {
  const clean = sanitize(v ?? "");
  mnemonicArray.value[n] = clean;
  dismissed.value = false;
  highlighted.value = 0;
  if (clean !== v) {
    // Vue won't re-patch the DOM if the model value didn't change, so make
    // sure stripped characters never linger in the input.
    nextTick(() => {
      const el = document.getElementById(`mn-${n}`) as HTMLInputElement | null;
      if (el && el.value !== clean) el.value = clean;
    });
  }
}

function focusWord(n: number) {
  document.getElementById(`mn-${n}`)?.focus();
}

function accept(n: number, word: string) {
  mnemonicArray.value[n] = word;
  dismissed.value = true;
  if (n < props.numberOfWords - 1) focusWord(n + 1);
}

function onFocus(n: number) {
  focused.value = n;
  highlighted.value = 0;
  dismissed.value = false;
}

function onBlur(n: number) {
  if (focused.value === n) focused.value = -1;
}

function handlePaste(e: ClipboardEvent) {
  const inputText = e.clipboardData?.getData("text/plain") ?? "";
  e.preventDefault();
  const inputArray = inputText
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(sanitize);
  const idx = +(e.target as HTMLInputElement).id.replace("mn-", "");

  if (inputArray.length === 1) {
    // Single word: fill just this field
    setWord(idx, inputArray[0]);
  } else if (inputArray.length === props.numberOfWords) {
    // Full phrase: fill every field and jump to the last one
    mnemonicArray.value = inputArray;
    dismissed.value = true;
    focusWord(props.numberOfWords - 1);
  } else {
    store.setSnackbar(
      `Paste must be a single word or the entire ${props.numberOfWords}-word mnemonic (got ${inputArray.length} words)`,
      "warning"
    );
  }
}

function handleKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLInputElement;
  const n = +target.id.replace("mn-", "");
  const open = focused.value === n && suggestions.value.length > 0;

  // Only letters (plus editing/navigation keys) may be typed
  if (
    e.key.length === 1 &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !/[a-zA-Z ,.]/.test(e.key)
  ) {
    e.preventDefault();
    return;
  }

  switch (e.key) {
    case "ArrowDown":
      if (open) {
        e.preventDefault();
        highlighted.value = (highlighted.value + 1) % suggestions.value.length;
      }
      return;
    case "ArrowUp":
      if (open) {
        e.preventDefault();
        highlighted.value =
          (highlighted.value - 1 + suggestions.value.length) %
          suggestions.value.length;
      }
      return;
    case "Escape":
      if (open) {
        e.preventDefault();
        dismissed.value = true;
      }
      return;
    case "Tab":
      // Complete the word, then let Tab move focus naturally
      if (open && !e.shiftKey) {
        mnemonicArray.value[n] = suggestions.value[highlighted.value];
        dismissed.value = true;
      }
      return;
    case "Enter":
      if (open) {
        e.preventDefault();
        accept(n, suggestions.value[highlighted.value]);
      }
      // Otherwise fall through to the form's submit
      return;
    case " ":
    case ",":
    case ".":
      e.preventDefault();
      if (open) {
        accept(n, suggestions.value[highlighted.value]);
      } else if (n < props.numberOfWords - 1) {
        focusWord(n + 1);
      }
      return;
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
    emit("mn", mnemonic.value);
  } catch (err: any) {
    console.error(err);
    store.setSnackbar(err.message, "error");
  }
}
</script>

<style scoped>
.word-wrap {
  position: relative;
}
.suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 10;
  overflow: hidden;
}
.suggestions--up {
  top: auto;
  bottom: 100%;
}
</style>
