import {
  getE2eExtensionDirName as getSharedE2eExtensionDirName,
  getE2eRequiredChromiumPermissions as getSharedE2eRequiredChromiumPermissions,
  getE2eTestOutDirTemplate as getSharedE2eTestOutDirTemplate,
  readE2eBuildVariant as readSharedE2eBuildVariant,
  E2E_BUILD_VARIANT_ENV as SHARED_E2E_BUILD_VARIANT_ENV,
  E2E_BUILD_VARIANTS as SHARED_E2E_BUILD_VARIANTS,
} from "./e2eBuildVariants.shared"

export const E2E_BUILD_VARIANTS = SHARED_E2E_BUILD_VARIANTS

const _E2E_BUILD_VARIANT_VALUES = [
  E2E_BUILD_VARIANTS.Default,
  E2E_BUILD_VARIANTS.DnrRequired,
  E2E_BUILD_VARIANTS.BookmarksRequired,
] as const

type E2eBuildVariant = (typeof _E2E_BUILD_VARIANT_VALUES)[number]

export const E2E_BUILD_VARIANT_ENV = SHARED_E2E_BUILD_VARIANT_ENV

export function readE2eBuildVariant(
  env: Record<string, string | undefined> = process.env,
): E2eBuildVariant {
  return readSharedE2eBuildVariant(env) as E2eBuildVariant
}

export function getE2eExtensionDirName(variant = readE2eBuildVariant()) {
  return getSharedE2eExtensionDirName(variant)
}

export function getE2eTestOutDirTemplate(variant = readE2eBuildVariant()) {
  return getSharedE2eTestOutDirTemplate(variant)
}

export function getE2eRequiredChromiumPermissions(
  variant = readE2eBuildVariant(),
) {
  return getSharedE2eRequiredChromiumPermissions(variant)
}
