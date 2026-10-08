import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DuplicateChannelWarningDialog } from "~/features/ManagedSiteChannels/editor/ChannelDialog/components/DuplicateChannelWarningDialog"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? JSON.stringify({ key, options }) : key,
  }),
}))

describe("DuplicateChannelWarningDialog", () => {
  it("renders the existing channel name and triggers both footer actions", () => {
    const onCancel = vi.fn()
    const onContinue = vi.fn()

    render(
      <DuplicateChannelWarningDialog
        isOpen
        existingChannelName="Primary Route"
        onCancel={onCancel}
        onContinue={onContinue}
      />,
    )

    expect(
      screen.getByText(
        JSON.stringify({
          key: "channelDialog:warnings.channelExists.description",
          options: {
            channelName: "Primary Route",
          },
        }),
      ),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "common:actions.cancel",
      }),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "channelDialog:warnings.channelExists.actions.continue",
      }),
    )

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it("falls back to an empty channel name when no existing name is available", () => {
    render(
      <DuplicateChannelWarningDialog
        isOpen
        existingChannelName={null}
        onCancel={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    expect(
      screen.getByText(
        JSON.stringify({
          key: "channelDialog:warnings.channelExists.description",
          options: {
            channelName: "",
          },
        }),
      ),
    ).toBeInTheDocument()
  })
})
