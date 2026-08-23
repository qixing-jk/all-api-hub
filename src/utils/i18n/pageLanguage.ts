import dayjs from "dayjs"
import type { i18n } from "i18next"

import type { SupportedUiLanguage } from "~/constants"

import { loadDayjsLocale } from "./dayjsLocale"
import {
  installAppLanguageResources,
  loadAppLanguageResources,
} from "./resources"

let latestLanguageRequest = 0

/**
 * Prepare page-only locale dependencies, then commit only the latest request.
 */
export async function changePageLanguage(
  instance: i18n,
  language: SupportedUiLanguage,
): Promise<boolean> {
  const requestId = ++latestLanguageRequest
  const [resources, dayjsLocale] = await Promise.all([
    loadAppLanguageResources(language),
    loadDayjsLocale(language),
  ])

  if (requestId !== latestLanguageRequest) return false

  installAppLanguageResources(instance, resources)
  const previousDayjsLocale = dayjs.locale()
  dayjs.locale(dayjsLocale)
  try {
    await instance.changeLanguage(language)
  } catch (error) {
    dayjs.locale(previousDayjsLocale)
    throw error
  }

  if (requestId !== latestLanguageRequest) return false

  return true
}
