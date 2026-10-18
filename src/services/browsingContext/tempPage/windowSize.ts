import { normalizeTempWindowFallbackPreferences } from "~/services/preferences/tempWindowFallbackPreferences"
import { userPreferences } from "~/services/preferences/userPreferences"

/** Reads window dimensions at creation time, including for legacy preferences. */
export async function resolveTempWindowSize() {
  let storedPreferences: unknown
  try {
    storedPreferences = (await userPreferences.getPreferences())
      .tempWindowFallback
  } catch {
    // Window creation remains available when preference storage is unavailable.
  }
  const { windowWidth, windowHeight } =
    normalizeTempWindowFallbackPreferences(storedPreferences)
  return { width: windowWidth, height: windowHeight }
}
