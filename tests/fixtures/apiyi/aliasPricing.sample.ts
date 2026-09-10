// APIyi applies trailing-wildcard conditions to model variants.
export const apiyiAliasPricingSample = {
  success: true,
  message: "",
  data: [
    {
      model_name: "gemini-3.1-pro-preview-customtools",
      vendor_id: 1,
      vendor_name: "Google",
      vendor_icon: "Gemini.Color",
      vendor_description:
        "全球领先的 AI 科技公司，Gemini 系列以强大的多模态理解、长上下文和推理能力著称。",
      quota_type: 0,
      model_ratio: 0.9,
      model_price: 0,
      owner_by: "",
      completion_ratio: 6,
      cache_ratio: 0.1,
      image_ratio: 1,
      enable_groups: ["default", "svip"],
      supported_endpoint_types: ["gemini", "openai"],
      billing_mode: "tiered_expr",
      billing_expr:
        'len <= 200000 ? tier("≤ 200K", p * 2 + c * 12 + cr * 0.2) : tier("> 200K", p * 4 + c * 18 + cr * 0.4)',
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
    "gemini-3.1-pro-preview*": {
      Conditions: [
        {
          MinTokens: 0,
          MaxTokens: 200000,
          InputRatio: 1,
          CompletionRatio: 6,
          FixedPrice: 0,
        },
        {
          MinTokens: 200001,
          MaxTokens: -1,
          InputRatio: 2,
          CompletionRatio: 4.5,
          FixedPrice: 0,
        },
      ],
    },
    "gemini-3.1-pro-preview-*": {
      Conditions: [
        {
          MinTokens: 0,
          MaxTokens: 200000,
          InputRatio: 1,
          CompletionRatio: 6,
          FixedPrice: 0,
        },
        {
          MinTokens: 200001,
          MaxTokens: -1,
          InputRatio: 2,
          CompletionRatio: 4.5,
          FixedPrice: 0,
        },
      ],
    },
  },
}
