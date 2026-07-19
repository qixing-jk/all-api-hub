import { beforeEach, describe, expect, it, vi } from "vitest"

import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import {
  isExtensionBackground,
  isExtensionOptions,
  isExtensionPopup,
  isExtensionSidePanel,
} from "~/utils/browser"
import { isProtectionBypassFirefoxEnv } from "~/utils/browser/protectionBypass"
import {
  getCurrentTempWindowRequestSource,
  normalizeTempWindowRequestSource,
  resolveTempWindowRequestPolicy,
} from "~/utils/browser/tempWindowRequestSource"

vi.mock("~/utils/browser", () => ({
  isExtensionBackground: vi.fn(),
  isExtensionOptions: vi.fn(),
  isExtensionPopup: vi.fn(),
  isExtensionSidePanel: vi.fn(),
}))

vi.mock("~/utils/browser/protectionBypass", () => ({
  isProtectionBypassFirefoxEnv: vi.fn(),
}))

const mockedIsExtensionBackground = vi.mocked(isExtensionBackground)
const mockedIsExtensionOptions = vi.mocked(isExtensionOptions)
const mockedIsExtensionPopup = vi.mocked(isExtensionPopup)
const mockedIsExtensionSidePanel = vi.mocked(isExtensionSidePanel)
const mockedIsProtectionBypassFirefoxEnv = vi.mocked(
  isProtectionBypassFirefoxEnv,
)

describe("tempWindowRequestSource", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedIsExtensionBackground.mockReturnValue(false)
    mockedIsExtensionOptions.mockReturnValue(false)
    mockedIsExtensionPopup.mockReturnValue(false)
    mockedIsExtensionSidePanel.mockReturnValue(false)
    mockedIsProtectionBypassFirefoxEnv.mockReturnValue(false)
  })

  it.each([
    [TEMP_WINDOW_REQUEST_SOURCES.Popup, true],
    [TEMP_WINDOW_REQUEST_SOURCES.Options, false],
    [TEMP_WINDOW_REQUEST_SOURCES.Sidepanel, false],
    [TEMP_WINDOW_REQUEST_SOURCES.Background, false],
  ])(
    "resolves an explicit %s source with its default minimize policy",
    (tempWindowRequestSource, suppressMinimize) => {
      expect(
        resolveTempWindowRequestPolicy({ tempWindowRequestSource }),
      ).toEqual({
        tempWindowRequestSource,
        suppressMinimize,
        blockedReason: null,
      })
    },
  )

  it("lets an explicit boolean override the source default", () => {
    expect(
      resolveTempWindowRequestPolicy({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        suppressMinimize: false,
      }),
    ).toMatchObject({ suppressMinimize: false })

    expect(
      resolveTempWindowRequestPolicy({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        suppressMinimize: true,
      }),
    ).toMatchObject({ suppressMinimize: true })
  })

  it("ignores non-boolean minimize overrides and uses the source policy", () => {
    expect(
      resolveTempWindowRequestPolicy({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        suppressMinimize: "false",
      }),
    ).toMatchObject({ suppressMinimize: true })
  })

  it("normalizes invalid runtime values to the background source", () => {
    expect(normalizeTempWindowRequestSource("invalid-source")).toBe(
      TEMP_WINDOW_REQUEST_SOURCES.Background,
    )
  })

  it("captures the current surface only when the source is omitted", () => {
    mockedIsExtensionPopup.mockReturnValue(true)

    expect(resolveTempWindowRequestPolicy({})).toMatchObject({
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      suppressMinimize: true,
    })
    expect(
      resolveTempWindowRequestPolicy({
        tempWindowRequestSource: "invalid-source",
      }),
    ).toMatchObject({
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
      suppressMinimize: false,
    })
  })

  it("detects the current surface in popup, options, sidepanel, background order", () => {
    mockedIsExtensionPopup.mockReturnValue(true)
    mockedIsExtensionOptions.mockReturnValue(true)
    mockedIsExtensionSidePanel.mockReturnValue(true)
    mockedIsExtensionBackground.mockReturnValue(true)

    expect(getCurrentTempWindowRequestSource()).toBe(
      TEMP_WINDOW_REQUEST_SOURCES.Popup,
    )

    mockedIsExtensionPopup.mockReturnValue(false)
    expect(getCurrentTempWindowRequestSource()).toBe(
      TEMP_WINDOW_REQUEST_SOURCES.Options,
    )

    mockedIsExtensionOptions.mockReturnValue(false)
    expect(getCurrentTempWindowRequestSource()).toBe(
      TEMP_WINDOW_REQUEST_SOURCES.Sidepanel,
    )

    mockedIsExtensionSidePanel.mockReturnValue(false)
    expect(getCurrentTempWindowRequestSource()).toBe(
      TEMP_WINDOW_REQUEST_SOURCES.Background,
    )
  })

  it("defaults current-surface detection to background", () => {
    expect(getCurrentTempWindowRequestSource()).toBe(
      TEMP_WINDOW_REQUEST_SOURCES.Background,
    )
  })

  it("blocks Firefox popup requests", () => {
    mockedIsProtectionBypassFirefoxEnv.mockReturnValue(true)

    expect(
      resolveTempWindowRequestPolicy({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      }),
    ).toEqual({
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      suppressMinimize: true,
      blockedReason: "firefox_popup_unsupported",
    })
  })

  it.each([
    TEMP_WINDOW_REQUEST_SOURCES.Options,
    TEMP_WINDOW_REQUEST_SOURCES.Sidepanel,
    TEMP_WINDOW_REQUEST_SOURCES.Background,
  ])(
    "allows Firefox requests from the %s source",
    (tempWindowRequestSource) => {
      mockedIsProtectionBypassFirefoxEnv.mockReturnValue(true)

      expect(
        resolveTempWindowRequestPolicy({ tempWindowRequestSource }),
      ).toMatchObject({
        tempWindowRequestSource,
        blockedReason: null,
      })
    },
  )
})
