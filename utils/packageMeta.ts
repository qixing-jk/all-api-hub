import { REPO_URL } from "~/constants/about"
import pkg from "~/package.json"

/**
 * Resolve the documentation homepage for the current build.
 * Falls back to the public GitHub Pages URL when the package metadata omits it.
 */
export const getHomepage = () => {
  return (pkg as any).homepage ?? "https://qixing-jk.github.io/all-api-hub/"
}

/**
 * Read the repository URL directly from package.json.
 * Supports both string and object repository definitions.
 */
export const getRepository = () => {
  const repo = (pkg as any).repository
  if (!repo) return REPO_URL
  if (typeof repo === "string") return repo
  return repo.url ?? REPO_URL
}

/**
 * Retrieve the pinned dependency version for display in docs/settings UI.
 * Strips npm prefix characters (~,^,>=, etc.) to keep the value user friendly.
 * @param name Package name to inspect.
 */
export const getPkgVersion = (name: string) => {
  const v =
    (pkg as any).dependencies?.[name] ?? (pkg as any).devDependencies?.[name]
  if (!v) return "—"
  return String(v).replace(/^[~^><= ]+/, "")
}
