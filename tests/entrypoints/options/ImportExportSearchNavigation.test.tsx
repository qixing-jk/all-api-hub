import { act } from "@testing-library/react"
import { useEffect, useState, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import ImportExport from "~/features/ImportExport/ImportExport"
import { WEBDAV_TARGET_IDS } from "~/features/ImportExport/searchTargets"
import {
  OPTIONS_SEARCH_ANCHOR_PARAM,
  OPTIONS_SEARCH_HIGHLIGHT_PARAM,
} from "~/features/OptionsSearch/navigation"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const { mockedUseImportExport, mockedWebDAVSettings } = vi.hoisted(() => ({
  mockedUseImportExport: vi.fn(),
  mockedWebDAVSettings: vi.fn(),
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import("~/contexts/UserPreferencesContext")

  return {
    ...actual,
    UserPreferencesProvider: ({ children }: { children: ReactNode }) =>
      children,
  }
})

vi.mock("~/components/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock("~/features/ImportExport/backup/useImportExport", () => ({
  useImportExport: () => mockedUseImportExport(),
}))

vi.mock("~/features/ImportExport/backup/ExportSection", () => ({
  default: () => <section id="export-section">export section</section>,
}))

vi.mock("~/features/ImportExport/backup/ImportSection", () => ({
  default: () => <section id="import-section">import section</section>,
}))

vi.mock("~/features/ImportExport/webdav/WebDAVSettings", () => ({
  default: () => mockedWebDAVSettings(),
}))

vi.mock("~/features/ImportExport/cloudSync/WebDAVAutoSyncSettings", () => ({
  default: () => <section id="webdav-auto-sync">webdav auto sync</section>,
}))

describe("ImportExport search navigation", () => {
  afterEach(() => vi.useRealTimers())

  beforeEach(() => {
    mockedWebDAVSettings.mockReturnValue(
      <section id="webdav-url">webdav section</section>,
    )
    mockedUseImportExport.mockReset()
    mockedUseImportExport.mockReturnValue({
      isExporting: false,
      setIsExporting: vi.fn(),
      isImporting: false,
      importPlan: {
        accounts: "skip",
        apiCredentialProfiles: "skip",
        channelConfigs: "skip",
        preferences: "skip",
      },
      setImportPlan: vi.fn(),
      importData: "",
      setImportData: vi.fn(),
      handleFileImport: vi.fn(),
      handleImport: vi.fn(),
      validation: null,
    })

    window.history.replaceState(
      null,
      "",
      `/options.html?${OPTIONS_SEARCH_ANCHOR_PARAM}=${WEBDAV_TARGET_IDS.url}&${OPTIONS_SEARCH_HIGHLIGHT_PARAM}=${WEBDAV_TARGET_IDS.url}#importExport`,
    )
  })

  it("consumes the one-shot highlight param after scrolling to the target", async () => {
    render(<ImportExport />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await waitFor(() => {
      expect(window.location.search).not.toContain("highlight=")
    })

    expect(screen.getByText("webdav section")).toBeInTheDocument()
  })

  it("clears the highlight param when the target element is missing", async () => {
    window.history.replaceState(
      null,
      "",
      `/options.html?${OPTIONS_SEARCH_ANCHOR_PARAM}=${WEBDAV_TARGET_IDS.url}&${OPTIONS_SEARCH_HIGHLIGHT_PARAM}=missing-target#importExport`,
    )

    render(<ImportExport />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    await waitFor(
      () => {
        expect(window.location.search).not.toContain("highlight=")
      },
      { timeout: 3000 },
    )

    expect(screen.getByText("webdav section")).toBeInTheDocument()
  })

  it("scrolls only once when anchor and highlight share a destination", async () => {
    vi.useFakeTimers()
    render(<ImportExport />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    const target = screen.getByText("webdav section")
    const scroll = vi.spyOn(target, "scrollIntoView")
    scroll.mockClear()

    await act(() => vi.advanceTimersByTimeAsync(1000))

    expect(scroll).toHaveBeenCalledTimes(1)
    expect(target).toHaveClass("ring-theme-500")
    expect(new URLSearchParams(window.location.search).get("anchor")).toBe(
      "webdav-url",
    )
    expect(window.location.search).not.toContain("highlight=")
    scroll.mockRestore()
  })

  it("highlights a destination that mounts after the old fixed delay", async () => {
    vi.useFakeTimers()
    function DelayedSettings() {
      const [ready, setReady] = useState(false)
      useEffect(() => {
        const timer = window.setTimeout(() => setReady(true), 400)
        return () => window.clearTimeout(timer)
      }, [])
      return ready ? <section id="webdav-url">delayed webdav</section> : null
    }
    mockedWebDAVSettings.mockImplementation(() => <DelayedSettings />)
    render(<ImportExport />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    await act(() => vi.advanceTimersByTimeAsync(500))
    await act(() => vi.advanceTimersByTimeAsync(100))

    expect(screen.getByText("delayed webdav")).toHaveClass("ring-theme-500")
    expect(window.location.search).not.toContain("highlight=")
  })

  it("cancels the old destination when a newer request arrives", async () => {
    vi.useFakeTimers()
    render(<ImportExport />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    act(() => {
      window.history.replaceState(
        null,
        "",
        "/options.html?anchor=import-section&highlight=import-section#importExport",
      )
      window.dispatchEvent(new Event("hashchange"))
    })
    await act(() => vi.advanceTimersByTimeAsync(1000))

    expect(screen.getByText("import section")).toHaveClass("ring-theme-500")
    expect(screen.getByText("webdav section")).not.toHaveClass("ring-theme-500")
  })

  it("cleans up an active highlight on unmount", async () => {
    vi.useFakeTimers()
    const view = render(<ImportExport />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    await act(() => vi.advanceTimersByTimeAsync(100))
    const target = screen.getByText("webdav section")
    expect(target).toHaveClass("ring-theme-500")

    view.unmount()

    expect(target).not.toHaveClass("ring-theme-500")
  })

  it("does not scroll after the page unmounts before its landing frame", async () => {
    vi.useFakeTimers()
    const view = render(<ImportExport />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    const target = screen.getByText("webdav section")
    const scroll = vi.spyOn(target, "scrollIntoView")
    scroll.mockClear()

    view.unmount()
    await act(() => vi.advanceTimersByTimeAsync(2500))

    expect(scroll).not.toHaveBeenCalled()
    scroll.mockRestore()
  })
})
