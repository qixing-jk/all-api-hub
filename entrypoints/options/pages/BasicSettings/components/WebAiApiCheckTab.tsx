import WebAiApiCheckSettings from "./WebAiApiCheckSettings"

/**
 * Wrapper tab that renders Web AI API Check settings within Basic Settings.
 */
export default function WebAiApiCheckTab() {
  return (
    <div className="space-y-6">
      <section id="web-ai-api-check">
        <WebAiApiCheckSettings />
      </section>
    </div>
  )
}
