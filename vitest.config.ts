import { fileURLToPath } from "node:url"
import path from "path"
import { defineConfig } from "vitest/config"

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const domOnlyTsTests = [
  "tests/entrypoints/content/index.test.ts",
  "tests/entrypoints/content/messageHandlers/utils/capGuard.test.ts",
  "tests/entrypoints/content/messageHandlers/utils/turnstileGuard.test.ts",
  "tests/entrypoints/content/webAiApiCheck/index.test.ts",
  "tests/entrypoints/content/messageHandlers/handlers/storage.test.ts",
  "tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts",
  "tests/services/ldohSiteLookup.background.test.ts",
  "tests/services/shareSnapshotExport.test.ts",
  "tests/utils/browserApi.test.ts",
  "tests/utils/ccSwitch.test.ts",
  "tests/utils/cherryStudio.test.ts",
  "tests/utils/documentTitle.test.ts",
  "tests/utils/importExportUtils.test.ts",
  "tests/utils/navigation.test.ts",
  "tests/utils/url.test.ts",
]

export default defineConfig({
  test: {
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
          include: ["tests/**/*.test.tsx", ...domOnlyTsTests],
          environment: "jsdom",
          setupFiles: [path.resolve(rootDir, "tests/setup.ts")],
        },
      },
      {
        extends: true,
        test: {
          name: "node",
          include: ["tests/**/*.test.ts"],
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
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
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
