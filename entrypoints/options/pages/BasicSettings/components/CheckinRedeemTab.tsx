import AutoCheckinSettings from "./AutoCheckinSettings"
import RedemptionAssistSettings from "./RedemptionAssistSettings"

export default function CheckinRedeemTab() {
  return (
    <div className="space-y-6">
      <section id="checkin-redeem">
        <AutoCheckinSettings />
        <RedemptionAssistSettings />
      </section>
    </div>
  )
}
