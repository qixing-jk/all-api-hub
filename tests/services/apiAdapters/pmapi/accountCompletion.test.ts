import "~/services/checkin/autoCheckin/providers"

import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { completeAutoDetectedAccount } from "~/services/accounts/autoDetectCompletion/completion"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const origin = "https://pmcat.top"
const envelope = (data: unknown) => ({ data, message: "", success: true })

describe("PM-API account completion", () => {
  it.each([true, false])(
    "uses deployment verification facts for the new-account default: %s",
    async (captcha) => {
      server.use(
        http.get(`${origin}/api/me`, () =>
          HttpResponse.json(
            envelope({
              id: 7,
              username: "pm-user",
              quota: 0,
              checked_in_today: false,
            }),
          ),
        ),
        http.get(`${origin}/api/status`, () =>
          HttpResponse.json(
            envelope({
              name: "PM-API",
              checkin_enabled: true,
              captcha: { enabled: captcha, scenes: ["checkin"] },
            }),
          ),
        ),
      )
      const result = await completeAutoDetectedAccount({
        url: origin,
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: {
          siteType: SITE_TYPES.PMAPI,
          userId: "7",
          accessToken: "console-token",
        },
      })
      expect(result.checkIn.automaticExecutionEnabled).toBe(!captcha)
      expect(
        result.checkIn.methodKnowledge.methods["pmapi:daily-checkin"]?.detection
          .outcome,
      ).toBe("matched")
    },
  )
})
