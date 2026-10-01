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

const scenes: Partial<Record<string, React.FC>> = {
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
const plannedScenes = plan.map((shot) => {
  const component = Object.hasOwn(scenes, shot.id) ? scenes[shot.id] : undefined
  if (!component) {
    throw new Error(
      `No video scene is registered for shot "${shot.id}". Check src/shot-plan.json and the scenes registry.`,
    )
  }
  return { shot, component }
})

const Root = () => (
  <>
    {plannedScenes.map(({ shot: s, component }) => (
      <Composition
        key={s.id}
        id={s.id}
        component={component}
        width={1920}
        height={1080}
        fps={60}
        durationInFrames={s.frames}
      />
    ))}
  </>
)
registerRoot(Root)
