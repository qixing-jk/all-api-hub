import { aimlApiAccountOnboarding } from "~/services/apiAdapters/aimlapi/accountOnboarding"
import type { AccountOnboardingCapability } from "~/services/apiAdapters/contracts/accountOnboarding"
import { novitaAccountOnboarding } from "~/services/apiAdapters/novita/accountOnboarding"

// Active orchestration belongs above detection; passive registries never import this module.
const capabilities: readonly AccountOnboardingCapability[] = [
  novitaAccountOnboarding,
  aimlApiAccountOnboarding,
]

/** Resolve explicit onboarding independently of passive identity and disclosure policy. */
export function getAccountOnboardingCapability(url: string) {
  return capabilities.find((capability) => capability.matchesUrl(url))
}
