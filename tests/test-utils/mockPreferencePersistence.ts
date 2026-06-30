import { vi } from "vitest"

import { CURRENT_PREFERENCES_VERSION } from "~/services/preferences/migrations/preferencesMigration"
import {
  DEFAULT_PREFERENCES,
  type PreferenceWriteResult,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import { patchTouchesSharedPreferences } from "~/services/preferences/webdavSharedPreferences"
import type { DeepPartial } from "~/types/utils"
import { deepOverride } from "~/utils"

type PersistenceMock = ReturnType<typeof vi.fn>

type PreferencePersistenceMocks = {
  getPreferences: PersistenceMock
  savePreferences: PersistenceMock
  savePreferencesWithResult: PersistenceMock
}

export function createPersistedPreferencesFixture(
  overrides?: DeepPartial<UserPreferences>,
): UserPreferences {
  return overrides
    ? deepOverride(structuredClone(DEFAULT_PREFERENCES), overrides)
    : structuredClone(DEFAULT_PREFERENCES)
}

export function setupMockPreferencePersistence(
  mocks: PreferencePersistenceMocks,
  initialPreferences = createPersistedPreferencesFixture(),
) {
  let persistedPreferences = structuredClone(initialPreferences)

  const getPersistedPreferences = () => structuredClone(persistedPreferences)

  const setPersistedPreferences = (nextPreferences: UserPreferences) => {
    persistedPreferences = structuredClone(nextPreferences)
  }

  const createSuccessResult = (
    preferences = getPersistedPreferences(),
  ): PreferenceWriteResult => ({
    ok: true,
    preferences,
  })

  mocks.getPreferences.mockImplementation(async () => getPersistedPreferences())
  mocks.savePreferencesWithResult.mockImplementation(
    async (updates, options) => {
      if (
        typeof options?.expectedLastUpdated === "number" &&
        Number.isFinite(options.expectedLastUpdated) &&
        persistedPreferences.lastUpdated !== options.expectedLastUpdated
      ) {
        return {
          ok: false,
          reason: {
            type: "stale",
            expectedLastUpdated: options.expectedLastUpdated,
            actualLastUpdated: persistedPreferences.lastUpdated,
          },
        } satisfies PreferenceWriteResult
      }

      const nextLastUpdated = persistedPreferences.lastUpdated + 1
      const nextSharedPreferencesLastUpdated = patchTouchesSharedPreferences(
        updates,
      )
        ? nextLastUpdated
        : persistedPreferences.sharedPreferencesLastUpdated

      persistedPreferences = deepOverride(persistedPreferences, updates)
      persistedPreferences.lastUpdated = nextLastUpdated
      persistedPreferences.sharedPreferencesLastUpdated =
        nextSharedPreferencesLastUpdated
      persistedPreferences.preferencesVersion = CURRENT_PREFERENCES_VERSION
      return createSuccessResult()
    },
  )
  mocks.savePreferences.mockImplementation(async (updates, options) => {
    return await mocks.savePreferencesWithResult(updates, options)
  })

  return {
    getPersistedPreferences,
    setPersistedPreferences,
  }
}
