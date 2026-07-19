import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"

import { ModelVendorMark } from "~/features/ModelList/components/ModelVendorMark"
import type { ModelVendorPresentationInput } from "~/features/ModelList/modelVendorPresentation"

vi.mock("@heroicons/react/24/outline", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@heroicons/react/24/outline")>()
  const CpuChipIcon = ({
    size,
    ...props
  }: React.SVGProps<SVGSVGElement> & { size?: string | number }) => (
    <svg role="img" data-mark="generic" data-size={size} {...props} />
  )

  return { ...actual, CpuChipIcon }
})

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>()
  const CircleHelp = ({
    size,
    ...props
  }: React.SVGProps<SVGSVGElement> & { size?: string | number }) => (
    <svg role="img" data-mark="unknown" data-size={size} {...props} />
  )

  return { ...actual, CircleHelp }
})

vi.mock("@lobehub/icons/es/Google/components/Color", () => ({
  default: ({
    size,
    ...props
  }: React.SVGProps<SVGSVGElement> & { size?: string | number }) => (
    <svg role="img" data-mark="Google-color" data-size={size} {...props} />
  ),
}))

vi.mock("@lobehub/icons/es/Google/components/Mono", () => ({
  default: ({
    size,
    ...props
  }: React.SVGProps<SVGSVGElement> & { size?: string | number }) => (
    <svg role="img" data-mark="Google-mono" data-size={size} {...props} />
  ),
}))

vi.mock("@lobehub/icons/es/Anthropic/components/Mono", () => ({
  default: ({
    size,
    ...props
  }: React.SVGProps<SVGSVGElement> & { size?: string | number }) => (
    <svg role="img" data-mark="Anthropic-mono" data-size={size} {...props} />
  ),
}))

const knownVendor = (knownId: string): ModelVendorPresentationInput => ({
  state: "resolved",
  kind: "known",
  key: `known:${knownId}`,
  knownId,
  label: knownId,
  source: "curated-rule",
})

const customVendor: ModelVendorPresentationInput = {
  kind: "custom",
  key: "custom:example%20lab",
  label: "Example Lab",
}

const getBadgeSurface = (mark: HTMLElement) => {
  const surface = mark.closest<HTMLElement>('[data-slot="model-vendor-badge"]')
  expect(surface).not.toBeNull()
  return surface!
}

const expectNeutralBadgeSurface = (surface: HTMLElement) => {
  expect(surface).toHaveClass(
    "rounded-full",
    "bg-gray-100",
    "text-gray-600",
    "dark:bg-dark-bg-tertiary",
    "dark:text-dark-text-secondary",
  )
  expect(surface).toHaveStyle({ height: "28px", width: "28px" })
  expect(surface.getAttribute("class") ?? "").not.toMatch(
    /(?:^|\s)(?:bg|text)-orange-/,
  )
}

describe("ModelVendorMark", () => {
  it("uses a library Color asset for a compact brand when available", () => {
    render(<ModelVendorMark vendor={knownVendor("google")} variant="compact" />)

    const mark = screen.getByRole("img", { hidden: true })
    expect(mark).toHaveAttribute("data-mark", "Google-color")
    expect(mark).toHaveAttribute("data-size", "16")
    expect(mark).toHaveAttribute("aria-hidden", "true")
  })

  it("uses the adaptive mono brand for compact Anthropic", () => {
    render(
      <ModelVendorMark vendor={knownVendor("anthropic")} variant="compact" />,
    )

    const mark = screen.getByRole("img", { hidden: true })
    expect(mark).toHaveAttribute("data-mark", "Anthropic-mono")
    expect(mark).not.toHaveAttribute("data-mark", "Anthropic-color")
    expect(mark.getAttribute("class") ?? "").not.toMatch(
      /(?:^|\s)(?:bg|text)-orange-/,
    )
  })

  it("uses a library Color mark inside the neutral badge surface", () => {
    render(<ModelVendorMark vendor={knownVendor("google")} variant="badge" />)

    const mark = screen.getByRole("img", { hidden: true })
    expect(mark).toHaveAttribute("data-mark", "Google-color")
    expect(mark).not.toHaveAttribute("data-mark", "Google-avatar")
    expect(mark).toHaveAttribute("data-size", "16")
    expect(mark).toHaveAttribute("aria-hidden", "true")
    expectNeutralBadgeSurface(getBadgeSurface(mark))
  })

  it("uses the adaptive mono mark rather than Avatar for badge Anthropic", () => {
    render(
      <ModelVendorMark vendor={knownVendor("anthropic")} variant="badge" />,
    )

    const mark = screen.getByRole("img", { hidden: true })
    expect(mark).toHaveAttribute("data-mark", "Anthropic-mono")
    expect(mark).not.toHaveAttribute("data-mark", "Anthropic-avatar")
    expect(mark).toHaveAttribute("data-size", "16")
    expect(mark).toHaveAttribute("aria-hidden", "true")
    expect(mark.getAttribute("class") ?? "").not.toMatch(
      /(?:^|\s)(?:bg|text)-orange-/,
    )
    expectNeutralBadgeSurface(getBadgeSurface(mark))
  })

  it("keeps compact initials, generic, and unknown marks bare and distinct", () => {
    render(
      <>
        <ModelVendorMark vendor={knownVendor("eurollm")} variant="compact" />
        <ModelVendorMark vendor={customVendor} variant="compact" />
        <ModelVendorMark vendor={{ state: "unknown" }} variant="compact" />
      </>,
    )

    expect(screen.getByText("EU")).toHaveStyle({
      height: "16px",
      width: "16px",
    })
    const iconMarks = screen.getAllByRole("img", { hidden: true })
    expect(iconMarks.map((mark) => mark.getAttribute("data-mark"))).toEqual([
      "generic",
      "unknown",
    ])
    for (const mark of iconMarks) {
      expect(mark).toHaveAttribute("data-size", "16")
      expect(mark).toHaveAttribute("aria-hidden", "true")
      expect(mark).not.toHaveAttribute("data-slot", "model-vendor-badge")
    }
  })

  it("uses one circular badge silhouette for brand, initials, generic, and unknown marks", () => {
    render(
      <>
        <ModelVendorMark vendor={knownVendor("google")} variant="badge" />
        <ModelVendorMark vendor={knownVendor("eurollm")} variant="badge" />
        <ModelVendorMark vendor={customVendor} variant="badge" />
        <ModelVendorMark vendor={{ state: "unknown" }} variant="badge" />
      </>,
    )

    const surfaces = document.querySelectorAll<HTMLElement>(
      '[data-slot="model-vendor-badge"]',
    )
    expect(surfaces).toHaveLength(4)
    for (const surface of surfaces) expectNeutralBadgeSurface(surface)

    const badgeInitials = screen.getByText("EU")
    expect(badgeInitials).toBeVisible()
    for (const localShapeClass of [
      "rounded-sm",
      "bg-gray-200",
      "dark:bg-gray-700",
    ]) {
      expect(badgeInitials).not.toHaveClass(localShapeClass)
    }
    expect(
      screen
        .getAllByRole("img", { hidden: true })
        .map((mark) => mark.getAttribute("data-mark")),
    ).toEqual(["Google-color", "generic", "unknown"])
  })
})
