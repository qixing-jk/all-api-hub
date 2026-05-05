import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  OPTIONS_SEARCH_ANCHOR_PARAM,
  OPTIONS_SEARCH_HIGHLIGHT_PARAM,
} from "~/entrypoints/options/search/navigation"
import ImportExport from "~/features/ImportExport/ImportExport"
import { WEBDAV_TARGET_IDS } from "~/features/ImportExport/searchTargets"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const { mockedUseImportExport } = vi.hoisted(() => ({
  mockedUseImportExport: vi.fn(),
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

vi.mock("~/utils/core/url", () => ({
  navigateToAnchor: vi.fn(),
}))

vi.mock("~/features/ImportExport/hooks/useImportExport", () => ({
  useImportExport: () => mockedUseImportExport(),
}))

vi.mock("~/features/ImportExport/components/ExportSection", () => ({
  default: () => <section id="export-section">export section</section>,
}))

vi.mock("~/features/ImportExport/components/ImportSection", () => ({
  default: () => <section id="import-section">import section</section>,
}))

vi.mock("~/features/ImportExport/components/WebDAVSettings", () => ({
  default: () => <section id="webdav-url">webdav section</section>,
}))

vi.mock("~/features/ImportExport/components/WebDAVAutoSyncSettings", () => ({
  default: () => <section id="webdav-auto-sync">webdav auto sync</section>,
}))

describe("ImportExport search navigation", () => {
  beforeEach(() => {
    mockedUseImportExport.mockReset()
    mockedUseImportExport.mockReturnValue({
      isExporting: false,
      setIsExporting: vi.fn(),
      isImporting: false,
      importData: "",
      setImportData: vi.fn(),
      handleFileImport: vi.fn(),
      handleImport: vi.fn(),
      validateImportData: () => null,
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

    await waitFor(() => {
      expect(window.location.search).not.toContain("highlight=")
    })

    expect(screen.getByText("webdav section")).toBeInTheDocument()
  })
})
