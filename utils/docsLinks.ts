import { getChangelogAnchorId } from "~/utils/changelogAnchor"
import { getHomepage } from "~/utils/packageMeta"
import { joinUrl } from "~/utils/url"

/**
 * Resolve the documentation homepage URL for a given language.
 *
 * This intentionally wraps {@link getHomepage} so callers can depend on a
 * semantically-named docs URL helper even if the docs homepage diverges from
 * the package homepage in the future. Currently, it delegates to
 * {@link getHomepage}.
 * @param language Optional language code to determine the localized docs path. Falls back to default if not provided.
 */
export function getDocsHomepageUrl(language?: string): string {
  return getHomepage(language)
}

/**
 * Construct a full URL to a specific documentation page, optionally localized by language.
 * @param path The relative path to the documentation page (e.g., "get-started.html").
 * @param language Optional language code to determine the localized docs path. Falls back to default if not provided.
 */
export function getDocsPageUrl(path: string, language?: string): string {
  return joinUrl(getDocsHomepageUrl(language), path)
}

export const getDocsAutoDetectUrl = (language?: string) =>
  getDocsPageUrl("auto-detect", language)

export const getDocsGetStartedUrl = (language?: string) =>
  getDocsPageUrl("get-started", language)

export const getDocsChangelogUrl = (version?: string, language?: string) => {
  const url = getDocsPageUrl("changelog.html", language)

  if (!version) return url

  const anchorId = getChangelogAnchorId(version)
  return `${url}#${anchorId}`
}
