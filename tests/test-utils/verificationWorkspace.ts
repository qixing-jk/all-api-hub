import { screen } from "@testing-library/react"
import { vi } from "vitest"

/** Match workspace container queries that JSDOM cannot evaluate. */
export function mockVerificationWorkspaceLayout() {
  const getComputedStyle = window.getComputedStyle.bind(window)
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const style = getComputedStyle(element, pseudo)
    const getPropertyValue = style.getPropertyValue.bind(style)
    style.getPropertyValue = (property) =>
      property === "--verification-layout"
        ? (element as HTMLElement).clientWidth >= 832
          ? "split"
          : "stack"
        : getPropertyValue(property)
    return style
  })
}

/** Find a probe's metadata even when a different test is being inspected. */
export function getVerificationHeader(
  probe?: HTMLElement | string,
): HTMLElement {
  const probeId =
    typeof probe === "string"
      ? probe
      : (probe?.dataset.verificationProbe ??
        probe?.querySelector<HTMLElement>("[data-verification-probe]")?.dataset
          .verificationProbe)
  const selector = probeId
    ? `[data-verification-test-header][data-probe-id="${probeId}"]`
    : "[data-verification-test-header]:not([hidden])"
  const header = screen
    .getByTestId("verification-active-test")
    .querySelector<HTMLElement>(selector)
  if (!header)
    throw new Error(
      `Verification header not found: ${probeId ?? "selected test"}`,
    )
  return header
}
