/**
 * plugins/vuetify.ts
 *
 * Framework documentation: https://vuetifyjs.com`
 */

// Styles
import "vuetify/styles";
import { aliases, mdi } from "vuetify/iconsets/mdi-svg";

// Composables
import { createVuetify, type ThemeDefinition } from "vuetify";

/*
 * Design tokens. oklch is the source of truth (in the comments); Vuetify
 * needs hex. Besides Vuetify's own keys, every theme has:
 * surface-selected, border-subtle, border, border-strong, border-input,
 * text-body, text-muted, text-dim, text-placeholder, text-disabled, icon,
 * primary-hover, primary-text, error-text and danger-fill.
 */
const dark: ThemeDefinition = {
  dark: true,
  colors: {
    background: "#0c0b0d", // oklch(0.150 0.005 310)
    surface: "#121113", // oklch(0.178 0.005 310)
    "surface-bright": "#161517", // oklch(0.197 0.005 310)
    "surface-light": "#201f21", // = surface-selected
    "surface-variant": "#19181a", // oklch(0.210 0.005 310)
    "surface-selected": "#201f21", // oklch(0.240 0.005 310)
    "border-subtle": "#161517", // oklch(0.196 0.005 310)
    border: "#1d1c1e", // oklch(0.227 0.005 310)
    "border-strong": "#242325", // oklch(0.257 0.005 310)
    "border-input": "#646266", // oklch(0.500 0.006 310)
    "on-background": "#edecee",
    "on-surface": "#edecee", // oklch(0.944 0.004 310)
    "on-surface-variant": "#edecee",
    "text-body": "#c6c3c9", // oklch(0.822 0.008 310)
    "text-muted": "#8e8b90", // oklch(0.640 0.008 310)
    "text-dim": "#8c898e", // oklch(0.635 0.008 310)
    "text-placeholder": "#7f7c81", // oklch(0.590 0.008 310)
    "text-disabled": "#575559", // oklch(0.453 0.008 310)
    icon: "#716f74", // oklch(0.545 0.008 310)
    primary: "#a645c2", // oklch(0.570 0.200 318)
    "primary-hover": "#9634b1", // oklch(0.520 0.200 318)
    "on-primary": "#fffdff", // oklch(1.000 0.010 310)
    "primary-text": "#dea5f0", // oklch(0.800 0.120 318)
    error: "#f46a82", // oklch(0.700 0.170 12)
    "error-text": "#fa7f91", // oklch(0.740 0.150 12)
    "danger-fill": "#c72c53", // oklch(0.550 0.190 12)
    "on-danger-fill": "#fffdff",
    warning: "#e6b37b", // oklch(0.800 0.093 68)
    success: "#71c1a3", // oklch(0.750 0.090 168)
    info: "#d6a9f1", // oklch(0.800 0.110 312)
    "on-error": "#0c0b0d",
    "on-warning": "#0c0b0d",
    "on-success": "#0c0b0d",
    "on-info": "#0c0b0d",
  },
  variables: {
    "border-color": "#1d1c1e",
    "border-opacity": 1,
  },
};

const light: ThemeDefinition = {
  dark: false,
  colors: {
    background: "#f7f7f8", // oklch(0.976 0.002 310)
    surface: "#ffffff",
    "surface-bright": "#ffffff",
    "surface-light": "#e3e2e3", // = surface-selected
    "surface-variant": "#edeced", // oklch(0.944 0.002 310)
    "surface-selected": "#e3e2e3", // derived: oklch(0.914 0.002 310)
    "border-subtle": "#f1f0f1", // oklch(0.956 0.002 310)
    border: "#e7e6e7", // oklch(0.926 0.002 310)
    "border-strong": "#dddcde", // oklch(0.896 0.002 310)
    "border-input": "#8f8f90", // oklch(0.650 0.002 310)
    "on-background": "#1a171d",
    "on-surface": "#1a171d", // oklch(0.210 0.014 310)
    "on-surface-variant": "#1a171d",
    "text-body": "#545157", // oklch(0.441 0.010 310)
    "text-muted": "#666369", // oklch(0.505 0.010 310)
    "text-dim": "#6d6a70", // oklch(0.530 0.010 310)
    "text-placeholder": "#6d6a70", // oklch(0.530 0.010 310)
    "text-disabled": "#a4a0a7", // oklch(0.711 0.010 310)
    icon: "#89868c", // oklch(0.625 0.010 310)
    primary: "#a840c5", // oklch(0.570 0.211 318)
    "primary-hover": "#982eb5", // derived: oklch(0.520 0.211 318)
    "on-primary": "#ffffff",
    "primary-text": "#a840c5", // same as primary in light
    error: "#c2003c", // oklch(0.510 0.215 15)
    "error-text": "#c2003c",
    "danger-fill": "#c2003c",
    "on-danger-fill": "#ffffff",
    warning: "#8d5417", // oklch(0.500 0.104 62)
    success: "#1d775c", // oklch(0.510 0.093 168)
    info: "#8a429f", // oklch(0.510 0.156 318)
    "on-error": "#ffffff",
    "on-warning": "#ffffff",
    "on-success": "#ffffff",
    "on-info": "#ffffff",
  },
  variables: {
    "border-color": "#e7e6e7",
    "border-opacity": 1,
  },
};

