import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

/** Fingerprint the complete database and reject links into another profile. */
function snapshot(directory) {
  const hash = createHash("sha256")
  const walk = (folder) => {
    for (const name of fs.readdirSync(folder).sort()) {
      if (name === "LOCK") continue
      const file = path.join(folder, name)
      const stat = fs.lstatSync(file)
      if (stat.isSymbolicLink()) throw new Error("profile_database_symlink")
      hash.update(path.relative(directory, file))
      if (stat.isDirectory()) walk(file)
      else hash.update(fs.readFileSync(file))
    }
  }
  walk(directory)
  return hash.digest("hex")
}

/** Copy first, verify, then swap; never merge a LevelDB with its old files. */
export function replaceProfileDatabase(
  source,
  target,
  copy = (from, to) =>
    fs.cpSync(from, to, {
      recursive: true,
      filter: (file) => path.basename(file) !== "LOCK",
    }),
) {
  const sourcePath = fs.realpathSync(source)
  const targetPath = path.resolve(target)
  const relative = path.relative(sourcePath, targetPath)
  const reverse = path.relative(targetPath, sourcePath)
  if (
    !relative ||
    (!relative.startsWith("..") && !path.isAbsolute(relative)) ||
    (!reverse.startsWith("..") && !path.isAbsolute(reverse))
  )
    throw new Error("overlapping_database_paths")
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  const parent = fs.realpathSync(path.dirname(targetPath))
  if (
    parent !== path.dirname(targetPath) ||
    (fs.existsSync(targetPath) && fs.lstatSync(targetPath).isSymbolicLink())
  )
    throw new Error("profile_database_symlink")
  const stage = fs.mkdtempSync(path.join(parent, ".aah-stage-"))
  const backup = fs.existsSync(targetPath)
    ? `${targetPath}.backup-${randomUUID()}`
    : undefined
  let moved = false
  try {
    const before = snapshot(sourcePath)
    copy(sourcePath, stage)
    if (snapshot(sourcePath) !== before)
      throw new Error("source_database_changed")
    if (snapshot(stage) !== before) throw new Error("incomplete_database_copy")
    if (backup) {
      fs.renameSync(targetPath, backup)
      moved = true
    }
    try {
      fs.renameSync(stage, targetPath)
    } catch (error) {
      if (moved) fs.renameSync(backup, targetPath)
      throw error
    }
    return backup
  } finally {
    // The temporary directory is a checked, direct child of the target parent.
    if (path.dirname(path.resolve(stage)) === parent && fs.existsSync(stage))
      fs.rmSync(stage, { recursive: true, force: true })
  }
}
