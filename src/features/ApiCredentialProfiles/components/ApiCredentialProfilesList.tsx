import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

import type { ApiCredentialProfilesController } from "../hooks/useApiCredentialProfilesController"
import { ApiCredentialProfileListItem } from "./ApiCredentialProfileListItem"

interface ApiCredentialProfilesListProps {
  profiles: ApiCredentialProfile[]
  controller: ApiCredentialProfilesController
}

/**
 * Renders API credential profiles with per-item actions wired to the controller.
 */
export function ApiCredentialProfilesList({
  profiles,
  controller,
}: ApiCredentialProfilesListProps) {
  return (
    <div className="space-y-3">
      {profiles.map((profile) => (
        <ApiCredentialProfileListItem
          key={profile.id}
          profile={profile}
          verificationSummary={controller.getProfileVerificationSummary(
            profile.id,
          )}
          tagNames={
            (profile.tagIds ?? [])
              .map((id) => controller.tagNameById.get(id))
              .filter(Boolean) as string[]
          }
          visibleKeys={controller.visibleKeys}
          toggleKeyVisibility={controller.toggleKeyVisibility}
          onCopyBaseUrl={controller.handleCopyBaseUrl}
          onCopyApiKey={controller.handleCopyApiKey}
          onCopyBundle={controller.handleCopyBundle}
          onOpenModelManagement={controller.handleOpenModelManagement}
          onExport={controller.handleExport}
          managedSiteType={controller.managedSiteType}
          managedSiteLabel={controller.managedSiteLabel}
          onVerify={(p) => controller.setVerifyingProfile(p)}
          onVerifyCliSupport={(p) => controller.setCliVerifyingProfile(p)}
          onEdit={controller.openEditDialog}
          onDelete={controller.handleRequestDelete}
        />
      ))}
    </div>
  )
}
