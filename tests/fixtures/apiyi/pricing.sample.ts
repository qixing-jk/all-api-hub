// Sanitized response shapes from https://api.apiyi.com/ (v29.8.9).
// Keep the model's four real groups and its context-dependent pricing.
export const apiyiPricingSample = {
  success: true,
  message: "",
  data: [
    {
      model_name: "gpt-6-astra",
      vendor_id: 2,
      vendor_name: "OpenAI",
      vendor_icon: "OpenAI",
      vendor_description:
        "全球领先的人工智能公司，GPT 系列覆盖文本、推理、编程、图像及多模态等核心 AI 能力。",
      quota_type: 0,
      model_ratio: 5,
      model_price: 0,
      owner_by: "",
      completion_ratio: 5,
      cache_ratio: 0.1,
      create_cache_ratio: 1.25,
      enable_groups: ["CodexResponses", "CodexReverse", "default", "svip"],
      supported_endpoint_types: ["openai"],
      billing_mode: "tiered_expr",
      billing_expr:
        'len <= 272000 ? tier("≤ 272K", p * 10 + c * 50 + cr * 1 + cc * 12.5) : tier("272001–1050K", p * 20 + c * 75 + cr * 2 + cc * 25)',
      pricing_version: "shell-api-modelmak-v1",
    },
  ],
  group_ratio: {
    CodexResponses: 1,
    CodexReverse: 0.5,
    default: 1,
    svip: 1,
  },
  usable_group: {
    CodexResponses: "CodexResponses",
    CodexReverse: "Codex_Reverse",
    default: "Default",
    svip: "SVIP",
  },
  ModelConditionalPricing: {
    "gpt-6-astra": {
      Currency: "USD",
      Conditions: [
        {
          MinTokens: 0,
          MaxTokens: 272000,
          InputRatio: 5,
          CompletionRatio: 5,
          FixedPrice: 0,
        },
        {
          MinTokens: 272001,
          MaxTokens: 1050000,
          InputRatio: 10,
          CompletionRatio: 3.75,
          FixedPrice: 0,
        },
      ],
    },
  },
}

// /api/groupPro/selectable?p=0&pageSize=1000; default pagination returns 10.
export const apiyiSelectableGroupsSample = [
  {
    name: "default",
    display_name: "Default",
    group_ratio: 1,
    convert_ratio: 1,
    is_selectable: true,
    is_visible: true,
  },
  {
    name: "SeeDance2",
    display_name: "SeeDance2",
    group_ratio: 0.18,
    convert_ratio: 0.18,
    is_selectable: true,
    is_visible: true,
  },
  {
    name: "SD2Fast",
    display_name: "SD2-Fast-Cheap",
    group_ratio: 0.15,
    convert_ratio: 0.15,
    is_selectable: true,
    is_visible: true,
  },
  {
    name: "SD2Mini",
    display_name: "SD2-Mini-Cheap",
    group_ratio: 0.1,
    convert_ratio: 0.1,
    is_selectable: true,
    is_visible: true,
  },
  {
    name: "Wan",
    display_name: "Wan&HappyHorse",
    group_ratio: 0.14,
    convert_ratio: 0.14,
    is_selectable: true,
    is_visible: true,
  },
  {
    name: "ClaudeCode",
    display_name: "ClaudeCode",
    group_ratio: 0.95,
    convert_ratio: 0.95,
    is_selectable: true,
    is_visible: true,
  },
  {
    name: "ClaudeCodeReverse",
    display_name: "Claude_Reverse",
    group_ratio: 0.5,
    convert_ratio: 0.5,
    is_selectable: true,
    is_visible: true,
  },
  {
    name: "CodexReverse",
    display_name: "Codex_Reverse",
    group_ratio: 0.5,
    convert_ratio: 0.5,
    is_selectable: true,
    is_visible: true,
  },
  {
    name: "CodexResponses",
    display_name: "CodexResponses",
    group_ratio: 1,
    convert_ratio: 1,
    is_selectable: true,
    is_visible: true,
  },
  {
    name: "image2Enterprise",
    display_name: "image2Enterprise",
    group_ratio: 1.2,
    convert_ratio: 1.2,
    is_selectable: true,
    is_visible: true,
  },
  {
    name: "image2_OSS",
    display_name: "image2_OSS",
    group_ratio: 1,
    convert_ratio: 1,
    is_selectable: true,
    is_visible: true,
  },
  {
    name: "NanoBananaEnterprise",
    display_name: "NB-Enterprise",
    group_ratio: 1.4,
    convert_ratio: 1.4,
    is_selectable: true,
    is_visible: true,
  },
  {
    name: "Gemini_Reverse",
    display_name: "Gemini_Reverse",
    group_ratio: 0.5,
    convert_ratio: 0.5,
    is_selectable: true,
    is_visible: true,
  },
  {
    name: "NB_OSS",
    display_name: "NB_OSS",
    group_ratio: 1,
    convert_ratio: 1,
    is_selectable: true,
    is_visible: true,
  },
  {
    name: "svip",
    display_name: "SVIP",
    group_ratio: 1,
    convert_ratio: 1,
    is_selectable: true,
    is_visible: true,
  },
]

// Qwen prices are declared in CNY and require the site's USD exchange rate.
export const apiyiCnyPricingSample = {
  success: true,
  message: "",
  data: [
    {
      model_name: "qwen-plus",
      vendor_id: 6,
      vendor_name: "阿里巴巴",
      vendor_icon: "Qwen.Color",
      vendor_description:
        "阿里巴巴旗下通义千问模型体系，覆盖文本、代码、视觉、语音及多模态等丰富 AI 能力。",
      quota_type: 0,
      model_ratio: 0.2,
      model_price: 0,
      owner_by: "",
      completion_ratio: 3,
      enable_groups: ["default", "svip"],
      supported_endpoint_types: ["openai"],
      billing_mode: "tiered_expr",
      billing_expr:
        'len <= 128000 ? tier("≤ 128K", p * 0.109589041096 + c * 0.27397260274) : len >= 128001 && len <= 256000 ? tier("128001–256K", p * 0.328767123288 + c * 2.7397260274) : tier("256001–1M", p * 0.657534246575 + c * 6.57534246575)',
      pricing_version: "shell-api-modelmak-v1",
    },
  ],
  group_ratio: {
    default: 1,
    svip: 1,
  },
  usable_group: {
    default: "Default",
    svip: "SVIP",
  },
  ModelConditionalPricing: {
    "qwen-plus": {
      Currency: "CNY",
      Conditions: [
        {
          MinTokens: 0,
          MaxTokens: 128000,
          InputRatio: 0.4,
          CompletionRatio: 2.5,
          FixedPrice: 0,
        },
        {
          MinTokens: 128001,
          MaxTokens: 256000,
          InputRatio: 1.2,
          CompletionRatio: 8.333333333333334,
          FixedPrice: 0,
        },
        {
          MinTokens: 256001,
          MaxTokens: 1000000,
          InputRatio: 2.4,
          CompletionRatio: 10,
          FixedPrice: 0,
        },
      ],
    },
  },
}
