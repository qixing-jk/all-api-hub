import { expect, it } from "vitest"

import { getAccountOnboardingCapability } from "~/services/accounts/onboarding/registry"

it.each([
  ["https://novita.ai", true],
  ["https://novita.ai/settings", true],
  ["https://aimlapi.com/app/keys", true],
  ["https://www.aimlapi.com", true],
  ["https://api.aimlapi.com", false],
  ["https://novita.ai.evil.invalid", false],
  ["https://aimlapi.com.evil.invalid", false],
  ["https://example.com", false],
  ["not a URL", false],
])(
  "selects active onboarding independently of privacy policy for %s",
  (url, supported) => {
    expect(Boolean(getAccountOnboardingCapability(url))).toBe(supported)
  },
)
