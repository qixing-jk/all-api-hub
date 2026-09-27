import SiteAnnouncementsSettings from "./SiteAnnouncementsSettings"

/**
 * Wrapper tab that renders provider-site announcement settings within Basic Settings.
 */
export default function SiteAnnouncementsTab() {
  return (
    <div className="space-y-density-6">
      <SiteAnnouncementsSettings />
    </div>
  )
}
