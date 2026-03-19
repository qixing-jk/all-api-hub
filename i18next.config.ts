import { defineConfig } from "i18next-cli"

const LOCALE_DIRECTORY_BY_CLI_LANGUAGE = {
  "zh-CN": "zh_CN",
  en: "en",
} as const

export default defineConfig({
  locales: ["zh-CN", "en"],
  extract: {
    input: ["src/**/*.{ts,tsx}"],
    output: (language, namespace = "common") =>
      `src/locales/${
        LOCALE_DIRECTORY_BY_CLI_LANGUAGE[
          language as keyof typeof LOCALE_DIRECTORY_BY_CLI_LANGUAGE
        ] ?? language
      }/${namespace}.json`,
    defaultNS: "common",
    keySeparator: ".",
    nsSeparator: ":",
    functions: ["t", "*.t", "i18next.t"],
    transComponents: ["Trans"],
    useTranslationNames: ["useTranslation"],
    primaryLanguage: "zh-CN",
    secondaryLanguages: ["en"],
    indentation: 2,
    sort: true,
    disablePlurals: false,
    removeUnusedKeys: true,
  },
})
