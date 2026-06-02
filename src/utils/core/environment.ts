const RUNTIME_MODES = {
  Development: "development",
  Production: "production",
  Test: "test",
} as const

type RuntimeMode = string

/**
 * Returns the current Vite/WXT mode name, which comes from `--mode`.
 */
export function getRuntimeMode(): RuntimeMode {
  return import.meta.env.MODE
}

/**
 * Checks whether the current Vite/WXT mode name is development.
 */
export function isDevelopmentMode(): boolean {
  return getRuntimeMode() === RUNTIME_MODES.Development
}

/**
 * Checks whether the current Vite/WXT mode name is production.
 */
export function isProductionMode(): boolean {
  return getRuntimeMode() === RUNTIME_MODES.Production
}

/**
 * Checks whether the current Vite/WXT mode name is test.
 */
export function isTestMode(): boolean {
  return getRuntimeMode() === RUNTIME_MODES.Test
}

/**
 * Checks whether Vite considers this a development build/runtime.
 */
export function isDevBuild(): boolean {
  return import.meta.env.DEV
}

/**
 * Checks whether Vite considers this a production build/runtime.
 */
export function isProdBuild(): boolean {
  return import.meta.env.PROD
}
