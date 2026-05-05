import {
  dataBackupSearchControls,
  dataBackupSearchSections,
} from "./DataBackup.search"
import {
  importExportPageSearchControls,
  importExportPageSearchSections,
} from "./ImportExportPage.search"

export const importExportSearchSections = [
  ...dataBackupSearchSections,
  ...importExportPageSearchSections,
]

export const importExportSearchControls = [
  ...dataBackupSearchControls,
  ...importExportPageSearchControls,
]
