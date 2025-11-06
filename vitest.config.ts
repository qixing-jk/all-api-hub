import { fileURLToPath } from "node:url"
import path from "path"
import { defineConfig } from "vitest/config"

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    // Test environment
    environment: "jsdom",

    // Setup files to run before tests
    setupFiles: ["./tests/setup.ts"],

    // Global test APIs (describe, it, expect, etc.)
    globals: true,

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: [
        "components/**/*.{ts,tsx}",
        "contexts/**/*.{ts,tsx}",
        "features/**/*.{ts,tsx}",
        "hooks/**/*.{ts,tsx}",
        "services/**/*.{ts,tsx}",
        "utils/**/*.{ts,tsx}"
      ],
      exclude: [
        "**/*.d.ts",
        "**/*.config.*",
        "**/node_modules/**",
        "**/.wxt/**",
        "**/dist/**",
        "**/.output/**",
        "**/e2e/**",
        "**/__tests__/**"
      ],
      // Coverage thresholds (can be adjusted - starting with lower targets)
      thresholds: {
        global: {
          statements: 5,
          branches: 5,
          functions: 5,
          lines: 5
        }
      }
    },

    // Exclude patterns
    exclude: [
      "**/node_modules/**",
      "**/.wxt/**",
      "**/dist/**",
      "**/.output/**",
      "**/e2e/**",
      "**/*.config.*"
    ]
  },

  resolve: {
    alias: {
      // Mirror WXT/Vite path aliases
      "~": path.resolve(rootDir, ".")
    }
  }
})
