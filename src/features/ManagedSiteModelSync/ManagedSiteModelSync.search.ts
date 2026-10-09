import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { MODEL_SYNC_EXCLUSIONS_TARGET_ID } from "~/features/ManagedSiteModelSync/exclusions/targetIds"
import { buildPageSectionDefinition } from "~/features/OptionsSearch/registryHelpers"
import { supportsManagedSiteModelSync } from "~/services/managedSites/utils/managedSite"

export const modelSyncSearchSections = [
  buildPageSectionDefinition(
    "section:model-sync-exclusions",
    MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC,
    MODEL_SYNC_EXCLUSIONS_TARGET_ID,
    "managedSiteModelSync:execution.exclusions.title",
    349,
    {
      descriptionKey: "managedSiteModelSync:execution.exclusions.description",
      keywords: [
        "model sync",
        "exclude channels",
        "skip channels",
        "排除渠道",
        "跳过同步",
      ],
      isVisible: (context) =>
        supportsManagedSiteModelSync(context.managedSiteType),
    },
  ),
]
