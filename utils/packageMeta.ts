import { DOCS_BASE_URL, REPO_URL } from "~/constants/about"
import pkg from "~/package.json"
import { getDocsLocalePath } from "~/utils/docsLocale"
import { joinUrl } from "~/utils/url"

/**
 * Resolve the documentation homepage for the current build.
 * Falls back to the public docs site URL when the package metadata omits it.
 */
export const getDocsBaseUrl = () => {
  return (pkg as any).homepage ?? DOCS_BASE_URL
}

export const getHomepage = (language?: string) => {
  return joinUrl(getDocsBaseUrl(), getDocsLocalePath(language))
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
