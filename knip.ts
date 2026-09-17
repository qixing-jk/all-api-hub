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
    // The suffix marks shipped entrypoints for --production; tests and build
    // tooling above/below remain entrypoints only in the default audit.
    "src/entrypoints/appearance-bootstrap.ts!",
    "src/entrypoints/background/index.ts!",
    "src/entrypoints/content/index.ts!",
    // Injected by URL as a web-accessible resource, not a static import.
    "src/entrypoints/openrouter-clerk-session.ts!",
    "src/entrypoints/options/main.tsx!",
    "src/entrypoints/popup/main.tsx!",
    "src/entrypoints/sidepanel/main.tsx!",
    // WXT discovers this local build module from the configured modulesDir.
    "src/locales/runtime-assets.ts",
    "tests/**/*.test.{ts,tsx}",
    "tests/setup.ts",
    "tests/setup.node.ts",
    "tests/setup.shared.ts",
    // Playwright runs this through the build dependency project in
    // playwright.config.ts, which Knip does not discover as a static import.
    "e2e/setup/build.setup.ts",
  ],
  project: [
    "src/**/*.{ts,tsx}!",
    // WXT build module; its locale tooling is not shipped runtime code.
    "!src/locales/runtime-assets.ts!",
    "tests/**/*.{ts,tsx}",
    "e2e/**/*.{ts,tsx}",
    "scripts/**/*.{js,mjs}",
    "plugins/**/*.{ts,mjs}",
    "*.{js,mjs,ts}",
  ],
  ignoreDependencies: [
    // @lobehub/ui 5 requires this compatible peer provider, while application
    // code consumes the Lobe stack only through @lobehub/icons.
    "@lobehub/fluent-emoji",
    // Ambient extension/browser types are consumed globally by TypeScript.
    "@types/chrome",
    "@types/firefox-webext-browser",
    "@types/webextension-polyfill",
    // Loaded by Vitest's configured V8 coverage provider.
    "@vitest/coverage-v8",
    // Loaded by string from wxt.config.ts modules.
    "@wxt-dev/auto-icons",
    "@wxt-dev/module-react",
    // Spawned by plugins/react-devtools-auto.ts during development.
    "react-devtools",
    // On-demand UI generator configured by components.json.
    "shadcn",
    // Imported as CSS from src/styles/style.css, outside the TS graph.
    "tw-animate-css",
  ],
  // Exported props and signature types may be used only within their owning
  // module. Keep checking types that have no internal or external consumers.
  ignoreExportsUsedInFile: { interface: true, type: true },
  ignoreIssues: {
    // Reusable UI primitives intentionally expose a composable API beyond
    // current application usage. Business components are checked normally.
    "src/components/ui/**": ["exports", "types"],
    // Design-system tokens accompany the shared UI primitive API.
    "src/constants/designTokens.ts": ["exports"],
    // Both transport names and legacy service names are actively imported.
    "src/services/apiTransport/type.ts": ["duplicates"],
  },
  eslint: {
    config: ["eslint.config.js"],
  },
  vitest: false,
  playwright: true,
}

export default config
