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
const optionsPageImportRestrictionPattern = {
  group: ["~/entrypoints/options/pages/**"],
  message:
    "Do not import from `~/entrypoints/options/pages/**` outside the options entrypoint. Extract shared code into `~/features/`, `~/services/`, `~/utils/`, or `~/types/` instead.",
}
const apiServiceBackendImplementationImportPattern = {
  regex:
    "^(?:~/services/apiService|(?:\\.\\./){1,4}apiService)/(?:aihubmix|anyrouter|axonHub|claudeCodeHub|doneHub|octopus|oneHub|sub2api|veloera|wong)$",
  message:
    "Do not import backend-specific apiService implementations from product code. Add or use an adapter/workflow module instead.",
}
const accountSiteMainlineApiServiceFacadeImportPattern = {
  regex:
    "^(?:~/services/apiService|(?:\\.\\./)+(?:services/)?apiService)(?:/index)?$",
  message:
    "Account-site product flows must use ~/services/apiAdapters or account workflow helpers instead of the legacy apiService facade.",
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
  // Guardrails: keep runtime extension API access inside browser adapter modules.
  {
    files: [srcJsFamilyFilePattern],
    ignores: [
      "src/utils/browser/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/utils/core/logger.{js,cjs,mjs,jsx,ts,tsx}",
    ],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "browser",
          message:
            "Do not access the global WebExtension API directly in app code. Add a guarded wrapper in `~/utils/browser/browserApi` or another `~/utils/browser/**` adapter.",
        },
        {
          name: "chrome",
          message:
            "Do not access the global Chrome extension API directly in app code. Add a guarded wrapper in `~/utils/browser/browserApi` or another `~/utils/browser/**` adapter.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name=/^(browser|chrome)$/]",
          message:
            "Do not access global WebExtension APIs directly in app code. Add a guarded wrapper in `~/utils/browser/browserApi` or another `~/utils/browser/**` adapter.",
        },
        {
          selector:
            "MemberExpression[object.type='TSAsExpression'][object.expression.name=/^(browser|chrome)$/]",
          message:
            "Do not access casted global WebExtension APIs directly in app code. Add a guarded wrapper in `~/utils/browser/browserApi` or another `~/utils/browser/**` adapter.",
        },
        {
          selector:
            "MemberExpression[object.name=/^(globalThis|window)$/][property.name=/^(browser|chrome)$/]:not(MemberExpression[object.name=/^(globalThis|window)$/][property.name=/^(browser|chrome)$/] MemberExpression)",
          message:
            "Do not access global WebExtension APIs through `globalThis` or `window` in app code. Add a guarded wrapper in `~/utils/browser/browserApi` or another `~/utils/browser/**` adapter.",
        },
        {
          selector:
            "MemberExpression[object.type='TSAsExpression'][object.expression.name=/^(globalThis|window)$/][property.name=/^(browser|chrome)$/]:not(MemberExpression[object.type='TSAsExpression'][object.expression.name=/^(globalThis|window)$/][property.name=/^(browser|chrome)$/] MemberExpression)",
          message:
            "Do not access casted global WebExtension APIs through `globalThis` or `window` in app code. Add a guarded wrapper in `~/utils/browser/browserApi` or another `~/utils/browser/**` adapter.",
        },
      ],
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
          patterns: [optionsPageImportRestrictionPattern],
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
  // Guardrails: keep direct backend-specific apiService imports behind adapters
  // or workflow owner modules while the account-site adapter migration proceeds.
  {
    files: [srcJsFamilyFilePattern],
    ignores: [
      "src/services/apiService/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/services/apiAdapters/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/services/apiCredentialProfiles/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/services/checkin/autoCheckin/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/services/managedSites/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/services/models/modelSync/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/features/BasicSettings/components/tabs/ManagedSite/**/*.{js,cjs,mjs,jsx,ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [apiServiceBackendImplementationImportPattern],
        },
      ],
    },
  },
  // Guardrails: account-mainline product flows must not import the legacy apiService facade.
  // ESLint flat config replaces rule options for narrower matches, so this block
  // restates the backend implementation guard instead of relying on option merging.
  {
    files: [
      "src/features/AccountManagement/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/features/KeyManagement/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/features/ModelList/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/components/dialogs/VerifyApiDialog/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/components/dialogs/VerifyCliSupportDialog/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/components/KiloCodeExportDialog.{js,cjs,mjs,jsx,ts,tsx}",
      "src/services/accounts/**/*.{js,cjs,mjs,jsx,ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            apiServiceBackendImplementationImportPattern,
            accountSiteMainlineApiServiceFacadeImportPattern,
          ],
        },
      ],
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
            optionsPageImportRestrictionPattern,
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
