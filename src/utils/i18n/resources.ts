import type { i18n, Resource, ResourceLanguage } from "i18next"

import {
  DEFAULT_LANG,
  getAppLocaleAssetPath,
  type SupportedUiLanguage,
} from "~/constants/i18n"
import { getExtensionResourceUrl } from "~/utils/browser/extensionResourceUrl"

import { createCachedLocaleLoader } from "./createCachedLocaleLoader"

/** Return whether a fetched locale payload has a namespace map shape. */
function isResourceLanguage(value: unknown): value is ResourceLanguage {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Fetch and validate one generated language asset. */
async function fetchLanguageResource(
  language: SupportedUiLanguage,
): Promise<ResourceLanguage> {
  const response = await fetch(
    getExtensionResourceUrl(getAppLocaleAssetPath(language)),
  )

  if (!response.ok) {
    throw new Error(
      `Failed to load locale asset for ${language} (${response.status})`,
    )
  }

  const resource: unknown = await response.json()
  if (!isResourceLanguage(resource)) {
    throw new Error(`Locale asset for ${language} is not a JSON object`)
  }

  return resource
}

const loadLanguageResource = createCachedLocaleLoader(fetchLanguageResource)

/**
 * Load only the requested UI language and the default fallback language.
 */
export async function loadAppLanguageResources(
  language: SupportedUiLanguage,
): Promise<Resource> {
  const languages: SupportedUiLanguage[] =
    language === DEFAULT_LANG ? [DEFAULT_LANG] : [language, DEFAULT_LANG]
  const resourceEntries = await Promise.all(
    languages.map(async (resourceLanguage) => [
      resourceLanguage,
      await loadLanguageResource(resourceLanguage),
    ]),
  )

  return Object.fromEntries(resourceEntries)
}

/**
 * Add lazily loaded language namespaces to an initialized i18next instance.
 */
export function installAppLanguageResources(
  instance: i18n,
  resources: Resource,
) {
  for (const [language, namespaces] of Object.entries(resources)) {
    for (const [namespace, resource] of Object.entries(namespaces)) {
      instance.addResourceBundle(language, namespace, resource, true, true)
    }
  }
}

/**
 * Load and install a language before switching so no translation keys flash.
 */
export async function changeAppLanguage(
  instance: i18n,
  language: SupportedUiLanguage,
) {
  installAppLanguageResources(
    instance,
    await loadAppLanguageResources(language),
  )
  await instance.changeLanguage(language)
}
