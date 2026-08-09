import {
  managedSiteAxonHubSearchControls,
  managedSiteAxonHubSearchSections,
} from "./ManagedSiteAxonHub.search"
import {
  managedSiteClaudeCodeHubSearchControls,
  managedSiteClaudeCodeHubSearchSections,
} from "./ManagedSiteClaudeCodeHub.search"
import {
  managedSiteCoreSearchControls,
  managedSiteCoreSearchSections,
} from "./ManagedSiteCore.search"
import {
  managedSiteDoneHubSearchControls,
  managedSiteDoneHubSearchSections,
} from "./ManagedSiteDoneHub.search"
import {
  managedSiteNewApiSearchControls,
  managedSiteNewApiSearchSections,
} from "./ManagedSiteNewApi.search"
import {
  managedSiteOctopusSearchControls,
  managedSiteOctopusSearchSections,
} from "./ManagedSiteOctopus.search"
import {
  managedSiteSub2ApiSearchControls,
  managedSiteSub2ApiSearchSections,
} from "./ManagedSiteSub2Api.search"
import {
  managedSiteVeloeraSearchControls,
  managedSiteVeloeraSearchSections,
} from "./ManagedSiteVeloera.search"

export const managedSiteSearchSections = [
  ...managedSiteCoreSearchSections,
  ...managedSiteNewApiSearchSections,
  ...managedSiteDoneHubSearchSections,
  ...managedSiteVeloeraSearchSections,
  ...managedSiteOctopusSearchSections,
  ...managedSiteAxonHubSearchSections,
  ...managedSiteClaudeCodeHubSearchSections,
  ...managedSiteSub2ApiSearchSections,
]

export const managedSiteSearchControls = [
  ...managedSiteCoreSearchControls,
  ...managedSiteNewApiSearchControls,
  ...managedSiteDoneHubSearchControls,
  ...managedSiteVeloeraSearchControls,
  ...managedSiteOctopusSearchControls,
  ...managedSiteAxonHubSearchControls,
  ...managedSiteClaudeCodeHubSearchControls,
  ...managedSiteSub2ApiSearchControls,
]
