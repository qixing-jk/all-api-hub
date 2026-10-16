declare const __AAH_BUILD_REVISION__: string | null

/** Packaged revisions use the full lowercase Git commit ID. */
export function isBuildRevision(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{40}$/.test(value)
}

/** Older builds may not have a baked source revision. */
export function getBuildRevision(): string | null {
  return typeof __AAH_BUILD_REVISION__ !== "undefined" &&
    isBuildRevision(__AAH_BUILD_REVISION__)
    ? __AAH_BUILD_REVISION__
    : null
}
