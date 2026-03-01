import PermissionSettings from "./PermissionSettings"

/**
 * Wrapper tab exposing the permissions settings section.
 */
export default function PermissionsTab() {
  return (
    <div className="space-y-6">
      <section id="permissions">
        <PermissionSettings />
      </section>
    </div>
  )
}
