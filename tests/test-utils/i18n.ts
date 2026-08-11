import { createInstance, type Resource } from "i18next"
import { initReactI18next } from "react-i18next"

export const testI18n = createInstance()

/** Creates an isolated translator backed by real locale resources. */
export async function createResourceTestI18n(resources: Resource, lng = "en") {
  const instance = createInstance()
  await instance.init({
    lng,
    fallbackLng: lng,
    resources,
    interpolation: { escapeValue: false },
  })
  return instance
}

await testI18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  appendNamespaceToMissingKey: true,
  parseMissingKeyHandler: (key: string) => key,
  react: { useSuspense: false },
  interpolation: {
    escapeValue: false,
  },
  missingInterpolationHandler: () => "",
})
