export declare const E2E_DERIVED_VARIANTS: string[]
export declare function applyVariantPermissions(
  manifest: Record<string, unknown>,
  variant: string,
): Record<string, unknown>
export declare function deriveE2eBuildVariants(options: {
  cwd: string
  sourceVariant?: string
  targetVariants?: string[]
}): Promise<
  { variant: string; directory: string; addedPermissions: string[] }[]
>
