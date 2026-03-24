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
  ignoreIssues: {
    // Shared/public component surfaces are intentionally broader than current
    // local usage; do not let Knip collapse those APIs.
    "src/components/**": ["exports", "types", "duplicates"],
    "src/features/**/components/**": ["exports", "types", "duplicates"],

    // Utility entrypoints often carry semantic names even when current callers
    // are sparse.
    "src/utils/navigation/index.ts": ["exports"],
    "src/utils/browser/index.ts": ["exports"],
    "src/utils/browser/device.ts": ["exports", "types"],

    // Explicitly protected site vocabulary.
    "src/constants/siteType.ts": ["exports"],

    // Site override modules are wired dynamically through getApiService(), so
    // many override exports appear unused to static analysis.
    "src/services/apiService/anyrouter/index.ts": ["exports"],
    "src/services/apiService/doneHub/index.ts": ["exports"],
    "src/services/apiService/octopus/index.ts": ["exports"],
    "src/services/apiService/sub2api/index.ts": ["exports"],
    "src/services/apiService/veloera/index.ts": ["exports"],
    "src/services/apiService/wong/index.ts": ["exports"],
  },
  eslint: {
    config: ["eslint.config.js"],
  },
  vitest: false,
  playwright: true,
}

export default config
