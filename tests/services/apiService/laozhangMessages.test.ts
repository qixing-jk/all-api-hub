import { describe, expect, it, vi } from "vitest"

import {
  fetchLaoZhangMessages,
  markLaoZhangMessageRead,
} from "~/services/apiService/newApiFamily/variants/laozhangMessages"
import { AuthTypeEnum } from "~/types"

const { data, envelope } = vi.hoisted(() => ({
  data: vi.fn(),
  envelope: vi.fn(),
}))
vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: { data, envelope },
}))

const request = {
  baseUrl: "https://api2.laozhang.ai",
  accountId: "lz",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "system-token",
    userId: 7,
  },
}

describe("LaoZhang Message center", () => {
  it("fetches every page with account authentication, including already-read messages", async () => {
    data
      .mockResolvedValueOnce({
        messages: [
          {
            id: 11,
            title: "恢复",
            content: "已恢复",
            is_read: true,
            created_at: 1790039483,
          },
        ],
        total: 2,
      })
      .mockResolvedValueOnce({
        messages: [
          {
            id: 10,
            title: "维护",
            content: "维护中",
            is_read: false,
            created_at: 1789490790,
            link: "https://docs.laozhang.ai/",
          },
        ],
        total: 2,
      })
    await expect(fetchLaoZhangMessages(request)).resolves.toEqual([
      {
        id: "11",
        title: "恢复",
        content: "已恢复",
        read: true,
        createdAt: 1790039483000,
      },
      {
        id: "10",
        title: "维护",
        content: "维护中\n\nhttps://docs.laozhang.ai/",
        read: false,
        createdAt: 1789490790000,
      },
    ])
    expect(data.mock.calls).toEqual([
      [request, { endpoint: "/api/user/messages?page=1&page_size=20" }],
      [request, { endpoint: "/api/user/messages?page=2&page_size=20" }],
    ])
  })

  it("does not silently turn authentication failure into an empty successful scan", async () => {
    data.mockRejectedValueOnce(new Error("Unauthorized"))
    await expect(fetchLaoZhangMessages(request)).rejects.toThrow("Unauthorized")
  })

  it("reports repeated pages instead of treating incomplete history as success", async () => {
    const page = {
      messages: [{ id: 11, title: "Notice", content: "Content" }],
      total: 100,
    }
    data.mockResolvedValueOnce(page).mockResolvedValueOnce(page)
    await expect(fetchLaoZhangMessages(request)).rejects.toThrow("repeated")
  })

  it("marks only a Message center id read through the native endpoint", async () => {
    envelope.mockResolvedValueOnce({ success: true })
    await expect(markLaoZhangMessageRead({ request, id: "11" })).resolves.toBe(
      true,
    )
    expect(envelope).toHaveBeenCalledWith(request, {
      endpoint: "/api/user/messages/11/read",
      options: { method: "POST" },
    })
    await expect(
      markLaoZhangMessageRead({ request, id: "public-notice" }),
    ).resolves.toBe(false)
    expect(envelope).toHaveBeenCalledTimes(1)
  })
})
