import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { LoadingIndicator } from "~/features/AccountManagement/components/CopyKeyDialog/LoadingIndicator"

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => `ui:${key}`,
    }),
  }
})

describe("LoadingIndicator", () => {
  it("uses the shared loading presentation without legacy purple colors", () => {
    render(<LoadingIndicator />)

    const loadingStatus = screen.getByRole("status", {
      name: "ui:dialog.copyKey.loading",
    })

    expect(loadingStatus).toHaveClass("text-[var(--spinner-default-color)]")
    expect(loadingStatus).not.toHaveClass(
      "border-purple-300",
      "border-t-purple-600",
    )
    expect(screen.getByText("ui:dialog.copyKey.loading")).toBeVisible()
  })
})
