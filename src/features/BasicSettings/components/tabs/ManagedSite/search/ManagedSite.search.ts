import {
  managedSiteCoreSearchControls,
  managedSiteCoreSearchSections,
} from "~/features/BasicSettings/components/tabs/ManagedSite/search/ManagedSiteCore.search"
import { managedSiteSettingsSearchModules } from "~/features/BasicSettings/components/tabs/ManagedSite/search/managedSiteSettingsSearchRegistry"

const modules = Object.values(managedSiteSettingsSearchModules)
export const managedSiteSearchSections = [
  ...managedSiteCoreSearchSections,
  ...modules.flatMap((module) => module.sections),
]
export const managedSiteSearchControls = [
  ...managedSiteCoreSearchControls,
  ...modules.flatMap((module) => module.controls),
]
