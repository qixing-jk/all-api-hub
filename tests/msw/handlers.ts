import { http, HttpResponse, type HttpHandler } from "msw"

/**
 * MSW handlers for mocking aggregator API endpoints
 * These are placeholder handlers that can be extended for specific tests
 */
export const handlers: HttpHandler[] = [
  // Mock account info endpoint (common pattern across aggregators)
  http.get("https://api.example.com/api/user/self", () => {
    return HttpResponse.json({
      success: true,
      message: "",
      data: {
        username: "test-user",
        display_name: "Test User",
        role: 1,
        status: 1,
        email: "test@example.com",
        github_id: "",
        wechat_id: "",
        verification_code: "",
        access_token: "mock-token",
        quota: 500000,
        used_quota: 100000,
        request_count: 50,
      },
    })
  }),

  // Mock subscription endpoint (for balance/quota info)
  http.get("https://api.example.com/api/user/subscription", () => {
    return HttpResponse.json({
      success: true,
      message: "",
      data: {
        quota: 500000,
        used_quota: 100000,
        remain_quota: 400000,
        unlimited_quota: false,
        expired_time: -1,
        start_time: 1640000000,
        subscription_count: 1,
      },
    })
  }),

  // Mock available models endpoint
  http.get("https://api.example.com/api/channel", () => {
    return HttpResponse.json({
      success: true,
      message: "",
      data: [
        {
          id: 1,
          name: "gpt-3.5-turbo",
          type: 1,
          status: 1,
          models: ["gpt-3.5-turbo", "gpt-3.5-turbo-16k"],
        },
        {
          id: 2,
          name: "gpt-4",
          type: 1,
          status: 1,
          models: ["gpt-4", "gpt-4-32k"],
        },
      ],
    })
  }),

  // Mock token/key list endpoint
  http.get("https://api.example.com/api/token", () => {
    return HttpResponse.json({
      success: true,
      message: "",
      data: [
        {
          id: 1,
          name: "test-key-1",
          key: "sk-xxx1",
          created_time: 1640000000,
          accessed_time: 1640100000,
          expired_time: -1,
          remain_quota: 400000,
          unlimited_quota: false,
          used_quota: 100000,
          status: 1,
        },
        {
          id: 2,
          name: "test-key-2",
          key: "sk-xxx2",
          created_time: 1640000000,
          accessed_time: 1640100000,
          expired_time: -1,
          remain_quota: 200000,
          unlimited_quota: false,
          used_quota: 50000,
          status: 1,
        },
      ],
    })
  }),

  // Mock usage/consumption logs endpoint
  http.get("https://api.example.com/api/log", () => {
    return HttpResponse.json({
      success: true,
      message: "",
      data: [
        {
          id: 1,
          created_at: 1640000000,
          type: 1,
          model_name: "gpt-3.5-turbo",
          quota: 1000,
          prompt_tokens: 50,
          completion_tokens: 100,
          content: "test request",
        },
      ],
    })
  }),

  // Mock exchange rate endpoint (for CNY conversion)
  http.get("https://api.exchangerate-api.com/v4/latest/USD", () => {
    return HttpResponse.json({
      rates: {
        CNY: 7.2,
        USD: 1,
      },
    })
  }),
]
