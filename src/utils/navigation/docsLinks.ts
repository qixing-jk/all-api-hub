import { joinUrl } from "~/utils/core/url"
import { getChangelogAnchorId } from "~/utils/navigation/changelogAnchor"
import { getHomepage } from "~/utils/navigation/packageMeta"

const DOCS_COMMUNITY_ANCHOR = "community"
const DOCS_TASK_NOTIFICATIONS_FEISHU_ANCHOR = "feishu"
const DOCS_TASK_NOTIFICATIONS_DINGTALK_ANCHOR = "dingtalk"
const DOCS_TASK_NOTIFICATIONS_WECOM_ANCHOR = "wecom"
const DOCS_TASK_NOTIFICATIONS_NTFY_ANCHOR = "ntfy"

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

export const getDocsTaskNotificationsUrl = (language?: string) =>
  getDocsPageUrl("task-notifications", language)

export const getDocsTaskNotificationsFeishuUrl = (language?: string) => {
  const url = new URL(getDocsTaskNotificationsUrl(language))
  url.hash = DOCS_TASK_NOTIFICATIONS_FEISHU_ANCHOR
  return url.toString()
}

export const getDocsTaskNotificationsDingtalkUrl = (language?: string) => {
  const url = new URL(getDocsTaskNotificationsUrl(language))
  url.hash = DOCS_TASK_NOTIFICATIONS_DINGTALK_ANCHOR
  return url.toString()
}

export const getDocsTaskNotificationsWecomUrl = (language?: string) => {
  const url = new URL(getDocsTaskNotificationsUrl(language))
  url.hash = DOCS_TASK_NOTIFICATIONS_WECOM_ANCHOR
  return url.toString()
}

export const getDocsTaskNotificationsNtfyUrl = (language?: string) => {
  const url = new URL(getDocsTaskNotificationsUrl(language))
  url.hash = DOCS_TASK_NOTIFICATIONS_NTFY_ANCHOR
  return url.toString()
}

/**
 * Resolve the shared community hub on the localized docs homepage.
 *
 * This keeps extension entry points aligned with the user's current language
 * once translated docs add a matching `#community` section.
 */
export const getDocsCommunityUrl = (language?: string) => {
  const url = new URL(getDocsHomepageUrl(language))
  url.hash = DOCS_COMMUNITY_ANCHOR
  return url.toString()
}

export const getDocsChangelogUrl = (version?: string, language?: string) => {
  const url = getDocsPageUrl("changelog.html", language)

  if (!version) return url

  const anchorId = getChangelogAnchorId(version)
  return `${url}#${anchorId}`
}
