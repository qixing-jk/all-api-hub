import { fireEvent } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ImageLightbox } from "~/components/ui/ImageLightbox"
import { render, screen } from "~~/tests/test-utils/render"

describe("ImageLightbox", () => {
  it("renders nothing when closed", () => {
    render(
      <ImageLightbox
        isOpen={false}
        onClose={vi.fn()}
        src="/test.png"
        alt="Test Image"
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    expect(
      screen.queryByTestId("image-lightbox-content"),
    ).not.toBeInTheDocument()
  })

  it("renders image lightbox when open and invokes onClose on close button click", () => {
    const handleClose = vi.fn()
    render(
      <ImageLightbox
        isOpen={true}
        onClose={handleClose}
        src="/test.png"
        alt="Test Image"
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    const lightbox = screen.getByTestId("image-lightbox-content")
    expect(lightbox).toBeInTheDocument()

    const img = screen.getByAltText("Test Image")
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute("src", "/test.png")

    const closeBtn = screen.getByTestId("image-lightbox-close")
    fireEvent.click(closeBtn)
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it("invokes onClose when clicking the backdrop", () => {
    const handleClose = vi.fn()
    render(
      <ImageLightbox
        isOpen={true}
        onClose={handleClose}
        src="/test.png"
        alt="Test Image"
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    const lightbox = screen.getByTestId("image-lightbox-content")
    fireEvent.click(lightbox)
    expect(handleClose).toHaveBeenCalledTimes(1)
  })
})
