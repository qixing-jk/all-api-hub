import { describe, expect, it, vi } from "vitest"

import type { ChannelModelFilterRule } from "~/types/channelModelFilters"

vi.mock("@plasmohq/storage", () => ({
  Storage: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
  })),
}))

const { channelConfigStorage } = await import(
  "~/services/managedSites/channelConfigStorage"
)

describe("channelConfigStorage", () => {
  describe("pattern rule validation", () => {
    it("should accept valid pattern rules", async () => {
      const patternRule: Partial<ChannelModelFilterRule> = {
        ruleType: "pattern",
        name: "GPT-4 Only",
        pattern: "gpt-4",
        isRegex: false,
        action: "include",
        enabled: true,
      }

      const success = await channelConfigStorage.upsertFilters(1, [
        patternRule as ChannelModelFilterRule,
      ])

      expect(success).toBe(true)
    })

    it("should reject pattern rules without pattern", async () => {
      const invalidRule: Partial<ChannelModelFilterRule> = {
        ruleType: "pattern",
        name: "Invalid Rule",
        pattern: "",
        action: "include",
        enabled: true,
      }

      await expect(
        channelConfigStorage.upsertFilters(1, [
          invalidRule as ChannelModelFilterRule,
        ]),
      ).rejects.toThrow()
    })

    it("should reject pattern rules with invalid regex", async () => {
      const invalidRegexRule: Partial<ChannelModelFilterRule> = {
        ruleType: "pattern",
        name: "Invalid Regex",
        pattern: "[invalid(regex",
        isRegex: true,
        action: "include",
        enabled: true,
      }

      await expect(
        channelConfigStorage.upsertFilters(1, [
          invalidRegexRule as ChannelModelFilterRule,
        ]),
      ).rejects.toThrow()
    })
  })

  describe("probe rule validation", () => {
    it("should accept valid probe rules", async () => {
      const probeRule: Partial<ChannelModelFilterRule> = {
        ruleType: "probe",
        name: "Text Generation Test",
        probeId: "text-generation",
        apiType: "openai-compatible",
        action: "include",
        enabled: true,
      }

      const success = await channelConfigStorage.upsertFilters(1, [
        probeRule as ChannelModelFilterRule,
      ])

      expect(success).toBe(true)
    })

    it("should reject probe rules without probeId", async () => {
      const invalidRule: Partial<ChannelModelFilterRule> = {
        ruleType: "probe",
        name: "Invalid Probe",
        apiType: "openai-compatible",
        action: "include",
        enabled: true,
      }

      await expect(
        channelConfigStorage.upsertFilters(1, [
          invalidRule as ChannelModelFilterRule,
        ]),
      ).rejects.toThrow()
    })

    it("should reject probe rules without apiType", async () => {
      const invalidRule: Partial<ChannelModelFilterRule> = {
        ruleType: "probe",
        name: "Invalid Probe",
        probeId: "text-generation",
        action: "include",
        enabled: true,
      }

      await expect(
        channelConfigStorage.upsertFilters(1, [
          invalidRule as ChannelModelFilterRule,
        ]),
      ).rejects.toThrow()
    })

    it("should accept probe rules with optional verification credentials", async () => {
      const probeRuleWithCreds: Partial<ChannelModelFilterRule> = {
        ruleType: "probe",
        name: "Text Generation Test",
        probeId: "text-generation",
        apiType: "openai",
        verificationBaseUrl: "https://api.openai.com/v1",
        verificationApiKey: "sk-test-key",
        action: "include",
        enabled: true,
      }

      const success = await channelConfigStorage.upsertFilters(1, [
        probeRuleWithCreds as ChannelModelFilterRule,
      ])

      expect(success).toBe(true)
    })
  })

  describe("verification credentials management", () => {
    it("should save verification credentials", async () => {
      const credentials = {
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test-key",
        apiType: "openai",
        updatedAt: Date.now(),
      }

      const success = await channelConfigStorage.upsertVerificationCredentials(
        1,
        credentials,
      )

      expect(success).toBe(true)
    })

    it("should retrieve saved verification credentials", async () => {
      const credentials = {
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test-key",
        apiType: "openai",
        updatedAt: Date.now(),
      }

      await channelConfigStorage.upsertVerificationCredentials(1, credentials)
      const config = await channelConfigStorage.getConfig(1)

      expect(config.verificationCredentials).toBeDefined()
      expect(config.verificationCredentials?.baseUrl).toBe(credentials.baseUrl)
      expect(config.verificationCredentials?.apiKey).toBe(credentials.apiKey)
      expect(config.verificationCredentials?.apiType).toBe(credentials.apiType)
    })

    it("should clear verification credentials", async () => {
      const credentials = {
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test-key",
        apiType: "openai",
        updatedAt: Date.now(),
      }

      await channelConfigStorage.upsertVerificationCredentials(1, credentials)
      await channelConfigStorage.clearVerificationCredentials(1)

      const config = await channelConfigStorage.getConfig(1)
      expect(config.verificationCredentials).toBeUndefined()
    })
  })

  describe("mixed rule types", () => {
    it("should accept both pattern and probe rules together", async () => {
      const patternRule: Partial<ChannelModelFilterRule> = {
        ruleType: "pattern",
        name: "GPT-4 Pattern",
        pattern: "gpt-4",
        isRegex: false,
        action: "include",
        enabled: true,
      }

      const probeRule: Partial<ChannelModelFilterRule> = {
        ruleType: "probe",
        name: "Text Generation Probe",
        probeId: "text-generation",
        apiType: "openai-compatible",
        action: "include",
        enabled: true,
      }

      const success = await channelConfigStorage.upsertFilters(1, [
        patternRule as ChannelModelFilterRule,
        probeRule as ChannelModelFilterRule,
      ])

      expect(success).toBe(true)
    })
  })
})
