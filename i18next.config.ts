import { defineConfig } from "i18next-cli"

import { DEFAULT_LANG, SUPPORTED_UI_LANGUAGES } from "./src/constants/i18n"

const secondaryLanguages = SUPPORTED_UI_LANGUAGES.filter(
  (language) => language !== DEFAULT_LANG,
)

export default defineConfig({
  locales: [DEFAULT_LANG, ...secondaryLanguages],
  extract: {
    input: ["src/**/*.{ts,tsx}"],
    output: (language, namespace = "common") =>
      `src/locales/${language}/${namespace}.json`,
    defaultNS: "common",
    keySeparator: ".",
    nsSeparator: ":",
    functions: ["t", "*.t", "i18next.t"],
    transComponents: ["Trans"],
    useTranslationNames: ["useTranslation"],
    primaryLanguage: DEFAULT_LANG,
    secondaryLanguages,
    indentation: 2,
    sort: true,
    disablePlurals: false,
    removeUnusedKeys: true,
  },
})
