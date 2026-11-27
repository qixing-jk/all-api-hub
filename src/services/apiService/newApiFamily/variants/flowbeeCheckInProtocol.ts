/**
 * Flowbee retains the New API check-in endpoint but its welfare UI lives at
 * /invite. Verified against flowbee.top, main-20261102-15ee1ed, 2026-11-15.
 * ALTCHA's native callback submits its proof in the legacy `turnstile` query
 * parameter; the parameter name does not identify the verification provider.
 */
/** Daily welfare credit resets at 00:00 UTC+8; it is not monetary quota. */
export const FLOWBEE_CHECK_IN_POINT_ASSET = {
  id: "flowbee:daily-points",
  label: "Flowbee daily points",
  displayScale: 1,
  displayLabel: "points",
} as const

/** Restrict the reward dialect to its observed account host. */
export function isFlowbeeDeployment(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname === "flowbee.top"
  } catch {
    return false
  }
}
