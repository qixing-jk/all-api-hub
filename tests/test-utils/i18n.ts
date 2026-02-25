import i18n from "i18next"
import { initReactI18next } from "react-i18next"

export const testI18n = i18n.createInstance()

await testI18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  appendNamespaceToMissingKey: true,
  parseMissingKeyHandler: (key: string) => key,
  react: { useSuspense: false },
  interpolation: {
    escapeValue: false,
  },
})

export default testI18n
