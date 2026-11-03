#!/usr/bin/env node
/**
 * Produces the E2E manifest variants from the default build.
 *
 * `wxt.config.ts` changes only `permissions` between variants, so building each one
 * ran a full WXT build for a manifest edit. The E2E build job runs this after building
 * the default variant; `tests/scripts/e2eBuildVariantDerive.test.ts` enforces that
 * assumption against the real manifest factory.
 *
 * Usage: node scripts/e2e-build-variants.mjs
 */
import path from "node:path"
import { fileURLToPath } from "node:url"

import { deriveE2eBuildVariants } from "../e2e/utils/e2eBuildDerive.shared.js"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const derived = await deriveE2eBuildVariants({ cwd: rootDir })
for (const { variant, directory, addedPermissions } of derived) {
  console.log(
    `Derived .output/${directory} from the default build (${variant}, +${addedPermissions.join(", ")})`,
  )
}
