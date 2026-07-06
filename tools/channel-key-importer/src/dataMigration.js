import { access, copyFile, mkdir } from "node:fs/promises"
import { join } from "node:path"

const DATA_FILES = ["config.json", "imports.json", "balances.json"]

export async function migrateDataFiles(sourceDir, targetDir) {
  if (!sourceDir || !targetDir || sourceDir === targetDir) return []
  const copied = []
  await mkdir(targetDir, { recursive: true, mode: 0o700 })
  for (const fileName of DATA_FILES) {
    const source = join(sourceDir, fileName)
    const target = join(targetDir, fileName)
    try {
      await access(target)
      continue
    } catch {
      // Only migrate when the desktop destination has no newer local file.
    }
    try {
      await copyFile(source, target)
      copied.push(fileName)
    } catch {
      // Missing legacy files are normal on a clean installation.
    }
  }
  return copied
}
