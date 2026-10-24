import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiCheckSiteAccessControl } from "~/features/WebAiApiCheck/content/ApiCheckSiteAccessControl"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"

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
  beforeEach(() => vi.mocked(sendWebAiApiCheckMessage).mockReset())

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
