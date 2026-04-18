import { fireEvent, render as rtlRender, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ExportSection from "~/features/ImportExport/components/ExportSection"
import ImportSection from "~/features/ImportExport/components/ImportSection"
import { WebDAVDecryptPasswordModal } from "~/features/ImportExport/components/WebDAVDecryptPasswordModal"
import { testI18n } from "~~/tests/test-utils/i18n"

const {
  mockHandleExportAll,
  mockHandleExportAccounts,
  mockHandleExportPreferences,
} = vi.hoisted(() => ({
  mockHandleExportAll: vi.fn(),
  mockHandleExportAccounts: vi.fn(),
  mockHandleExportPreferences: vi.fn(),
}))

vi.mock("~/features/ImportExport/utils", () => ({
  handleExportAll: mockHandleExportAll,
  handleExportAccounts: mockHandleExportAccounts,
  handleExportPreferences: mockHandleExportPreferences,
}))

function render(ui: ReactNode) {
  return rtlRender(<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>)
}

describe("ImportExport section components", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("routes export actions to utility helpers", () => {
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

    expect(mockHandleExportAll).toHaveBeenCalledWith(setIsExporting)
    expect(mockHandleExportAccounts).toHaveBeenCalledWith(setIsExporting)
    expect(mockHandleExportPreferences).toHaveBeenCalledWith(setIsExporting)
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
