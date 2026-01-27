import eslint from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier/flat"
import importPlugin from "eslint-plugin-import"
import jsdoc from "eslint-plugin-jsdoc"
import reactHooks from "eslint-plugin-react-hooks"
import { defineConfig } from "eslint/config"
import globals from "globals"
import tseslint from "typescript-eslint"

import autoImports from "./.wxt/eslint-auto-imports.mjs"

const rules = {
  "@typescript-eslint/no-explicit-any": "off",
  "@typescript-eslint/no-unused-vars": "warn",
}

const globalsConfig = {
  ...globals.node,
  ...globals.browser,
}

export default defineConfig([
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      ".plasmo/**",
      ".output/**",
      ".wxt/**",
      "docs/**",
      "coverage/**",
      "tailwind.config.js",
      "public/react-devtools-backend.js",
    ],
  },
  { languageOptions: { globals: globalsConfig } },
  autoImports,
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],

    plugins: { "react-hooks": reactHooks },

    // Configure language/parsing options
    languageOptions: {
      // Use TypeScript ESLint parser for TypeScript files
      parser: tseslint.parser,
      parserOptions: {
        // Enable project service for better TypeScript integration
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },

    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      importPlugin.flatConfigs.recommended,
      importPlugin.flatConfigs.typescript,
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true, // Always try to resolve types under `<root>@types` directory even if it doesn't contain any source code, like `@types/unist`

          bun: true, // Resolve Bun modules (https://github.com/import-js/eslint-import-resolver-typescript#bun)
        },
      },
    },
    rules: {
      "import/extensions": [
        "error",
        "ignorePackages",
        {
          js: "never",
          jsx: "never",
          mjs: "never",
          ts: "never",
          tsx: "never",
        },
      ],
    },
  },
  jsdoc.configs["flat/recommended"],
  jsdoc.configs["flat/recommended-typescript"],
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { jsdoc },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "jsdoc/require-description": "warn",
      "jsdoc/require-param": "off",
      "jsdoc/require-returns": "off",
    },
  },
  // Guardrails: avoid direct `console.*` usage in app/runtime code (use `utils/logger.ts`).
  {
    files: [
      "services/**/*.{ts,tsx}",
      "utils/**/*.{ts,tsx}",
      "entrypoints/**/*.{ts,tsx}",
      "features/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "contexts/**/*.{ts,tsx}",
      "hooks/**/*.{ts,tsx}",
    ],
    rules: {
      "no-console": "error",
    },
  },
  // Allow `console.*` in the unified logger implementation and in tests.
  {
    files: ["utils/logger.ts", "tests/**/*.{ts,tsx}"],
    rules: {
      "no-console": "off",
    },
  },
  { rules },
  eslintConfigPrettier,
])
