import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { VerificationMediaPreview } from "~/features/Verification/api/VerificationMediaPreview"
import en from "~/locales/en/aiApiVerification.json"
import { API_VERIFICATION_MEDIA_TYPES } from "~/services/verification/aiApiVerification"
import { testI18n } from "~~/tests/test-utils/i18n"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

describe("VerificationMediaPreview", () => {
  beforeAll(() => testI18n.addResourceBundle("en", "aiApiVerification", en))
  afterAll(() => testI18n.removeResourceBundle("en", "aiApiVerification"))
  it("explains a playback error and offers the original video link", async () => {
    render(
      <VerificationMediaPreview
        media={{
          type: API_VERIFICATION_MEDIA_TYPES.Video,
          url: "https://example.com/broken.mp4",
        }}
      />,
    )
    fireEvent.error(await screen.findByLabelText("Generated video preview"))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The preview could not be loaded.",
    )
    expect(
      screen.getByRole("link", { name: "Open generated media" }),
    ).toHaveAttribute("href", "https://example.com/broken.mp4")
  })
  it("provides playback controls for the completed video without autoplay", async () => {
    render(
      <VerificationMediaPreview
        media={{
          type: API_VERIFICATION_MEDIA_TYPES.Video,
          url: "https://example.com/result.mp4",
        }}
      />,
    )
    const player = await screen.findByLabelText("Generated video preview")
    expect(player.tagName).toBe("VIDEO")
    expect(player).toHaveAttribute("src", "https://example.com/result.mp4")
    expect(player).toHaveAttribute("controls")
    expect(player).not.toHaveAttribute("autoplay")
  })
  it("omits the external media link when the media is marked credentialed", async () => {
    render(
      <VerificationMediaPreview
        media={{
          type: API_VERIFICATION_MEDIA_TYPES.Video,
          url: "https://example.com/result.mp4?key=secret",
          credentialed: true,
        }}
      />,
    )
    const player = await screen.findByLabelText("Generated video preview")
    expect(player).toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: "Open generated media" }),
    ).not.toBeInTheDocument()

    fireEvent.error(player)
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The preview could not be loaded.",
    )
    expect(
      screen.queryByRole("link", { name: "Open generated media" }),
    ).not.toBeInTheDocument()
  })
  it("displays inline generated images without dumping base64 into the output", async () => {
    render(
      <VerificationMediaPreview
        media={{
          type: API_VERIFICATION_MEDIA_TYPES.Image,
          url: "data:image/png;base64,aW1hZ2U=",
        }}
      />,
    )
    expect(
      await screen.findByRole("img", { name: "Generated image preview" }),
    ).toHaveAttribute("src", "data:image/png;base64,aW1hZ2U=")
    expect(screen.queryByText(/aW1hZ2U/)).not.toBeInTheDocument()
  })
})
