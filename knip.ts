import type { KnipConfig } from "knip"

const config: KnipConfig = {
  // WXT entrypoints are referenced via extension conventions and HTML files,
  // so declare them explicitly instead of relying on Knip defaults.
  entry: [
    "wxt.config.ts",
    "i18next.config.ts",
    "src/entrypoints/background/index.ts",
    "src/entrypoints/content/index.ts",
    "src/entrypoints/options/main.tsx",
    "src/entrypoints/popup/main.tsx",
    "src/entrypoints/sidepanel/main.tsx",
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
    "@wxt-dev/auto-icons",
    "@wxt-dev/module-react",
    "react-devtools",
    "shadcn",
    "web-ext",
  ],
  eslint: {
    config: ["eslint.config.js"],
  },
  vitest: {
    config: ["vitest.config.ts"],
  },
  playwright: true,
}

export default config
