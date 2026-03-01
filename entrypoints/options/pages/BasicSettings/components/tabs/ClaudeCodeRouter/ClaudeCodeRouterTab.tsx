import ClaudeCodeRouterSettings from "./ClaudeCodeRouterSettings"

/**
 * Wrapper tab that renders Claude Code Router settings within Basic Settings.
 */
export default function ClaudeCodeRouterTab() {
  return (
    <div className="space-y-6">
      <section id="claude-code-router">
        <ClaudeCodeRouterSettings />
      </section>
    </div>
  )
}
