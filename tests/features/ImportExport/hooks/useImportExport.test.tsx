import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useImportExport } from "~/features/ImportExport/hooks/useImportExport"

const {
  applyPreferenceLanguageMock,
  getLanguageMock,
  importFromBackupObjectMock,
  loggerErrorMock,
  parseBackupSummaryMock,
  loadPreferencesMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  applyPreferenceLanguageMock: vi.fn(),
  getLanguageMock: vi.fn(),
  importFromBackupObjectMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  parseBackupSummaryMock: vi.fn(),
  loadPreferencesMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}))

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) =>
        options?.error ? `${key}:${options.error}` : key,
    }),
  }
})

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => ({
    loadPreferences: loadPreferencesMock,
  }),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getLanguage: getLanguageMock,
  },
}))

vi.mock("~/utils/i18n/applyPreferenceLanguage", () => ({
  applyPreferenceLanguage: (...args: unknown[]) =>
    applyPreferenceLanguageMock(...args),
}))

vi.mock("~/features/ImportExport/utils", () => ({
  importFromBackupObject: (...args: unknown[]) =>
    importFromBackupObjectMock(...args),
  parseBackupSummary: (...args: unknown[]) => parseBackupSummaryMock(...args),
}))

class MockFileReader {
  onload: ((event: { target?: { result?: string } }) => void) | null = null

  readAsText(file: File) {
    const nextResult = file.name.includes("invalid")
      ? "not-json"
      : '{"version":2,"accounts":[]}'
    this.onload?.({ target: { result: nextResult } })
  }
}

describe("useImportExport", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("FileReader", MockFileReader as unknown as typeof FileReader)
    loadPreferencesMock.mockResolvedValue(undefined)
    getLanguageMock.mockResolvedValue("ja")
    applyPreferenceLanguageMock.mockResolvedValue(true)
  })

  it("loads selected backup file text into state and ignores empty file selections", async () => {
    const { result } = renderHook(() => useImportExport())

    act(() => {
      result.current.handleFileImport({
        target: { files: [] },
      } as any)
    })

    expect(result.current.importData).toBe("")

    act(() => {
      result.current.handleFileImport({
        target: {
          files: [
            new File(["ignored"], "backup.json", { type: "application/json" }),
          ],
        },
      } as any)
    })

    await waitFor(() => {
      expect(result.current.importData).toBe('{"version":2,"accounts":[]}')
    })
  })

  it("rejects blank import data before parsing or importing", async () => {
    const { result } = renderHook(() => useImportExport())

    await act(async () => {
      await result.current.handleImport()
    })

    expect(toastErrorMock).toHaveBeenCalledWith(
      "importExport:import.selectFileImport",
    )
    expect(importFromBackupObjectMock).not.toHaveBeenCalled()
    expect(result.current.isImporting).toBe(false)
  })

  it("imports parsed backup data and only shows success for fully imported backups", async () => {
    let resolveImport: ((value: unknown) => void) | undefined
    importFromBackupObjectMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveImport = resolve
        }),
    )

    const { result } = renderHook(() => useImportExport())

    act(() => {
      result.current.setImportData('{"version":3}')
    })

    await act(async () => {
      const importPromise = result.current.handleImport()
      await Promise.resolve()

      expect(importFromBackupObjectMock).toHaveBeenCalledWith({ version: 3 })

      resolveImport?.({ allImported: true })
      await importPromise
    })

    expect(toastSuccessMock).toHaveBeenCalledWith(
      "importExport:import.importSuccess",
    )
    expect(loadPreferencesMock).toHaveBeenCalledTimes(1)
    expect(getLanguageMock).toHaveBeenCalledTimes(1)
    expect(applyPreferenceLanguageMock).toHaveBeenCalledWith("ja")
    expect(result.current.isImporting).toBe(false)

    importFromBackupObjectMock.mockResolvedValueOnce({ allImported: false })

    await act(async () => {
      await result.current.handleImport()
    })

    expect(toastSuccessMock).toHaveBeenCalledTimes(1)
    expect(loadPreferencesMock).toHaveBeenCalledTimes(1)
  })

  it("refreshes and reapplies the persisted language for preference-only imports", async () => {
    importFromBackupObjectMock.mockResolvedValueOnce({
      allImported: false,
      sections: { preferences: true },
    })

    const { result } = renderHook(() => useImportExport())

    act(() => {
      result.current.setImportData('{"version":6}')
    })

    await act(async () => {
      await result.current.handleImport()
    })

    expect(loadPreferencesMock).toHaveBeenCalledTimes(1)
    expect(getLanguageMock).toHaveBeenCalledTimes(1)
    expect(applyPreferenceLanguageMock).toHaveBeenCalledWith("ja")
    expect(toastSuccessMock).not.toHaveBeenCalled()
  })

  it("surfaces format errors for malformed JSON and detailed fallback errors for import failures", async () => {
    const { result } = renderHook(() => useImportExport())

    act(() => {
      result.current.setImportData("not-json")
    })

    await act(async () => {
      await result.current.handleImport()
    })

    expect(loggerErrorMock).toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalledWith(
      "importExport:import.formatError",
    )
    expect(result.current.isImporting).toBe(false)

    const importFailure = new Error("network down")
    importFromBackupObjectMock.mockRejectedValueOnce(importFailure)

    act(() => {
      result.current.setImportData('{"version":4}')
    })

    await act(async () => {
      await result.current.handleImport()
    })

    expect(loggerErrorMock).toHaveBeenCalledWith("Import failed", importFailure)
    expect(toastErrorMock).toHaveBeenLastCalledWith(
      "importExport:import.importFailed:network down",
    )
    expect(result.current.isImporting).toBe(false)
  })

  it("validates parsed summaries and collapses invalid or thrown summaries into a false result", () => {
    const { result } = renderHook(() => useImportExport())

    expect(result.current.validateImportData()).toBeNull()

    parseBackupSummaryMock.mockReturnValueOnce({
      valid: true,
      hasAccounts: true,
      hasPreferences: false,
    })

    act(() => {
      result.current.setImportData('{"version":5}')
    })

    expect(result.current.validateImportData()).toEqual({
      valid: true,
      hasAccounts: true,
      hasPreferences: false,
    })
    expect(parseBackupSummaryMock).toHaveBeenCalledWith(
      '{"version":5}',
      "common:labels.unknown",
    )

    parseBackupSummaryMock.mockReturnValueOnce(undefined)
    expect(result.current.validateImportData()).toEqual({ valid: false })

    parseBackupSummaryMock.mockImplementationOnce(() => {
      throw new Error("broken summary")
    })
    expect(result.current.validateImportData()).toEqual({ valid: false })
  })
})
