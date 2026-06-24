import { describe, expect, it } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  dataBackupSearchControls,
  dataBackupSearchSections,
} from "~/features/ImportExport/DataBackup.search"
import {
  importExportPageSearchControls,
  importExportPageSearchSections,
} from "~/features/ImportExport/ImportExportPage.search"
import {
  WEBDAV_AUTO_SYNC_TARGET_IDS,
  WEBDAV_TARGET_IDS,
} from "~/features/ImportExport/searchTargets"

describe("import/export search definitions", () => {
  it("registers WebDAV sections in both data backup and import/export surfaces", () => {
    expect(dataBackupSearchSections.map((section) => section.targetId)).toEqual(
      expect.arrayContaining([
        WEBDAV_TARGET_IDS.root,
        WEBDAV_AUTO_SYNC_TARGET_IDS.root,
      ]),
    )
    expect(
      importExportPageSearchSections.map((section) => [
        section.pageId,
        section.targetId,
      ]),
    ).toContainEqual([MENU_ITEM_IDS.IMPORT_EXPORT, WEBDAV_TARGET_IDS.root])
  })

  it("registers standalone WebDAV setup controls for direct search navigation", () => {
    expect(
      importExportPageSearchControls.map((control) => [
        control.id,
        control.targetId,
        control.titleKey,
      ]),
    ).toEqual(
      expect.arrayContaining([
        [
          "control:import-export-webdav-url",
          WEBDAV_TARGET_IDS.url,
          "importExport:webdav.webdavUrl",
        ],
        [
          "control:webdav-sync-data-bookmarks",
          WEBDAV_TARGET_IDS.syncDataBookmarks,
          "importExport:webdav.syncData.bookmarks",
        ],
        [
          "control:webdav-upload-backup",
          WEBDAV_TARGET_IDS.uploadBackup,
          "importExport:webdav.uploadBackup",
        ],
      ]),
    )
  })

  it("keeps data-backup WebDAV controls aligned with the same rendered targets", () => {
    expect(dataBackupSearchControls.map((control) => control.targetId)).toEqual(
      expect.arrayContaining([
        WEBDAV_TARGET_IDS.url,
        WEBDAV_TARGET_IDS.syncDataBookmarks,
        WEBDAV_TARGET_IDS.uploadBackup,
      ]),
    )
  })
})
