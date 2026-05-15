import { fireEvent, render as rtlRender, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ExportSection from "~/features/ImportExport/components/ExportSection"
import { accountStorage } from "~/services/accounts/accountStorage"
import { userPreferences } from "~/services/preferences/userPreferences"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/events"
import { testI18n } from "~~/tests/test-utils/i18n"

const {
  completeProductAnalyticsActionMock,
  loggerErrorMock,
  startProductAnalyticsActionMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  completeProductAnalyticsActionMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: startProductAnalyticsActionMock,
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    exportData: vi.fn(),
  },
}))

vi.mock("~/services/tags/tagStorage", () => ({
  tagStorage: {
    exportTagStore: vi.fn(),
  },
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    exportPreferences: vi.fn(),
  },
}))

vi.mock("~/services/managedSites/channelConfigStorage", () => ({
  channelConfigStorage: {
    exportConfigs: vi.fn(),
  },
}))

vi.mock(
  "~/services/apiCredentialProfiles/apiCredentialProfilesStorage",
  () => ({
    apiCredentialProfilesStorage: {
      exportConfig: vi.fn(),
    },
  }),
)

function render(ui: ReactNode) {
  return rtlRender(<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>)
}

describe("ExportSection analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
    ;(
      accountStorage.exportData as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error("export failed"))
    ;(
      userPreferences.exportPreferences as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error("export failed"))
  })

  it.each([
    ["full backup", 0],
    ["account data", 1],
    ["user settings", 2],
  ])(
    "completes failed %s export analytics as failure with unknown category",
    async (_label, buttonIndex) => {
      const setIsExporting = vi.fn()

      render(
        <ExportSection isExporting={false} setIsExporting={setIsExporting} />,
      )

      fireEvent.click(
        screen.getAllByRole("button", {
          name: "common:actions.export",
        })[buttonIndex],
      )

      await vi.waitFor(() => {
        expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
          PRODUCT_ANALYTICS_RESULTS.Failure,
          { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
        )
      })
      expect(completeProductAnalyticsActionMock).not.toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    },
  )
})
