import { existsSync } from "node:fs"
import eslint from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier/flat"
import importPlugin from "eslint-plugin-import"
import jsdoc from "eslint-plugin-jsdoc"
import reactHooks from "eslint-plugin-react-hooks"
import { defineConfig } from "eslint/config"
import globals from "globals"
import tseslint from "typescript-eslint"

const autoImportsConfigUrl = new URL(
  "./.wxt/eslint-auto-imports.mjs",
  import.meta.url,
)
const wxtTsconfigUrl = new URL("./.wxt/tsconfig.json", import.meta.url)
const wxtPrepared = existsSync(wxtTsconfigUrl)
const autoImports = existsSync(autoImportsConfigUrl)
  ? (await import(autoImportsConfigUrl.href)).default
  : {
      name: "wxt/auto-imports-unavailable",
      languageOptions: {
        globals: {},
        sourceType: "module",
      },
    }
const typescriptParserOptions = wxtPrepared
  ? {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    }
  : {
      tsconfigRootDir: import.meta.dirname,
    }
const typescriptResolverOptions = {
  alwaysTryTypes: true,
  bun: true,
  project: wxtPrepared ? "tsconfig.json" : "tsconfig.eslint.json",
}

const rules = {
  "@typescript-eslint/no-explicit-any": "off",
  "@typescript-eslint/no-unused-vars": [
    "warn",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
      destructuredArrayIgnorePattern: "^_",
    },
  ],
}

const globalsConfig = {
  ...globals.node,
  ...globals.browser,
}

const jsFamilyFilePattern = "**/*.{js,cjs,mjs,jsx,ts,tsx}"
const srcJsFamilyFilePattern = "src/**/*.{js,cjs,mjs,jsx,ts,tsx}"

export default defineConfig([
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      ".plasmo/**",
      ".output/**",
      ".wxt/**",
      "diagnostics-results/**",
      "docs/**/*",
      "!docs/scripts/",
      "!docs/scripts/**/*.mjs",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "tailwind.config.js",
      "src/public/react-devtools-backend.js",
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
      parserOptions: typescriptParserOptions,
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
      parserOptions: typescriptParserOptions,
    },
    settings: {
      "import/resolver": {
        typescript: typescriptResolverOptions,
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
      parserOptions: typescriptParserOptions,
    },
  },
  {
    files: [jsFamilyFilePattern],
    rules: {
      "jsdoc/require-jsdoc": "off",
      "jsdoc/require-description": "off",
      "jsdoc/require-param": "off",
      "jsdoc/require-returns": "off",
    },
  },
  {
    files: [srcJsFamilyFilePattern],
    rules: {
      "jsdoc/require-jsdoc": "warn",
      "jsdoc/require-description": "error",
    },
  },
  // Guardrails: avoid direct `console.*` usage in app/runtime code (use `~/utils/core/logger`).
  {
    files: [srcJsFamilyFilePattern],
    rules: {
      "no-console": "error",
    },
  },
  // Allow `console.*` in the unified logger implementation and in tests.
  {
    files: [
      "src/utils/core/logger.{js,cjs,mjs,jsx,ts,tsx}",
      "tests/**/*.{js,cjs,mjs,jsx,ts,tsx}",
    ],
    rules: {
      "no-console": "off",
    },
  },
  // Guardrails: prevent non-entrypoint code from depending on options page internals.
  //
  // Transition plan:
  // - Start as a warning while we migrate existing violations out of `entrypoints/options/pages/**`.
  // - Once the repo is clean, upgrade this to "error" so `pnpm -s lint` fails on new violations.
  {
    files: [srcJsFamilyFilePattern],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["~/entrypoints/options/pages/**"],
              message:
                "Do not import from `~/entrypoints/options/pages/**` outside the options entrypoint. Extract shared code into `~/features/`, `~/services/`, `~/utils/`, or `~/types/` instead.",
            },
          ],
        },
      ],
    },
  },
  // Allow options entrypoint code to depend on options pages.
  {
    files: ["src/entrypoints/options/**/*.{js,cjs,mjs,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  // Guardrails: AI API protocol modules must not depend on account-site apiService internals.
  {
    files: ["src/services/aiApi/**/*.{js,cjs,mjs,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["~/entrypoints/options/pages/**"],
              message:
                "Do not import from `~/entrypoints/options/pages/**` outside the options entrypoint. Extract shared code into `~/features/`, `~/services/`, `~/utils/`, or `~/types/` instead.",
            },
            {
              group: [
                "~/services/apiService/**",
                "../apiService/**",
                "../../apiService/**",
                "../../../apiService/**",
              ],
              message:
                "AI API protocol modules must not depend on the account-site apiService layer. Use ~/services/apiTransport/** for shared transport code.",
            },
          ],
        },
      ],
    },
  },
  { rules },
  eslintConfigPrettier,
])
