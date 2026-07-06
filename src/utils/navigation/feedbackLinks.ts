import type { AutoDetectErrorType } from "~/services/accounts/utils/autoDetectUtils"
import { getDocsCommunityUrl } from "~/utils/navigation/docsLinks"
import { getRepository } from "~/utils/navigation/packageMeta"

const BUG_REPORT_TEMPLATE = "bug_report.yml"
const FEATURE_REQUEST_TEMPLATE = "feature_request.yml"
const LANGUAGE_REQUEST_TEMPLATE = "language_request.yml"
const SITE_SUPPORT_REQUEST_TEMPLATE = "site_support_request.yml"

export const SITE_SUPPORT_ERROR_TYPES = {
  KeyManagementUnsupported: "key_management_unsupported",
  ModelListUnsupported: "model_list_unsupported",
} as const

export type SiteSupportErrorType =
  | AutoDetectErrorType
  | (typeof SITE_SUPPORT_ERROR_TYPES)[keyof typeof SITE_SUPPORT_ERROR_TYPES]

export interface SiteSupportRequestContext {
  siteUrl?: string
  errorType?: SiteSupportErrorType
  errorMessage?: string
}

interface FeedbackDestinationUrls {
  repository: string
  bugReport: string
  featureRequest: string
  languageRequest: string
  siteSupportRequest: string
  discussions: string
  community: string
}

const normalizeRepositoryUrl = (repositoryUrl: string) => {
  return repositoryUrl.replace(/^git\+/, "").replace(/\.git$/, "")
}

const buildIssueTemplateUrl = (repositoryUrl: string, template: string) => {
  const url = new URL(`${normalizeRepositoryUrl(repositoryUrl)}/issues/new`)
  url.searchParams.set("template", template)
  return url.toString()
}

const getSiteSupportTitle = (siteUrl?: string) => {
  if (!siteUrl) {
    return "[Site Support]: "
  }

  try {
    return `[Site Support]: ${new URL(siteUrl).hostname}`
  } catch {
    return "[Site Support]: "
  }
}

export const getFeedbackDestinationUrls = (
  language?: string,
): FeedbackDestinationUrls => {
  const repository = normalizeRepositoryUrl(getRepository())

  return {
    repository,
    bugReport: buildIssueTemplateUrl(repository, BUG_REPORT_TEMPLATE),
    featureRequest: buildIssueTemplateUrl(repository, FEATURE_REQUEST_TEMPLATE),
    languageRequest: buildIssueTemplateUrl(
      repository,
      LANGUAGE_REQUEST_TEMPLATE,
    ),
    siteSupportRequest: buildIssueTemplateUrl(
      repository,
      SITE_SUPPORT_REQUEST_TEMPLATE,
    ),
    discussions: `${repository}/discussions`,
    community: getDocsCommunityUrl(language),
  }
}

export const getSiteSupportRequestUrl = (
  context: SiteSupportRequestContext = {},
) => {
  const repository = normalizeRepositoryUrl(getRepository())
  const url = new URL(
    buildIssueTemplateUrl(repository, SITE_SUPPORT_REQUEST_TEMPLATE),
  )
  url.searchParams.set("title", getSiteSupportTitle(context.siteUrl))
  url.searchParams.set("labels", "site-support")

  if (context.siteUrl) {
    url.searchParams.set("site-url", context.siteUrl)
  }
  if (context.errorType) {
    url.searchParams.set("failure-type", context.errorType)
  }
  if (context.errorMessage) {
    url.searchParams.set("failure-message", context.errorMessage)
  }

  return url.toString()
}
