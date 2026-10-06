import type { ManagedSitePresentationDefinition } from "./managedResourceTablePresentation"
import { axonHubPresentation } from "./sites/axonHub"
import { claudeCodeHubPresentation } from "./sites/claudeCodeHub"
import { cliProxyApiPresentation } from "./sites/cliProxyApi"
import { doneHubPresentation } from "./sites/doneHub"
import { gptLoadPresentation } from "./sites/gptLoad"
import { newApiPresentation } from "./sites/newApi"
import { octopusPresentation } from "./sites/octopus"
import { omniRoutePresentation } from "./sites/omniRoute"
import { sub2ApiPresentation } from "./sites/sub2Api"
import { veloeraPresentation } from "./sites/veloera"

/** Registers each site's field and table definitions together. */
export const managedSitePresentationDefinitions: readonly ManagedSitePresentationDefinition[] =
  [
    cliProxyApiPresentation,
    newApiPresentation,
    veloeraPresentation,
    doneHubPresentation,
    axonHubPresentation,
    sub2ApiPresentation,
    omniRoutePresentation,
    gptLoadPresentation,
    claudeCodeHubPresentation,
    octopusPresentation,
  ]
