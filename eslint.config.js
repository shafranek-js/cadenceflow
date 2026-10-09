import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // ESLint does not read `.gitignore`, so generated trees must be listed here explicitly.
    // `artifacts/` holds validation run output (screenshots, metrics JSON, throwaway Playwright
    // configs); linting it reported failures in files nobody maintains.
    ignores: [
      "dist",
      "public/audio/piano-hq/samples",
      // SoundFont banks are generated base64 JavaScript assets, not maintained source code.
      "public/audio/soundfont/*-mp3.js",
      "artifacts",
      "graphify-out",
      "playwright-report",
      "coverage",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "react-hooks/set-state-in-effect": "off",
    },
  },
);
