import { isFirefox } from "~/utils/browser"

/**
 * UI variants for protection-bypass related copy.
 *
 * - `TempWindowOnly`: Traditional flow where the temp window itself handles the bypass + request.
 * - `TempWindowWithCookieInterceptor`: Firefox flow where the temp window is used to obtain cookies,
 *   while Cookie Interceptor attaches cookies/headers for subsequent requests.
 */
export const ProtectionBypassUiVariants = {
  TempWindowOnly: "tempWindowOnly",
  TempWindowWithCookieInterceptor: "tempWindowWithCookieInterceptor",
} as const

export type ProtectionBypassUiVariant =
  (typeof ProtectionBypassUiVariants)[keyof typeof ProtectionBypassUiVariants]

/**
 * Wrapper around Firefox detection for the protection-bypass related flows.
 *
 * Do NOT inline `isFirefox()` at call sites; this wrapper centralizes the decision so
 * it can be changed later (e.g. browser/version gating, feature flags).
 */
export function isProtectionBypassFirefoxEnv(): boolean {
  try {
    return isFirefox()
  } catch {
    return false
  }
}

/**
 * Whether Cookie Interceptor should be considered part of the protection-bypass flow.
 * This is a copy/UX decision (not a permission check).
 */
export function shouldUseCookieInterceptorForProtectionBypass(): boolean {
  return isProtectionBypassFirefoxEnv()
}

/**
 * Returns the UI variant to use for describing the protection-bypass feature.
 */
export function getProtectionBypassUiVariant(): ProtectionBypassUiVariant {
  return shouldUseCookieInterceptorForProtectionBypass()
    ? ProtectionBypassUiVariants.TempWindowWithCookieInterceptor
    : ProtectionBypassUiVariants.TempWindowOnly
}
