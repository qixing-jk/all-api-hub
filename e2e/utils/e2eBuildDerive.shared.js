import fs from "node:fs"
import path from "node:path"

import {
  createE2eBuildInputHash,
  readE2eBuildInputPaths,
} from "./e2eBuildInputs.shared.js"
import {
  E2E_BUILD_VARIANT_ENV,
  E2E_BUILD_VARIANTS,
  getE2eExtensionDirName,
  getE2eRequiredChromiumPermissions,
} from "./e2eBuildVariants.shared.js"

/*
 * Manifest variants differ only in `permissions` (see wxt.config.ts): the same bundle
 * is packaged three times. Building each variant ran a full WXT build per variant, so
 * the variants are derived from one default build instead.
 *
 * Nothing here hard-codes which fields may differ. `tests/scripts/e2eBuildVariantDerive
 * .test.ts` compares the real manifest factory for every variant against the default
 * one and fails if any other field diverges, which is what makes the copy safe to keep.
 */

/** Variants produced by deriving from the default build. */
export const E2E_DERIVED_VARIANTS = [
  E2E_BUILD_VARIANTS.DnrRequired,
  E2E_BUILD_VARIANTS.BookmarksRequired,
]

/**
 * Rewrites a default manifest for a variant.
 *
 * A permission the variant requires must also leave `optional_permissions`; the config
 * removes required permissions from the optional list, so leaving `cookies` in both
 * would produce a manifest no build would ever generate.
 * @param manifest Parsed default `manifest.json`.
 * @param variant Variant whose permissions are promoted to required.
 * @returns The manifest for that variant, without mutating the input.
 */
export function applyVariantPermissions(manifest, variant) {
  const base = Array.isArray(manifest.permissions) ? manifest.permissions : []
  const permissions = [
    ...new Set([...base, ...getE2eRequiredChromiumPermissions(variant)]),
  ]
  const optional = Array.isArray(manifest.optional_permissions)
    ? manifest.optional_permissions
    : []
  return {
    ...manifest,
    permissions,
    optional_permissions: optional.filter(
      (permission) => !permissions.includes(permission),
    ),
  }
}

/**
 * Derives every manifest variant from the default build.
 *
 * The source build must be the default variant: deriving from a variant would carry
 * that variant's promoted permissions into its siblings. Each target is replaced
 * wholesale, so a stale directory can never be mixed with the new copy.
 * @param options Derivation inputs.
 * @param options.cwd Repository root.
 * @param [options.sourceVariant] Variant of the existing build to copy from.
 * @param [options.targetVariants] Variants to produce.
 * @returns What was written, for logging and tests.
 */
export async function deriveE2eBuildVariants({
  cwd,
  sourceVariant = E2E_BUILD_VARIANTS.Default,
  targetVariants = E2E_DERIVED_VARIANTS,
}) {
  if (sourceVariant !== E2E_BUILD_VARIANTS.Default) {
    throw new Error(
      `E2E variants must be derived from the default build, not '${sourceVariant}'`,
    )
  }

  const outputRoot = path.join(cwd, ".output")
  const sourceDirectory = path.join(
    outputRoot,
    getE2eExtensionDirName(sourceVariant),
  )
  const sourceManifestPath = path.join(sourceDirectory, "manifest.json")
  const sourceMetadataPath = path.join(sourceDirectory, ".aah-e2e-build.json")

  const sourceManifest = readJson(sourceManifestPath, "default build manifest")
  const sourceMetadata = readJson(sourceMetadataPath, "default build metadata")
  if (sourceMetadata.buildVariant !== sourceVariant) {
    throw new Error(
      `Expected a '${sourceVariant}' build at ${path.relative(cwd, sourceDirectory)}, found '${sourceMetadata.buildVariant}'`,
    )
  }
  if (sourceManifest.manifest_version !== 3) {
    throw new Error(
      `Expected an MV3 manifest in ${path.relative(cwd, sourceDirectory)}`,
    )
  }

  const inputPaths = await readE2eBuildInputPaths(cwd)
  const derived = []

  for (const variant of targetVariants) {
    if (variant === sourceVariant) {
      throw new Error(`Cannot derive '${variant}' from itself`)
    }
    const directory = getE2eExtensionDirName(variant)
    const targetDirectory = path.join(outputRoot, directory)
    if (path.resolve(targetDirectory) === path.resolve(sourceDirectory)) {
      throw new Error(`Variant '${variant}' resolves to the source directory`)
    }

    fs.rmSync(targetDirectory, { recursive: true, force: true })
    fs.cpSync(sourceDirectory, targetDirectory, { recursive: true })
    fs.writeFileSync(
      path.join(targetDirectory, "manifest.json"),
      `${JSON.stringify(applyVariantPermissions(sourceManifest, variant), null, 2)}\n`,
      "utf8",
    )

    // The cache key and freshness check both include the variant, so the derived
    // build must carry that variant's own input hash rather than the source's.
    const inputHash = await createE2eBuildInputHash(cwd, inputPaths, {
      env: { ...process.env, [E2E_BUILD_VARIANT_ENV]: variant },
    })
    fs.writeFileSync(
      path.join(targetDirectory, ".aah-e2e-build.json"),
      `${JSON.stringify(
        {
          ...sourceMetadata,
          buildVariant: variant,
          inputHash,
          inputPaths,
          builtAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    )

    derived.push({
      variant,
      directory,
      addedPermissions: getE2eRequiredChromiumPermissions(variant),
    })
  }

  return derived
}

/**
 * @param file Absolute path.
 * @param label Description used in the error message.
 * @returns The parsed JSON.
 */
function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Cannot derive E2E variants: missing or invalid ${label} at ${file} (${detail})`,
    )
  }
}
