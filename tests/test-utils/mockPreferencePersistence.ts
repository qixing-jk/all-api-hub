import { vi } from "vitest"

import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
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

  mocks.getPreferences.mockImplementation(async () => getPersistedPreferences())
  mocks.savePreferencesWithResult.mockImplementation(async (updates) => {
    persistedPreferences = deepOverride(persistedPreferences, updates)
    persistedPreferences.lastUpdated += 1
    return getPersistedPreferences()
  })
  mocks.savePreferences.mockImplementation(async (updates, options) => {
    const savedPreferences = await mocks.savePreferencesWithResult(
      updates,
      options,
    )
    return savedPreferences !== null
  })

  return {
    getPersistedPreferences,
    setPersistedPreferences,
  }
}
