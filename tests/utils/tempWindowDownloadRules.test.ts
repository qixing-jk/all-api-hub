import { describe, expect, it } from "vitest"

import {
  buildTempWindowBlockedDownloadExtensionPattern,
  isTempWindowBlockedDownloadUrl,
  TEMP_WINDOW_DOWNLOAD_BLOCK_RESOURCE_TYPES,
} from "~/utils/browser/tempWindowDownloadRules"

describe("tempWindowDownloadRules", () => {
  it("builds a case-insensitive executable extension pattern", () => {
    const regex = new RegExp(
      `\\.(${buildTempWindowBlockedDownloadExtensionPattern()})$`,
    )

    expect(regex.test("installer.EXE")).toBe(true)
    expect(regex.test("package.msi")).toBe(true)
    expect(regex.test("manual.pdf")).toBe(false)
  })

  it("checks executable suffixes from the URL path only", () => {
    expect(
      isTempWindowBlockedDownloadUrl(
        "https://downloads.example.invalid/file.exe?source=temp",
      ),
    ).toBe(true)
    expect(
      isTempWindowBlockedDownloadUrl(
        "https://downloads.example.invalid/check?file=tool.exe",
      ),
    ).toBe(false)
    expect(isTempWindowBlockedDownloadUrl("not a valid url")).toBe(false)
  })

  it("shares the request resource types used by temp-window download blockers", () => {
    expect(TEMP_WINDOW_DOWNLOAD_BLOCK_RESOURCE_TYPES).toEqual([
      "main_frame",
      "sub_frame",
      "object",
      "xmlhttprequest",
      "other",
    ])
  })
})
