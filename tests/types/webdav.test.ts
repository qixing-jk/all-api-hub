import { describe, expect, it } from "vitest"

import {
  DEFAULT_WEBDAV_SYNC_DATA_SELECTION,
  isWebdavSyncDataSelectionEmpty,
  resolveWebdavSyncDataSelection,
} from "~/types/webdav"

describe("resolveWebdavSyncDataSelection", () => {
  it("defaults to all-checked when missing", () => {
    // Arrange

    // Act
    const result = resolveWebdavSyncDataSelection(undefined)

    // Assert
    expect(result).toEqual(DEFAULT_WEBDAV_SYNC_DATA_SELECTION)
  })

  it("preserves explicit values and fills missing keys as checked", () => {
    // Arrange
    const partialSelection = {
      accounts: false,
      preferences: false,
    }

    // Act
    const result = resolveWebdavSyncDataSelection(partialSelection)

    // Assert
    expect(result).toEqual({
      accounts: false,
      bookmarks: true,
      apiCredentialProfiles: true,
      preferences: false,
    })
  })

  it("detects when every sync domain is disabled", () => {
    // Arrange
    const emptySelection = {
      accounts: false,
      bookmarks: false,
      apiCredentialProfiles: false,
      preferences: false,
    }

    // Act
    const isEmptySelection = isWebdavSyncDataSelectionEmpty(emptySelection)
    const isDefaultSelectionEmpty = isWebdavSyncDataSelectionEmpty(
      DEFAULT_WEBDAV_SYNC_DATA_SELECTION,
    )

    // Assert
    expect(isEmptySelection).toBe(true)
    expect(isDefaultSelectionEmpty).toBe(false)
  })
})
