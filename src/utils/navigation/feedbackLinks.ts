import { getRepository } from "~/utils/navigation/packageMeta"

const BUG_REPORT_TEMPLATE = "bug_report.yml"
const FEATURE_REQUEST_TEMPLATE = "feature_request.yml"

export interface FeedbackDestinationUrls {
  repository: string
  bugReport: string
  featureRequest: string
  discussions: string
}

const normalizeRepositoryUrl = (repositoryUrl: string) => {
  return repositoryUrl.replace(/^git\+/, "").replace(/\.git$/, "")
}

const buildIssueTemplateUrl = (repositoryUrl: string, template: string) => {
  const url = new URL(`${normalizeRepositoryUrl(repositoryUrl)}/issues/new`)
  url.searchParams.set("template", template)
  return url.toString()
}

export const getFeedbackDestinationUrls = (): FeedbackDestinationUrls => {
  const repository = normalizeRepositoryUrl(getRepository())

  return {
    repository,
    bugReport: buildIssueTemplateUrl(repository, BUG_REPORT_TEMPLATE),
    featureRequest: buildIssueTemplateUrl(repository, FEATURE_REQUEST_TEMPLATE),
    discussions: `${repository}/discussions`,
  }
}
