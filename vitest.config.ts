import { fileURLToPath } from "node:url"
import path from "path"
import { defineConfig } from "vitest/config"

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    // Test environment
    environment: "jsdom",

    pool: "threads",

    testTimeout: 15_000,
    hookTimeout: 15_000,

    // Setup files to run before tests
    setupFiles: [path.resolve(rootDir, "tests/setup.ts")],

    // Global test APIs (describe, it, expect, etc.)
    globals: true,

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
        statements: 50,
        branches: 45,
        functions: 50,
        lines: 55,
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
      "**/lazy-loading-compare-results/**",
      "**/extension-memory-diagnostics-results/**",
      "**/extension-memory-compare-results/**",
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
