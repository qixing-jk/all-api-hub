import { existsSync } from "node:fs"
import eslint from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier/flat"
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

const rules = {
  "@typescript-eslint/consistent-type-imports": [
    "error",
    {
      disallowTypeAnnotations: false,
      fixStyle: "inline-type-imports",
    },
  ],
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
const heroiconsImportRestrictionPattern = {
  group: ["@heroicons/react", "@heroicons/react/**"],
  message:
    "Heroicons has been retired from application code. Use lucide-react or a shared semantic icon component instead.",
}
const apiServiceBackendImplementationImportPattern = {
  regex:
    "^(?:~/services/apiService|(?:\\.\\./)+(?:services/)?apiService)/(?:aihubmix|anyrouter|axonHub|claudeCodeHub|doneHub|octopus|oneHub|sub2api|veloera|wong)$",
  message:
    "Do not import backend-specific apiService implementations from product code. Add or use an adapter/workflow module instead.",
}
const accountSiteMainlineApiServiceFacadeImportPattern = {
  regex:
    "^(?:~/services/apiService|(?:\\.\\./)+(?:services/)?apiService)(?:/index)?$",
  message:
    "Account-site product flows must use ~/services/apiAdapters or account workflow helpers instead of the legacy apiService facade.",
}
const newApiAdapterLegacyApiServiceImportPattern = {
  regex:
    "^(?:~/services/apiService|(?:\\.\\./)+(?:services/)?apiService)(?:$|/(?!newApiFamily(?:$|/)).*)",
  message:
    "New API adapters may import ~/services/apiService/newApiFamily only. Do not depend on the legacy apiService facade or other apiService modules.",
}
const workflowTransitionIconRestrictedImports = [
  {
    name: "lucide-react",
    importNames: ["ExternalLink"],
    message:
      "Use `~/components/icons/WorkflowTransitionIcon` for arrow-up-right workflow/link affordances so the app keeps a single transition glyph.",
  },
]

function restrictedImports(...patterns) {
  return [
    "error",
    {
      paths: workflowTransitionIconRestrictedImports,
      patterns: [heroiconsImportRestrictionPattern, ...patterns],
    },
  ]
}

// Concrete site identities belong to these explicit owners. Shared business
// code should consume metadata/capabilities; type imports stay unrestricted.
const siteTypeImportOwners = [
  "src/services/accountSiteDefinitions/**", // Site metadata and identifiers.
  "src/services/apiAdapters/**", // Capability registration and provider protocols.
  "src/services/apiService/**", // Provider transports and legacy dispatch.
  "src/services/siteDetection/detectSiteType.ts", // Detection identifies providers.
  "src/features/KeyManagement/presentation/accountKeyResourcePresentation.ts", // Provider terminology.
  "src/services/accountSiteOnboarding/contentSession/**", // Provider session validation.
  "src/services/checkin/autoCheckin/providers/**", // Provider check-in implementations.
  "src/services/managedSites/providers/**", // Provider-specific managed-site workflows.
  "src/services/managedSites/runtimeConfig.ts", // Decode provider configuration unions.
  "src/services/preferences/userPreferences.ts", // Stored provider configuration selection.
  "src/services/accounts/accountStorage/sub2ApiAuthPersistence.ts", // Check identity before credential writes.
  "src/services/accounts/migrations/sub2apiAuthMigration.ts", // Historical authentication format.
  "src/services/managedSites/legacyChannelConfigMigration.ts", // Historical numeric channel identities.
  "src/services/models/modelSync/channelModelFilterEvaluator.ts", // Provider credential redaction.
  "src/services/productAnalytics/settings.ts", // Fixed analytics event schema.
  "src/services/siteAnnouncements/providers.ts", // Announcement provider dispatch.
  "src/components/icons/ManagedSiteIcon.tsx", // Provider branding.
  "src/features/AccountManagement/components/AccountDialog/AccessTokenVerificationGuide.tsx", // Provider authentication instructions.
  "src/features/AccountManagement/components/AccountDialog/AccountForm.tsx", // OpenRouter management-key onboarding UI.
  "src/features/AccountManagement/components/AccountDialog/hooks/useOpenRouterAccountOnboarding.ts", // Provider-owned onboarding lifecycle.
  "src/features/BasicSettings/components/tabs/ManagedSite/ManagedSite*.search.ts", // Search entries for provider-specific settings.
  "src/features/ManagedSiteChannels/presentation/managedResourceMigrationPresentation.ts", // Provider-specific migration labels.
  "src/features/ModelList/aihubmixModelList.ts", // Provider catalog presentation.
  "src/features/SiteAnnouncements/utils.ts", // Cached provider identity and source links.
  "src/constants/siteType.ts", // Public compatibility re-export.
  "src/contexts/UserPreferencesContext.tsx", // Default managed-site selection.
  "src/entrypoints/content/messageHandlers/handlers/storage.ts", // Unknown-site input fallback.
  "src/features/AccountManagement/bookmarkImport/candidates.ts", // Unknown detection result.
  "src/features/AccountManagement/bookmarkImport/importAccounts.ts", // Unknown imported account identity.
  "src/features/AccountManagement/components/AccountDialog/autoDetectDraft.ts", // Unknown draft identity.
  "src/features/AccountManagement/components/AccountDialog/models.ts", // Initial draft identity.
  "src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts", // Default identity and explicit provider onboarding results.
  "src/features/AccountManagement/sponsors/catalogActions.ts", // Sponsor identity prefill.
  "src/features/AccountManagement/sponsors/pendingAddAccountIntent.ts", // Sponsor intent validation.
  "src/features/ApiCredentialProfiles/utils/exportShims.ts", // Synthetic account identity for export compatibility.
  "src/features/BasicSettings/components/tabs/ManagedSite/DoneHubSettings.tsx", // Provider settings.
  "src/features/BasicSettings/components/tabs/ManagedSite/ManagedSiteTab.tsx", // Provider settings dispatch.
  "src/features/BasicSettings/components/tabs/ManagedSite/ModelRedirectSettings.tsx", // Default provider selection.
  "src/features/BasicSettings/components/tabs/ManagedSite/NewApiSettings.tsx", // Provider settings.
  "src/features/BasicSettings/components/tabs/ManagedSite/Sub2ApiSettings.tsx", // Provider settings.
  "src/features/BasicSettings/components/tabs/ManagedSite/VeloeraSettings.tsx", // Provider settings.
  "src/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy.ts", // Provider field presentation.
  "src/features/ManagedSiteChannels/presentation/managedResourceTablePolicy.ts", // Provider table presentation.
  "src/features/UnifiedApiGuidance/UnifiedApiGuidanceDevPreview.tsx", // Development fixture.
  "src/services/accountSiteOnboarding/metadata.ts", // Unknown-site metadata fallback.
  "src/services/accounts/accountCreation.ts", // Unknown account identity fallback.
  "src/services/accounts/accountDefaults.ts", // Default account identity.
  "src/services/accounts/accountFormValidation.ts", // Unknown account identity validation.
  "src/services/accounts/accountSiteProfile/contentSessionHint.ts", // Unknown session identity validation.
  "src/services/accounts/accountSiteProfile/profiles.ts", // Default profile.
  "src/services/accounts/accountStorage/accountRefresh.ts", // Unknown identity detection recovery.
  "src/services/accounts/accountUpdate.ts", // Unknown account identity fallback.
  "src/services/accounts/autoDetect/recovery.ts", // Unknown detection recovery.
  "src/services/accounts/siteName.ts", // Unknown site display name.
  "src/services/accounts/utils/siteRouteResolver.ts", // Unknown route fallback.
  "src/services/managedSites/channelMigrationCapabilityRegistry.ts", // Migration capability dispatch.
  "src/services/managedSites/utils/managedSite.ts", // Synthetic account identity for managed-site compatibility.
  "src/services/modelList/accountSources/sub2apiEstimates.ts", // Provider-owned catalog estimate.
  "src/services/productAnalytics/contracts.ts", // Fixed event schema.
  "src/services/productAnalytics/siteEcosystem.ts", // Fixed event schema projection.
  "src/services/siteAnnouncements/storage.ts", // Unknown cached identity fallback.
  "src/services/siteDetection/autoDetectService.ts", // Unknown identity fallback.
]

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
  {
    files: [srcJsFamilyFilePattern],
    rules: {
      "no-restricted-imports": restrictedImports(
        optionsPageImportRestrictionPattern,
      ),
    },
  },
  // Allow options entrypoint code to depend on options pages.
  {
    files: ["src/entrypoints/options/**/*.{js,cjs,mjs,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports(),
    },
  },
  // Guardrails: migrated New API adapters depend on the newApiFamily bridge,
  // not the legacy dynamic apiService facade or unrelated apiService modules.
  {
    files: ["src/services/apiAdapters/newApi/**/*.{js,cjs,mjs,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports(
        optionsPageImportRestrictionPattern,
        newApiAdapterLegacyApiServiceImportPattern,
      ),
    },
  },
  // Guardrails: keep direct backend-specific apiService imports behind adapters
  // or workflow owner modules while the account-site adapter migration proceeds.
  {
    files: [srcJsFamilyFilePattern],
    ignores: [
      "src/services/apiService/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/services/apiAdapters/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/services/checkin/autoCheckin/providers/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/services/managedSites/providers/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/services/models/modelSync/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/features/BasicSettings/components/tabs/ManagedSite/**/*.{js,cjs,mjs,jsx,ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": restrictedImports(
        apiServiceBackendImplementationImportPattern,
      ),
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
      "no-restricted-imports": restrictedImports(
        apiServiceBackendImplementationImportPattern,
        accountSiteMainlineApiServiceFacadeImportPattern,
      ),
    },
  },
  // Guardrails: AI API protocol modules must not depend on account-site apiService internals.
  {
    files: ["src/services/aiApi/**/*.{js,cjs,mjs,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports(
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
      ),
    },
  },
  {
    files: [srcJsFamilyFilePattern],
    ignores: siteTypeImportOwners,
    rules: {
      // Keep this named-import policy separate from the core rule above so
      // narrower legacy-import overrides cannot erase either boundary.
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex:
                "(?:^|/)(?:constants/siteType|accountSiteDefinitions/(?:identifiers|siteTypes))(?:\\.ts)?$",
              importNames: ["SITE_TYPES"],
              allowTypeImports: true,
              message:
                "Do not import SITE_TYPES into shared business code. Use site metadata/capabilities; explicit provider owners belong in siteTypeImportOwners in eslint.config.js.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [srcJsFamilyFilePattern],
    ignores: [
      "src/lib/notify/**",
      "src/components/ThemeAwareToaster.tsx",
      "src/entrypoints/content/redemptionAssist/components/RedemptionToaster.tsx",
    ],
    plugins: {
      notifications: {
        rules: {
          "use-facade": {
            meta: {
              type: "problem",
              schema: [],
              messages: {
                direct:
                  "Use ~/lib/notify (or ~/lib/notify/content in content scripts) instead of react-hot-toast.",
              },
            },
            create(context) {
              const check = (node) => {
                if (/^react-hot-toast(?:\/|$)/.test(node.source?.value ?? "")) {
                  context.report({ node, messageId: "direct" })
                }
              }
              return {
                ImportDeclaration: check,
                ImportExpression: check,
                ExportNamedDeclaration: check,
                ExportAllDeclaration: check,
              }
            },
          },
        },
      },
    },
    rules: { "notifications/use-facade": "error" },
  },
  { rules },
  eslintConfigPrettier,
])
