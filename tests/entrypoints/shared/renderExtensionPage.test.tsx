// @vitest-environment jsdom

import { act, screen } from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { renderExtensionPage } from "~/entrypoints/shared/renderExtensionPage"

const { i18nReadyMock, resolveI18nReady, setDocumentTitleMock } = vi.hoisted(
  () => {
    let resolveI18nReady!: () => void
    const i18nReadyMock = new Promise<void>((resolve) => {
      resolveI18nReady = resolve
    })

    return {
      i18nReadyMock,
      resolveI18nReady,
      setDocumentTitleMock: vi.fn(),
    }
  },
)

vi.mock("~/utils/i18n", () => ({
  i18nReady: i18nReadyMock,
}))

vi.mock("~/utils/i18n/core", () => ({
  t: (key: string) => key,
}))

vi.mock("~/utils/navigation/documentTitle", () => ({
  setDocumentTitle: setDocumentTitleMock,
}))

describe("renderExtensionPage", () => {
  afterEach(() => {
    document.body.replaceChildren()
    setDocumentTitleMock.mockReset()
  })

  it("sets the localized title and mounts the shared page shell", async () => {
    const root = document.createElement("div")
    root.id = "root"
    document.body.appendChild(root)

    const renderPromise = renderExtensionPage(
      "popup",
      createElement("div", null, "Popup content"),
    )

    expect(setDocumentTitleMock).not.toHaveBeenCalled()
    expect(screen.queryByText("Popup content")).not.toBeInTheDocument()

    resolveI18nReady()
    await act(async () => {
      await renderPromise
    })

    expect(setDocumentTitleMock).toHaveBeenCalledWith("popup")
    expect(screen.getByText("Popup content")).toBeVisible()
  })
})
