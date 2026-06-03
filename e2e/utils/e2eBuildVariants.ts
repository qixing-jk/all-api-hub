import e2eBuildVariantsConfig from "../e2e-build-variants.json"

export const E2E_BUILD_VARIANT_ENV = e2eBuildVariantsConfig.envName
export const E2E_BUILD_VARIANTS = {
  Default: "default",
  DnrRequired: "dnr-required",
} as const

const E2E_BUILD_VARIANT_VALUES = [
  E2E_BUILD_VARIANTS.Default,
  E2E_BUILD_VARIANTS.DnrRequired,
] as const

type E2eBuildVariant = (typeof E2E_BUILD_VARIANT_VALUES)[number]

export function readE2eBuildVariant(
  env: Record<string, string | undefined> = process.env,
): E2eBuildVariant {
  const value = env[E2E_BUILD_VARIANT_ENV]?.trim()
  if (!value) return E2E_BUILD_VARIANTS.Default
  if (isE2eBuildVariant(value)) return value

  throw new Error(`Unsupported ${E2E_BUILD_VARIANT_ENV} '${value}'`)
}

export function getE2eExtensionDirName(variant = readE2eBuildVariant()) {
  return e2eBuildVariantsConfig.variants[variant].extensionDirName
}

export function getE2eTestOutDirTemplate(variant = readE2eBuildVariant()) {
  return e2eBuildVariantsConfig.variants[variant].testOutDirTemplate
}

export function getE2eRequiredChromiumPermissions(
  variant = readE2eBuildVariant(),
) {
  return [
    ...e2eBuildVariantsConfig.variants[variant].requiredChromiumPermissions,
  ]
}

function isE2eBuildVariant(value: string): value is E2eBuildVariant {
  return E2E_BUILD_VARIANT_VALUES.includes(value as E2eBuildVariant)
}