const gold: ThemeDefinition = {
  dark: true,
  colors: {
    background: "#0f0e0c", // oklch(0.164 0.004 75)
    surface: "#161513", // oklch(0.196 0.004 75)
    "surface-bright": "#1b1a18", // oklch(0.217 0.004 75)
    "surface-light": "#272523", // = surface-selected
    "surface-variant": "#1f1e1c", // oklch(0.236 0.004 75)
    "surface-selected": "#272523", // derived: oklch(0.266 0.004 75)
    "border-subtle": "#1b1a18", // oklch(0.217 0.004 75)
    border: "#232220", // oklch(0.252 0.004 75)
    "border-strong": "#2c2b29", // oklch(0.290 0.004 75)
    "border-input": "#656361", // oklch(0.500 0.004 75)
    "on-background": "#eeecea",
    "on-surface": "#eeecea", // oklch(0.944 0.003 75)
    "on-surface-variant": "#eeecea",
    "text-body": "#ccc9c5", // oklch(0.837 0.006 75)
    "text-muted": "#928f8b", // oklch(0.651 0.006 75)
    "text-dim": "#888682", // oklch(0.620 0.006 75)
    "text-placeholder": "#888682", // oklch(0.620 0.006 75)
    "text-disabled": "#686562", // oklch(0.509 0.006 75)
    icon: "#6b6865", // oklch(0.520 0.006 75)
    primary: "#ebb159",
    "primary-hover": "#daa148", // derived: primary at L - 0.05
    "on-primary": "#191716", // oklch(0.207 0.004 75)
    "primary-text": "#f3cf8a",
    error: "#f06f7e", // oklch(0.700 0.159 15)
    "error-text": "#fd8994", // oklch(0.760 0.140 15)
    "danger-fill": "#bc4053", // oklch(0.550 0.159 15)
    "on-danger-fill": "#ffffff",
    warning: "#eb8656", // oklch(0.720 0.140 45)
    success: "#93bb8b", // oklch(0.750 0.080 140)
    info: "#c2bdb7", // oklch(0.800 0.010 75)
    "on-error": "#0f0e0c",
    "on-warning": "#0f0e0c",
    "on-success": "#0f0e0c",
    "on-info": "#0f0e0c",
  },
  variables: {
    "border-color": "#232220",
    "border-opacity": 1,
  },
};

// https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
export default createVuetify({
  defaults: {
    global: {
      ripple: false,
    },
    VBtn: {
      variant: "text",
      color: "primary",
    },
    VSelect: {
      variant: "outlined",
    },
    VCombobox: {
      variant: "outlined",
    },
    VAutocomplete: {
      variant: "outlined",
    },
    VTextField: {
      variant: "outlined",
    },
    VTextarea: {
      variant: "outlined",
    },
    VCheckbox: {
      color: "primary",
    },
    VCheckboxBtn: {
      color: "primary",
    },
    VRadio: {
      color: "primary",
    },
    VSwitch: {
      color: "primary",
      inset: true,
      density: "compact",
    },
    VProgressLinear: {
      color: "primary",
    },
    VProgressCircular: {
      color: "primary",
    },
    VAlert: {
      variant: "tonal",
    },
    VMenu: {
      offset: 4,
    },
  },
  theme: {
    defaultTheme: "dark",
    themes: { dark, light, gold },
  },
  icons: {
    defaultSet: "mdi",
    aliases,
    sets: { mdi },
  },
});
