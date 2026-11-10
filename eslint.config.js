import pluginVue from "eslint-plugin-vue";
import vueTsEslintConfig from "@vue/eslint-config-typescript";

export default [
  {
    name: "app/files-to-lint",
    files: ["**/*.{ts,mts,tsx,vue}"],
  },
  {
    name: "app/files-to-ignore",
    ignores: [
      "**/dist/**",
      "**/dist-ssr/**",
      "**/coverage/**",
      "**/extension/**",
    ],
  },

  ...pluginVue.configs["flat/essential"],
  ...vueTsEslintConfig(),
  {
    rules: {
      "vue/multi-word-component-names": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      // A default or namespace import keeps every algosdk export in the
      // bundle; named imports let unused parts be tree-shaken.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "algosdk",
              importNames: ["default"],
              message: 'Use named imports: import { … } from "algosdk".',
            },
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
  },
];
