import AutoCheckinSettings from "./AutoCheckinSettings"
import RedemptionAssistSettings from "./RedemptionAssistSettings"
import WebAiApiCheckSettings from "./WebAiApiCheckSettings"

/**
 * Basic Settings tab combining auto-checkin and redemption assist panels.
 */
export default function CheckinRedeemTab() {
  return (
    <div className="space-y-6">
      <section id="checkin">
        <AutoCheckinSettings />
      </section>
      <section id="redemption-assist">
        <RedemptionAssistSettings />
      </section>
      <section id="web-ai-api-check">
        <WebAiApiCheckSettings />
      </section>
    </div>
  )
}
