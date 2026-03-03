import { describe, expect, it } from "vitest"

import { ChannelType } from "~/constants"
import { getChannelTypeName } from "~/services/managedSites/utils/channelTypeName"

describe("newApi", () => {
  describe("getChannelTypeName", () => {
    it("returns name for valid channel type", () => {
      const name = getChannelTypeName(ChannelType.OpenAI)
      expect(name).toBe("OpenAI")
    })

    it("returns unknown for invalid channel type", () => {
      const name = getChannelTypeName(999 as ChannelType)
      expect(name).toBe("Unknown")
    })

    it("handles Unknown channel type", () => {
      const name = getChannelTypeName(ChannelType.Unknown)
      expect(name).toBe("Unknown")
    })
  })
})
