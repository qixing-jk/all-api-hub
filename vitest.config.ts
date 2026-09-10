import { fileURLToPath } from "node:url"
import path from "path"
import { defineConfig } from "vitest/config"

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const domOnlyTsTests = [
  "entrypoints/content/index.test.ts",
  "entrypoints/content/redemptionAssist/index.test.ts",
  "entrypoints/content/messageHandlers/utils/capGuard.test.ts",
  "entrypoints/content/messageHandlers/utils/turnstileGuard.test.ts",
  "entrypoints/content/webAiApiCheck/index.test.ts",
  "entrypoints/content/messageHandlers/handlers/storage.test.ts",
  "entrypoints/content/messageHandlers/handlers/accountIdentityVerification.test.ts",
  "entrypoints/options/pages/ModelList/useFilteredModels.test.ts",
  "services/ldohSiteLookup.background.test.ts",
  "services/shareSnapshotExport.test.ts",
  "utils/browserApi.test.ts",
  "utils/ccSwitch.test.ts",
  "utils/cherryStudio.test.ts",
  "utils/documentTitle.test.ts",
  "utils/importExportUtils.test.ts",
  "utils/navigation.test.ts",
  "utils/url.test.ts",
]

export default defineConfig({
  test: {
    dir: "tests",
    pool: "threads",

    testTimeout: 15_000,
    hookTimeout: 15_000,

    // Global test APIs (describe, it, expect, etc.)
    globals: true,

    projects: [
      {
        extends: true,
        test: {
          name: "dom",
          include: ["**/*.test.tsx", ...domOnlyTsTests],
          environment: "jsdom",
          setupFiles: [path.resolve(rootDir, "tests/setup.ts")],
        },
      },
      {
        extends: true,
        test: {
          name: "node",
          include: ["**/*.test.ts"],
          exclude: domOnlyTsTests,
          environment: "node",
          setupFiles: [path.resolve(rootDir, "tests/setup.node.ts")],
        },
      },
    ],

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.d.ts",
        "**/*.config.*",
        "**/node_modules/**",
        "**/.wxt/**",
        "**/dist/**",
        "**/.output/**",
        "**/e2e/**",
        "**/__tests__/**",
      ],
      // Coverage thresholds (can be adjusted - starting with lower targets)
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
      },
    },

    // Exclude patterns
    exclude: [
      "**/node_modules/**",
      "**/.wxt/**",
      "**/dist/**",
      "**/.output/**",
      "**/e2e/**",
      "**/diagnostics-results/**",
      "**/test-results/**",
      "**/*.config.*",
    ],
  },

  resolve: {
    alias: {
      // Mirror WXT/Vite path aliases
      "~": path.resolve(rootDir, "src"),
      "~~": path.resolve(rootDir, "."),
    },
  },
})
