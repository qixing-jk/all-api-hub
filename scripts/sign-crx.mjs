import { readFileSync, writeFileSync } from "node:fs"

import { packCrx3, readCrxPrivateKey } from "./crx-self-update.mjs"

/**
 * Sign a packaged extension ZIP into a CRX3 file.
 *
 * The CRX must be produced from the same ZIP that ships to users, and every
 * release must be signed with the same key: Chrome only updates an installed
 * copy when the new CRX carries the key its extension id was derived from.
 *
 * Usage: node scripts/sign-crx.mjs <input.zip> <output.crx>
 */
async function main() {
  const [sourceZip, outputCrx] = process.argv.slice(2)
  if (!sourceZip || !outputCrx) {
    throw new Error("Usage: node scripts/sign-crx.mjs <input.zip> <output.crx>")
  }

  writeFileSync(
    outputCrx,
    packCrx3({
      zipBuffer: readFileSync(sourceZip),
      privateKeyPem: await readCrxPrivateKey(),
    }),
  )
}

await main()
