import {
  managedSiteCoreSearchControls,
  managedSiteCoreSearchSections,
} from "./ManagedSiteCore.search"
import { managedSiteSettingsSearchModules } from "./managedSiteSettingsSearchRegistry"

const modules = Object.values(managedSiteSettingsSearchModules)
export const managedSiteSearchSections = [
  ...managedSiteCoreSearchSections,
  ...modules.flatMap((module) => module.sections),
]
export const managedSiteSearchControls = [
  ...managedSiteCoreSearchControls,
  ...modules.flatMap((module) => module.controls),
]
