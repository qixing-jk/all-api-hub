export declare const E2E_BUILD_VARIANTS: {
  readonly Default: "default"
  readonly DnrRequired: "dnr-required"
  readonly BookmarksRequired: "bookmarks-required"
}

export declare const E2E_BUILD_VARIANT_ENV: string

export declare function readE2eBuildVariant(
  env?: Record<string, string | undefined>,
): "default" | "dnr-required" | "bookmarks-required"

export declare function getE2eExtensionDirName(
  variant?: "default" | "dnr-required" | "bookmarks-required",
): string

export declare function getE2eTestOutDirTemplate(
  variant?: "default" | "dnr-required" | "bookmarks-required",
): string

export declare function getE2eRequiredChromiumPermissions(
  variant?: "default" | "dnr-required" | "bookmarks-required",
): string[]
