import CCHSettings from "./CCHSettings"

/**
 * Wrapper tab that renders CCH (Claude Code Hub) settings within Basic Settings.
 */
export default function CCHTab() {
  return (
    <div className="space-y-6">
      <section id="cch">
        <CCHSettings />
      </section>
    </div>
  )
}
