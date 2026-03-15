/**
 * plugins/vuetify.ts
 *
 * Framework documentation: https://vuetifyjs.com`
 */

// Styles
import "vuetify/styles";
import colors from "vuetify/util/colors";
import { aliases, mdi } from "vuetify/iconsets/mdi-svg";

// Composables
import { createVuetify } from "vuetify";

// https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
export default createVuetify({
  defaults: {
    VBtn: {
      variant: "text",
      color: "primary",
      class: "no-uppercase",
    },
    VSelect: {
      variant: "outlined",
    },
    VCombobox: {
      variant: "outlined",
    },
    VTextField: {
      variant: "outlined",
    },
  },
  theme: {
    defaultTheme: "dark",
    themes: {
      dark: {
        colors: {
          primary: colors.purple.lighten1,
          cardSecondary: "#2b2b2b",
        },
      },
      light: {
        colors: {
          primary: colors.purple.darken1,
          cardSecondary: colors.grey.lighten5,
          background: colors.grey.lighten5,
        },
      },
      gold: {
        dark: true,
        colors: {
          primary: "#ebb159",
          cardSecondary: "#2b2b2b",
        },
      },
    },
  },
  icons: {
    defaultSet: "mdi",
    aliases,
    sets: { mdi },
  },
});
