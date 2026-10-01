import React from "react"
import { Composition, registerRoot } from "remotion"

import {
  AccountsHero,
  AccountsList,
  AccountsSummary,
  CheckinBatch,
  CheckinPeek,
  CredentialsScene,
  PriceScene,
} from "./CoreScenes"
import {
  AddAccountScene,
  AnnouncementsScene,
  GatewayScene,
  UsageScene,
} from "./FeatureScenes"
import plan from "./shot-plan.json"

const scenes: Record<string, React.FC> = {
  AccountsHero,
  CheckinPeek,
  CheckinBatch,
  PriceScene,
  AccountsList,
  AccountsSummary,
  CredentialsScene,
  AddAccountScene,
  AnnouncementsScene,
  UsageScene,
  GatewayScene,
}
const Root = () => (
  <>
    {plan.map((s) => (
      <Composition
        key={s.id}
        id={s.id}
        component={scenes[s.id]}
        width={1920}
        height={1080}
        fps={60}
        durationInFrames={s.frames}
      />
    ))}
  </>
)
registerRoot(Root)
