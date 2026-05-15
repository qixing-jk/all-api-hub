import { fireEvent, render as rtlRender, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ExportSection from "~/features/ImportExport/components/ExportSection"
import ImportSection from "~/features/ImportExport/components/ImportSection"
import { WebDAVDecryptPasswordModal } from "~/features/ImportExport/components/WebDAVDecryptPasswordModal"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { testI18n } from "~~/tests/test-utils/i18n"

const {
  mockStartProductAnalyticsAction,
  mockCompleteProductAnalyticsAction,
  mockTrackProductAnalyticsActionStarted,
  mockHandleExportAll,
  mockHandleExportAccounts,
  mockHandleExportPreferences,
} = vi.hoisted(() => ({
  mockStartProductAnalyticsAction: vi.fn(),
  mockCompleteProductAnalyticsAction: vi.fn(),
  mockTrackProductAnalyticsActionStarted: vi.fn(),
  mockHandleExportAll: vi.fn(),
  mockHandleExportAccounts: vi.fn(),
  mockHandleExportPreferences: vi.fn(),
}))

vi.mock("~/features/ImportExport/utils", () => ({
  handleExportAll: mockHandleExportAll,
  handleExportAccounts: mockHandleExportAccounts,
  handleExportPreferences: mockHandleExportPreferences,
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: mockStartProductAnalyticsAction,
  trackProductAnalyticsActionStarted: mockTrackProductAnalyticsActionStarted,
}))

function render(ui: ReactNode) {
  return rtlRender(<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>)
}

describe("ImportExport section components", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStartProductAnalyticsAction.mockReturnValue({
      complete: mockCompleteProductAnalyticsAction,
    })
    mockTrackProductAnalyticsActionStarted.mockResolvedValue(undefined)
    mockHandleExportAll.mockResolvedValue(undefined)
    mockHandleExportAccounts.mockResolvedValue(undefined)
    mockHandleExportPreferences.mockResolvedValue(undefined)
  })

  it("routes export actions to utility helpers", async () => {
    const setIsExporting = vi.fn()

    render(
      <ExportSection isExporting={false} setIsExporting={setIsExporting} />,
    )

    const buttons = screen.getAllByRole("button", {
      name: "common:actions.export",
    })

    fireEvent.click(buttons[0])
    fireEvent.click(buttons[1])
    fireEvent.click(buttons[2])

    expect(mockStartProductAnalyticsAction).toHaveBeenNthCalledWith(1, {
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportFullBackup,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsImportExportExportSection,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(mockStartProductAnalyticsAction).toHaveBeenNthCalledWith(2, {
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportAccountData,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsImportExportExportSection,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(mockStartProductAnalyticsAction).toHaveBeenNthCalledWith(3, {
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportUserSettings,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsImportExportExportSection,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(mockHandleExportAll).toHaveBeenCalledWith(setIsExporting)
    expect(mockHandleExportAccounts).toHaveBeenCalledWith(setIsExporting)
    expect(mockHandleExportPreferences).toHaveBeenCalledWith(setIsExporting)
    await vi.waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledTimes(3)
    })
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith("success")
  })

  it("completes failed export analytics with unknown error category", async () => {
    const setIsExporting = vi.fn()
    mockHandleExportAll.mockRejectedValue(new Error("disk full"))

    render(
      <ExportSection isExporting={false} setIsExporting={setIsExporting} />,
    )

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "common:actions.export",
      })[0],
    )

    await vi.waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        "failure",
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
    })
  })

  it("renders import validation details and forwards input events", () => {
    const setImportData = vi.fn()
    const handleFileImport = vi.fn()
    const handleImport = vi.fn()

    const { rerender } = render(
      <ImportSection
        importData='{"version":2}'
        setImportData={setImportData}
        handleFileImport={handleFileImport}
        handleImport={handleImport}
        isImporting={false}
        validation={{
          valid: true,
          hasAccounts: true,
          hasPreferences: true,
          hasChannelConfigs: true,
          hasApiCredentialProfiles: true,
          timestamp: "2026-03-28",
        }}
      />,
    )

    fireEvent.change(screen.getByDisplayValue('{"version":2}'), {
      target: { value: '{"version":3}' },
    })
    fireEvent.change(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      {
        target: {
          files: [
            new File(["{}"], "backup.json", { type: "application/json" }),
          ],
        },
      },
    )
    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.import" }),
    )
    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.clear" }),
    )

    expect(
      screen.getByText("importExport:import.dataValid"),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/importExport:import\.containsAccountData/),
    ).toBeInTheDocument()
    expect(setImportData).toHaveBeenCalledWith('{"version":3}')
    expect(setImportData).toHaveBeenCalledWith("")
    expect(handleFileImport).toHaveBeenCalledTimes(1)
    expect(handleImport).toHaveBeenCalledTimes(1)
    expect(mockTrackProductAnalyticsActionStarted).not.toHaveBeenCalled()

    rerender(
      <I18nextProvider i18n={testI18n}>
        <ImportSection
          importData=""
          setImportData={setImportData}
          handleFileImport={handleFileImport}
          handleImport={handleImport}
          isImporting
          validation={{ valid: false }}
        />
      </I18nextProvider>,
    )

    expect(
      screen.getByText("importExport:import.dataInvalid"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /common:status\.importing/ }),
    ).toBeDisabled()
  })

  it("toggles decrypt password visibility and respects the decrypting state", () => {
    const onPasswordChange = vi.fn()
    const onSavePasswordChange = vi.fn()
    const onClose = vi.fn()
    const onDecryptAndImport = vi.fn()

    const { rerender } = render(
      <WebDAVDecryptPasswordModal
        isOpen
        decrypting={false}
        password="secret"
        onPasswordChange={onPasswordChange}
        savePassword
        onSavePasswordChange={onSavePasswordChange}
        onClose={onClose}
        onDecryptAndImport={onDecryptAndImport}
      />,
    )

    fireEvent.click(screen.getByLabelText("importExport:webdav.showPassword"))
    expect(screen.getByDisplayValue("secret")).toHaveAttribute("type", "text")

    fireEvent.change(screen.getByDisplayValue("secret"), {
      target: { value: "new-secret" },
    })
    fireEvent.click(screen.getByRole("checkbox"))
    fireEvent.click(
      screen.getByRole("button", {
        name: /importExport:webdav\.encryption\.decryptAction/,
      }),
    )
    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    )

    expect(onPasswordChange).toHaveBeenCalledWith("new-secret")
    expect(onSavePasswordChange).toHaveBeenCalledWith(false)
    expect(onDecryptAndImport).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(
      <I18nextProvider i18n={testI18n}>
        <WebDAVDecryptPasswordModal
          isOpen
          decrypting
          password="secret"
          onPasswordChange={onPasswordChange}
          savePassword={false}
          onSavePasswordChange={onSavePasswordChange}
          onClose={onClose}
          onDecryptAndImport={onDecryptAndImport}
        />
      </I18nextProvider>,
    )

    expect(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", {
        name: /importExport:webdav\.encryption\.decryptAction/,
      }),
    ).toBeDisabled()
  })
})
