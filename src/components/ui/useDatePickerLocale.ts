import type { Locale } from "date-fns"
import { useEffect, useState } from "react"

import { loadDatePickerLocale } from "./datePickerLocale"

/** Resolve a controlled locale immediately or lazily load one by language. */
export function useDatePickerLocale(
  locale: Locale | undefined,
  language: string | undefined,
) {
  const [loadedLocale, setLoadedLocale] = useState<Locale | undefined>(locale)

  useEffect(() => {
    if (locale) {
      setLoadedLocale(locale)
      return
    }
    if (!language) {
      setLoadedLocale(undefined)
      return
    }

    let acceptsResult = true
    setLoadedLocale(undefined)
    void loadDatePickerLocale(language)
      .then((nextLocale) => {
        if (acceptsResult) setLoadedLocale(nextLocale)
      })
      .catch(() => {
        // Keep the calendar usable with React DayPicker's English fallback.
      })

    return () => {
      acceptsResult = false
    }
  }, [language, locale])

  return locale ?? loadedLocale
}
