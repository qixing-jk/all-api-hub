import type { KnipConfig } from "knip"

const config: KnipConfig = {
  // WXT entrypoints are referenced via extension conventions and HTML files,
  // so declare them explicitly instead of relying on Knip defaults.
  entry: [
    "wxt.config.ts",
    "i18next.config.ts",
    "vitest.config.ts",
    "scripts/diagnostics/collect-extension-memory.mjs",
    "scripts/diagnostics/compare-extension-memory.mjs",
    "scripts/diagnostics/compare-lazy-loading.mjs",
    "scripts/diagnostics/render-extension-memory-report.mjs",
    "scripts/diagnostics/render-lazy-loading-report.mjs",
    "src/entrypoints/background/index.ts",
    "src/entrypoints/content/index.ts",
    "src/entrypoints/options/main.tsx",
    "src/entrypoints/popup/main.tsx",
    "src/entrypoints/sidepanel/main.tsx",
    "tests/**/*.test.{ts,tsx}",
    "tests/setup.ts",
    "tests/setup.node.ts",
    "tests/setup.shared.ts",
  ],
  project: [
    "src/**/*.{ts,tsx}",
    "tests/**/*.{ts,tsx}",
    "e2e/**/*.{ts,tsx}",
    "scripts/**/*.{js,mjs}",
    "plugins/**/*.ts",
    "*.{js,mjs,ts}",
  ],
  ignoreDependencies: [
    // Ambient extension/browser types are consumed globally by TypeScript.
    "@types/chrome",
    "@types/firefox-webext-browser",
    "@types/webextension-polyfill",
    "@vitest/coverage-v8",
    "@wxt-dev/auto-icons",
    "@wxt-dev/module-react",
    "react-devtools",
    "shadcn",
    "tw-animate-css",
    "vite",
    "web-ext",
  ],
  eslint: {
    config: ["eslint.config.js"],
  },
  vitest: false,
  playwright: true,
}

export default config
