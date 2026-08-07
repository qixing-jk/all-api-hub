import { GERMAN_LANG, SPANISH_LATIN_AMERICA_LANG } from "~/constants/i18n"

// Automatically import all locale JSON files under `src/locales`.
const modules = import.meta.glob("~/locales/*/*.json", { eager: true })

export const resources: Record<string, Record<string, any>> = {}

for (const path in modules) {
  const match = path.match(/locales\/([^/]+)\/([^/]+)\.json$/)
  if (!match) continue

  const [, lang, ns] = match
  resources[lang] ??= {}
  resources[lang][ns] = (modules[path] as any).default
}

/**
 * Convert i18next language codes into dayjs-compatible locale names.
 */
export function mapToDayjsLocale(lng: string): string {
  const normalized = lng.toLowerCase().replace("_", "-")
  if (normalized === GERMAN_LANG || normalized.startsWith(`${GERMAN_LANG}-`)) {
    return GERMAN_LANG
  }
  return normalized === SPANISH_LATIN_AMERICA_LANG ? "es" : normalized
}
