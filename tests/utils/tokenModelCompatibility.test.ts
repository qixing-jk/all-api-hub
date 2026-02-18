import { describe, expect, it } from "vitest"

import {
  isTokenCompatibleWithModel,
  parseTokenModelAllowList,
} from "~/utils/tokenModelCompatibility"

describe("tokenModelCompatibility", () => {
  describe("parseTokenModelAllowList", () => {
    it("returns an empty array for empty input", () => {
      expect(parseTokenModelAllowList(undefined)).toEqual([])
      expect(parseTokenModelAllowList(null)).toEqual([])
      expect(parseTokenModelAllowList("")).toEqual([])
      expect(parseTokenModelAllowList(" , , ")).toEqual([])
    })

    it("trims whitespace and de-duplicates values while preserving order", () => {
      expect(
        parseTokenModelAllowList(" gpt-4 , gpt-4,  gpt-3.5 ,gpt-4 "),
      ).toEqual(["gpt-4", "gpt-3.5"])
    })
  })

  describe("isTokenCompatibleWithModel", () => {
    it("treats enabled tokens with no allow-list as compatible", () => {
      const token = {
        status: 1,
        group: "default",
        model_limits_enabled: false,
        model_limits: "",
      } as any

      expect(
        isTokenCompatibleWithModel(token, {
          id: "gpt-4",
          enableGroups: ["default"],
        }),
      ).toBe(true)
    })

    it("treats enabled tokens with allow-list including model as compatible", () => {
      const token = {
        status: 1,
        group: "default",
        model_limits_enabled: true,
        model_limits: "gpt-4,gpt-3.5",
      } as any

      expect(
        isTokenCompatibleWithModel(token, {
          id: "gpt-4",
          enableGroups: ["default"],
        }),
      ).toBe(true)
    })

    it("treats enabled tokens with allow-list excluding model as incompatible", () => {
      const token = {
        status: 1,
        group: "default",
        model_limits_enabled: true,
        model_limits: "gpt-3.5",
      } as any

      expect(
        isTokenCompatibleWithModel(token, {
          id: "gpt-4",
          enableGroups: ["default"],
        }),
      ).toBe(false)
    })

    it("ignores disabled tokens regardless of allow-list", () => {
      const token = {
        status: 0,
        group: "default",
        model_limits_enabled: false,
        model_limits: "",
      } as any

      expect(
        isTokenCompatibleWithModel(token, {
          id: "gpt-4",
          enableGroups: ["default"],
        }),
      ).toBe(false)
    })

    it("uses `models` when present for compatibility checks", () => {
      const token = {
        status: 1,
        group: "default",
        model_limits_enabled: false,
        model_limits: "",
        models: "gpt-4, gpt-3.5",
      } as any

      expect(
        isTokenCompatibleWithModel(token, {
          id: "gpt-4",
          enableGroups: ["default"],
        }),
      ).toBe(true)
      expect(
        isTokenCompatibleWithModel(token, {
          id: "gpt-4o-mini",
          enableGroups: ["default"],
        }),
      ).toBe(false)
    })

    it("treats enabled-but-empty allow-list as incompatible", () => {
      const token = {
        status: 1,
        group: "default",
        model_limits_enabled: true,
        model_limits: " , ",
      } as any

      expect(
        isTokenCompatibleWithModel(token, {
          id: "gpt-4",
          enableGroups: ["default"],
        }),
      ).toBe(false)
    })

    it("treats group mismatch as incompatible", () => {
      const token = {
        status: 1,
        group: "vip",
        model_limits_enabled: false,
        model_limits: "",
      } as any

      expect(
        isTokenCompatibleWithModel(token, {
          id: "gpt-4",
          enableGroups: ["default"],
        }),
      ).toBe(false)
    })

    it("treats empty token group as default group", () => {
      const token = {
        status: 1,
        group: "",
        model_limits_enabled: false,
        model_limits: "",
      } as any

      expect(
        isTokenCompatibleWithModel(token, {
          id: "gpt-4",
          enableGroups: ["default"],
        }),
      ).toBe(true)
    })
  })
})
