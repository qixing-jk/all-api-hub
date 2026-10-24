import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiCheckSiteAccessControl } from "~/features/WebAiApiCheck/content/ApiCheckSiteAccessControl"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import { sendRuntimeMessage } from "~/utils/browser/runtimeMessages"

vi.mock("~/utils/browser/runtimeMessages", () => ({
  sendRuntimeMessage: vi.fn(),
}))

vi.mock(
  "~/services/verification/webAiApiCheck/messaging",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/verification/webAiApiCheck/messaging")
    >()),
    sendWebAiApiCheckMessage: vi.fn(),
  }),
)
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe("website participation control", () => {
  const pageUrl = "https://example.com/post"
  beforeEach(() => {
    vi.mocked(sendWebAiApiCheckMessage).mockReset()
    vi.mocked(sendRuntimeMessage).mockReset()
  })

  it("hides the control when loading its site state fails", async () => {
    vi.mocked(sendWebAiApiCheckMessage).mockRejectedValue(new Error("offline"))
    render(<ApiCheckSiteAccessControl pageUrl={pageUrl} />)
    await waitFor(() => expect(sendWebAiApiCheckMessage).toHaveBeenCalledOnce())
    expect(screen.queryByRole("switch")).not.toBeInTheDocument()
  })

  it.each(["rejected", "unsuccessful"])(
    "retains the saved state after a %s site write and supports retry",
    async (failure) => {
      const user = userEvent.setup()
      const message = vi.mocked(sendWebAiApiCheckMessage)
      message.mockResolvedValue({ success: true, siteAllowed: true })
      render(<ApiCheckSiteAccessControl pageUrl={pageUrl} />)
      const control = await screen.findByRole("switch")
      if (failure === "rejected")
        message.mockRejectedValueOnce(new Error("offline"))
      else message.mockResolvedValueOnce({ success: false })
      await user.click(control)
      expect(await screen.findByRole("alert")).toBeVisible()
      expect(control).toBeChecked()
      expect(control).toBeEnabled()
      message.mockResolvedValueOnce({ success: true, siteAllowed: false })
      await user.click(control)
      await waitFor(() => expect(control).not.toBeChecked())
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    },
  )

  it("reports a settings navigation failure", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
      success: true,
      siteAllowed: true,
    })
    vi.mocked(sendRuntimeMessage).mockRejectedValueOnce(new Error("closed"))
    render(<ApiCheckSiteAccessControl pageUrl={pageUrl} />)
    await screen.findByRole("switch")
    await user.click(
      screen.getByRole("button", {
        name: "webAiApiCheck:confirmToast.settings",
      }),
    )
    expect(await screen.findByRole("alert")).toBeVisible()
  })

  it("reenables an excluded website and reflects persisted state", async () => {
    vi.mocked(sendWebAiApiCheckMessage)
      .mockResolvedValueOnce({
        success: true,
        siteAllowed: false,
        autoDetectEnabled: true,
        shouldPrompt: false,
      })
      .mockResolvedValueOnce({
        success: true,
        siteAllowed: true,
        autoDetectEnabled: true,
        shouldPrompt: true,
      })
    render(<ApiCheckSiteAccessControl pageUrl={pageUrl} />)
    const control = await screen.findByRole("switch")
    expect(control).not.toBeChecked()
    await userEvent.click(control)
    await waitFor(() => expect(control).toBeChecked())
    expect(sendWebAiApiCheckMessage).toHaveBeenLastCalledWith(
      WebAiApiCheckMessageTypes.SetSiteAccess,
      { pageUrl, enabled: true },
    )
  })

  it("keeps the actual disabled state when a broader exclusion still applies", async () => {
    vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
      success: true,
      siteAllowed: false,
      autoDetectEnabled: true,
      shouldPrompt: false,
    })
    render(<ApiCheckSiteAccessControl pageUrl={pageUrl} />)
    const control = await screen.findByRole("switch")
    await userEvent.click(control)
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "webAiApiCheck:siteControl.failed",
    )
    expect(control).not.toBeChecked()
    expect(control).toBeEnabled()
  })

  it("does not imply that the website switch enables a global opt-out", async () => {
    vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
      success: true,
      siteAllowed: true,
      autoDetectEnabled: false,
      shouldPrompt: false,
    })
    render(<ApiCheckSiteAccessControl pageUrl={pageUrl} />)
    expect(await screen.findByRole("switch")).toBeChecked()
    expect(
      screen.getByText("webAiApiCheck:siteControl.globalDisabled"),
    ).toBeInTheDocument()
  })
})
