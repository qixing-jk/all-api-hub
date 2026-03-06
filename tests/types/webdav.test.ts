import { describe, expect, it } from "vitest"

import {
  DEFAULT_WEBDAV_SYNC_DATA_SELECTION,
  isWebdavSyncDataSelectionEmpty,
  resolveWebdavSyncDataSelection,
} from "~/types/webdav"

describe("resolveWebdavSyncDataSelection", () => {
  it("defaults to all-checked when missing", () => {
    expect(resolveWebdavSyncDataSelection(undefined)).toEqual(
      DEFAULT_WEBDAV_SYNC_DATA_SELECTION,
    )
  })

  it("preserves explicit values and fills missing keys as checked", () => {
    expect(
      resolveWebdavSyncDataSelection({
        accounts: false,
        preferences: false,
      }),
    ).toEqual({
      accounts: false,
      bookmarks: true,
      apiCredentialProfiles: true,
      preferences: false,
    })
  })

  it("detects when every sync domain is disabled", () => {
    expect(
      isWebdavSyncDataSelectionEmpty({
        accounts: false,
        bookmarks: false,
        apiCredentialProfiles: false,
        preferences: false,
      }),
    ).toBe(true)

    expect(
      isWebdavSyncDataSelectionEmpty(DEFAULT_WEBDAV_SYNC_DATA_SELECTION),
    ).toBe(false)
  })
})
