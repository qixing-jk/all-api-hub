import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DIALOG_MODES } from "~/constants/dialogModes"
import DialogHeader from "~/features/AccountManagement/components/AccountDialog/DialogHeader"

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

describe("AccountDialog DialogHeader", () => {
  it("renders add-mode copy with the sparkles styling", () => {
    const { container } = render(<DialogHeader mode={DIALOG_MODES.ADD} />)

    expect(screen.getByText("title.add")).toBeInTheDocument()
    expect(container.querySelector("svg")).toHaveClass("text-blue-600")
    expect(container.querySelector("svg")).not.toHaveClass("text-emerald-600")
  })

  it("renders edit-mode copy with the pencil styling", () => {
    const { container } = render(<DialogHeader mode={DIALOG_MODES.EDIT} />)

    expect(screen.getByText("title.edit")).toBeInTheDocument()
    expect(container.querySelector("svg")).toHaveClass("text-emerald-600")
    expect(container.querySelector("svg")).not.toHaveClass("text-blue-600")
  })
})
