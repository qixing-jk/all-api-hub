import CliProxySettings from "./CliProxySettings"

/**
 * Wrapper tab that renders CLI Proxy settings within Basic Settings.
 */
export default function CliProxyTab() {
  return (
    <div className="space-y-6">
      <section id="cli-proxy">
        <CliProxySettings />
      </section>
    </div>
  )
}
