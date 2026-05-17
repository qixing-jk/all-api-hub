import { describe, expect, it } from "vitest"

import { mapToDayjsLocale, resources } from "~/utils/i18n/resources"

describe("i18n resources", () => {
  it("loads locale namespaces under their language keys", () => {
    expect(resources.en).toMatchObject({
      common: expect.objectContaining({
        actions: expect.objectContaining({
          cancel: "Cancel",
        }),
      }),
      ui: expect.any(Object),
    })
    expect(resources.ja).toMatchObject({
      common: expect.objectContaining({
        actions: expect.objectContaining({
          cancel: "キャンセル",
        }),
      }),
      settings: expect.any(Object),
    })
    expect(resources.vi).toMatchObject({
      common: expect.objectContaining({
        actions: expect.objectContaining({
          cancel: "Hủy",
        }),
      }),
      settings: expect.any(Object),
    })
    expect(resources["zh-CN"]).toMatchObject({
      common: expect.objectContaining({
        actions: expect.objectContaining({
          cancel: "取消",
        }),
      }),
      modelList: expect.any(Object),
    })
    expect(resources["zh-TW"]).toMatchObject({
      common: expect.objectContaining({
        actions: expect.objectContaining({
          cancel: "取消",
        }),
      }),
      managedSiteChannels: expect.any(Object),
    })
  })

  it("normalizes i18next language tags to dayjs-compatible locale names", () => {
    expect(mapToDayjsLocale("EN")).toBe("en")
    expect(mapToDayjsLocale("zh_TW")).toBe("zh-tw")
    expect(mapToDayjsLocale("ja-JP")).toBe("ja-jp")
    expect(mapToDayjsLocale("vi_VN")).toBe("vi-vn")
  })
})
