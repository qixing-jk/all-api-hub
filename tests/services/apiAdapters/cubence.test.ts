import { describe, expect, it, vi } from "vitest"

import { isValidAccount } from "~/services/accounts/editing/accountFormValidation"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions"
import { cubenceContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/cubence"
import { createCubenceKeyEditor } from "~/services/apiAdapters/cubence/keyEditor"
import { cubenceKeyResources } from "~/services/apiAdapters/cubence/keyResources"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import * as cubenceKeys from "~/services/apiService/cubence/keys"
import { AuthTypeEnum } from "~/types"

describe("Cubence registration and editor", () => {
  it.each(["", "   "])(
    "uses the default name for a blank hint %j",
    (nameHint) => {
      const editor = createCubenceKeyEditor(async () => [], undefined, {
        nameHint,
      })
      expect(editor.initialValues.name).toBe("default key (auto)")
    },
  )

  it("retains the model's preferred native group and restricts creation to its allowed groups", async () => {
    const groups = [13, 39, 72].map((id) => ({
      id,
      name: `Group ${id}`,
      multiplier: 1,
      is_active: true,
      supported_protocols: [],
    }))
    const editor = createCubenceKeyEditor(async () => groups, undefined, {
      preferredGroup: "39",
      allowedGroups: ["13", "39"],
      nameHint: "Model key",
    })
    expect(editor.initialValues).toMatchObject({
      group: "39",
      name: "Model key",
    })
    expect(
      (await editor.loadOptions!("group", editor.initialValues)).map(
        (option) => option.value,
      ),
    ).toEqual(["13", "39"])
    expect(
      editor.validate({ ...editor.initialValues, group: "72" }).valid,
    ).toBe(false)
  })
  it.each([
    ["max-stable(only for CC)(x1.75)", 1.75, "max-stable(only for CC)"],
    ["deepseek-off(basex0.8)", 0.8, "deepseek-off"],
    ["glm-off(base0.5x)", 0.5, "glm-off"],
    ["deepseek-cheap(0.45)", 0.45, "deepseek-cheap"],
    ["gpt-image(0.1 per use)", 0.1, "gpt-image(0.1 per use)"],
    ["version(2)", 1, "version(2)"],
  ])(
    "separates the native group name %s from its multiplier",
    async (name, multiplier, displayLabel) => {
      const editor = createCubenceKeyEditor(async () => [
        { id: 13, name, multiplier, is_active: true, supported_protocols: [] },
      ])
      expect(await editor.loadOptions!("group", editor.initialValues)).toEqual([
        { value: "13", displayLabel, secondaryLabel: `${multiplier}x` },
      ])
    },
  )
  it("allows verified browser-session sites to save without a cookie export while other Cookie sites still require one", () => {
    const form = {
      siteName: "Cubence",
      username: "example",
      userId: "7",
      authType: AuthTypeEnum.Cookie,
      accessToken: "",
      cookieAuthSessionCookie: "",
      exchangeRate: "7",
    }
    expect(isValidAccount({ ...form, siteType: "cubence" })).toBe(true)
    expect(isValidAccount({ ...form, siteType: "new-api" })).toBe(false)
  })
  it("registers one account-only family with cookie onboarding and separate inference origin", () => {
    expect(getAccountSiteDefinition("cubence")).toMatchObject({
      adapterFamily: "cubence",
      scopes: ["account"],
      productProfile: {
        auth: { allowedAuthTypes: ["cookie"], defaultAuthType: "cookie" },
        urls: {
          storageOrigin: "https://cubence.com",
          managedChannelOrigin: "https://api.cubence.com",
        },
      },
    })
    expect(
      getSiteTypeCapabilities("cubence").account?.keyResourceManagement
        ?.defaultCreation,
    ).toBe("requires-input")
    expect(getSiteTypeCapabilities("cubence").managedSites).toBeUndefined()
  })

  it("never extracts a console session from an inference host", () => {
    expect(
      cubenceContentSessionExtractor.canExtract({
        siteTypeHint: "cubence",
        url: "https://api.cubence.com",
      }),
    ).toBe(false)
    expect(
      cubenceContentSessionExtractor.canExtract({
        siteTypeHint: "cubence",
        url: "https://cubence.com/dashboard",
      }),
    ).toBe(true)
  })

  it("defaults new keys to unlimited and requires a loaded, confirmed group", async () => {
    const loadGroups = vi.fn().mockResolvedValue([
      {
        id: 72,
        name: "openai-off",
        is_active: true,
        multiplier: 0.8,
        supported_protocols: ["openai.responses"],
      },
    ])
    const editor = createCubenceKeyEditor(loadGroups)
    expect(loadGroups).not.toHaveBeenCalled()
    expect(editor.initialValues).toMatchObject({
      quota: 10,
      unlimited: true,
      group: "",
    })
    expect(editor.validate(editor.initialValues)).toMatchObject({
      valid: false,
      issues: [{ fieldId: "group", code: "required" }],
    })
    const values = { ...editor.initialValues, group: "72" }
    expect(editor.validate(values).valid).toBe(false)
    await editor.loadOptions!("group", values)
    expect(editor.validate(values)).toEqual({ valid: true })
    expect(editor.buildCommand(values)).toMatchObject({
      quota_limit: -1,
      share_group_id: 72,
    })
    expect(
      editor.validate({ ...values, unlimited: false, quota: 0.0000001 }),
    ).toMatchObject({
      valid: false,
      issues: [{ fieldId: "quota", code: "out_of_range" }],
    })
    expect(
      editor.validate({ ...values, unlimited: false, quota: 0.000001 }),
    ).toEqual({
      valid: true,
    })
    expect(editor.buildCommand({ ...values, unlimited: false })).toMatchObject({
      quota_limit: 10000000,
    })
  })

  it("opens the local form and lists keys independently of remote group availability", async () => {
    const groups = vi
      .spyOn(cubenceKeys, "fetchGroups")
      .mockRejectedValue(new Error("offline"))
    const keys = vi.spyOn(cubenceKeys, "fetchKeys").mockResolvedValue([])
    try {
      const session = await cubenceKeyResources.open({
        account: { id: "test", name: "Cubence", siteType: "cubence" },
        request: {
          accountId: "test",
          baseUrl: "https://cubence.com",
          auth: { authType: AuthTypeEnum.Cookie, userId: "7" },
        },
      })
      const collection = await session.openCollection("account")
      await collection.list()
      const editor = await session.openCreateEditor("account")
      expect(editor.initialValues.quota).toBe(10)
      expect(groups).not.toHaveBeenCalled()
      expect(keys).toHaveBeenCalledTimes(1)
      await expect(
        editor.loadOptions!("group", editor.initialValues),
      ).rejects.toThrow()
      expect(groups).toHaveBeenCalledTimes(1)
    } finally {
      groups.mockRestore()
      keys.mockRestore()
    }
  })

  it("does not validate a stale group after failed or cancelled option loads", async () => {
    const group = {
      id: 72,
      name: "Available",
      is_active: true,
      multiplier: 1,
      supported_protocols: [],
    }
    const loadGroups = vi.fn().mockResolvedValue([group])
    const editor = createCubenceKeyEditor(loadGroups)
    const values = { ...editor.initialValues, group: "72" }
    await editor.loadOptions!("group", values)
    expect(editor.validate(values).valid).toBe(true)

    loadGroups.mockRejectedValueOnce(new Error("offline"))
    await expect(editor.loadOptions!("group", values)).rejects.toThrow(
      "offline",
    )
    expect(editor.validate(values).valid).toBe(false)

    const controller = new AbortController()
    loadGroups.mockImplementationOnce(async () => {
      controller.abort()
      return [group]
    })
    await expect(
      editor.loadOptions!("group", values, { signal: controller.signal }),
    ).rejects.toThrow()
    expect(editor.validate(values).valid).toBe(false)

    await editor.loadOptions!("group", values)
    expect(editor.validate(values).valid).toBe(true)
  })
})
