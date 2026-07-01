import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useImportExport } from "~/features/ImportExport/hooks/useImportExport"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

const {
  applyPreferenceLanguageMock,
  getLanguageMock,
  importFromBackupObjectMock,
  loggerErrorMock,
  parseBackupSummaryMock,
  loadPreferencesMock,
  startProductAnalyticsActionMock,
  completeProductAnalyticsActionMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  applyPreferenceLanguageMock: vi.fn(),
  getLanguageMock: vi.fn(),
  importFromBackupObjectMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  parseBackupSummaryMock: vi.fn(),
  loadPreferencesMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  completeProductAnalyticsActionMock: vi.fn(),
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

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: startProductAnalyticsActionMock,
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
    parseBackupSummaryMock.mockReturnValue({
      valid: true,
      hasAccounts: false,
      hasPreferences: false,
      hasChannelConfigs: false,
      hasApiCredentialProfiles: false,
    })
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
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
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ImportBackupData,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsImportExportImportSection,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
    )
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

      expect(importFromBackupObjectMock).toHaveBeenCalledWith(
        { version: 3 },
        {
          plan: {
            accounts: "skip",
            apiCredentialProfiles: "skip",
            channelConfigs: "skip",
            preferences: "skip",
          },
        },
      )

      resolveImport?.({ allImported: true, sections: { preferences: true } })
      await importPromise
    })

    expect(toastSuccessMock).toHaveBeenCalledWith(
      "importExport:import.importSuccess",
    )
    expect(loadPreferencesMock).toHaveBeenCalledTimes(1)
    expect(getLanguageMock).toHaveBeenCalledTimes(1)
    expect(applyPreferenceLanguageMock).toHaveBeenCalledWith("ja")
    expect(result.current.isImporting).toBe(false)
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ImportBackupData,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsImportExportImportSection,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )

    importFromBackupObjectMock.mockResolvedValueOnce({
      allImported: false,
      sections: { accounts: true },
    })

    await act(async () => {
      await result.current.handleImport()
    })

    expect(toastSuccessMock).toHaveBeenLastCalledWith(
      "importExport:import.importSelectedSuccess",
    )
    expect(toastSuccessMock).toHaveBeenCalledTimes(2)
    expect(loadPreferencesMock).toHaveBeenCalledTimes(1)
  })

  it("passes the selected section import plan to backup import", async () => {
    importFromBackupObjectMock.mockResolvedValueOnce({ allImported: true })

    const { result } = renderHook(() => useImportExport())

    act(() => {
      result.current.setImportData('{"version":3}')
      result.current.setImportPlan((plan) => ({
        ...plan,
        accounts: "replace",
        preferences: "replace",
      }))
    })

    await act(async () => {
      await result.current.handleImport()
    })

    expect(importFromBackupObjectMock).toHaveBeenCalledWith(
      { version: 3 },
      {
        plan: {
          accounts: "replace",
          apiCredentialProfiles: "skip",
          channelConfigs: "skip",
          preferences: "replace",
        },
      },
    )
  })

  it("updates the default import plan from the parsed backup summary", () => {
    parseBackupSummaryMock.mockReturnValue({
      valid: true,
      hasAccounts: true,
      hasPreferences: true,
      hasChannelConfigs: true,
      hasApiCredentialProfiles: true,
      timestamp: "2026-03-30",
    })

    const { result } = renderHook(() => useImportExport())

    act(() => {
      result.current.setImportData('{"version":3,"accounts":[]}')
    })

    expect(result.current.validation).toEqual(
      expect.objectContaining({
        hasAccounts: true,
        hasPreferences: true,
        hasChannelConfigs: true,
        hasApiCredentialProfiles: true,
      }),
    )
    expect(result.current.importPlan).toEqual({
      accounts: "merge",
      apiCredentialProfiles: "merge",
      channelConfigs: "merge",
      preferences: "skip",
    })
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
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "importExport:import.importSelectedSuccess",
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
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
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      },
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
    expect(completeProductAnalyticsActionMock).toHaveBeenLastCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      },
    )
    expect(result.current.isImporting).toBe(false)
  })

  it("validates parsed summaries and collapses invalid or thrown summaries into a false result", () => {
    const { result } = renderHook(() => useImportExport())

    expect(result.current.validation).toBeNull()

    parseBackupSummaryMock.mockReturnValue({
      valid: true,
      hasAccounts: true,
      hasPreferences: false,
    })

    act(() => {
      result.current.setImportData('{"version":5}')
    })

    expect(result.current.validation).toEqual({
      valid: true,
      hasAccounts: true,
      hasPreferences: false,
    })
    expect(parseBackupSummaryMock).toHaveBeenCalledWith(
      '{"version":5}',
      "common:labels.unknown",
    )

    parseBackupSummaryMock.mockReturnValue(undefined)
    act(() => {
      result.current.setImportData('{"version":6}')
    })
    expect(result.current.validation).toEqual({ valid: false })

    parseBackupSummaryMock.mockImplementation(() => {
      throw new Error("broken summary")
    })
    act(() => {
      result.current.setImportData('{"version":7}')
    })
    expect(result.current.validation).toEqual({ valid: false })
  })
})
