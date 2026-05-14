/**
 * Checks whether the current Vite/WXT runtime mode is development.
 */
export function isDevelopmentMode(): boolean {
  return import.meta.env.MODE === "development"
}
