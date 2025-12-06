import type {
  ModelPricing,
  PricingResponse,
} from "~/services/apiService/common/type"
import type {
  OneHubModelPricing,
  OneHubUserGroupMap,
  OneHubUserGroupsResponse,
} from "~/services/apiService/oneHub/type"

/**
 * 将 OneHub 模型定价转换为通用定价
 * @param modelPricing 原始模型定价
 * @param userGroupMap 用户分组配置信息
 * @returns {PricingResponse} 转换后的结构
 */
export function transformModelPricing(
  modelPricing: OneHubModelPricing,
  userGroupMap: OneHubUserGroupMap = {},
): PricingResponse {
  const data: ModelPricing[] = Object.entries(modelPricing).map(
    ([modelName, model]) => {
      const enableGroups = model.groups.length > 0 ? model.groups : ["default"]

      return {
        model_name: modelName,
        quota_type: model.price.type === "tokens" ? 0 : 1,
        model_ratio: 1,
        model_price: {
          input: model.price.input,
          output: model.price.output,
        },
        owner_by: model.owned_by || "",
        completion_ratio: model.price.output / model.price.input || 1,
        enable_groups: enableGroups,
        supported_endpoint_types: [],
      }
    },
  )

  const group_ratio: Record<string, number> = {}
  for (const [key, group] of Object.entries(userGroupMap)) {
    group_ratio[key] = group.ratio || 1
  }

  const usable_group: Record<string, string> = {}
  for (const [key, group] of Object.entries(userGroupMap)) {
    usable_group[key] = group.name
  }

  return {
    data,
    group_ratio,
    success: true,
    usable_group,
  }
}

/**
 * 将 OneHub 用户分组转换为通用分组
 * @param input OneHub 分组接口返回值
 * @returns {OneHubUserGroupsResponse["data"]} 通用结构
 */
export function transformUserGroup(
  input: OneHubUserGroupsResponse["data"],
): OneHubUserGroupsResponse["data"] {
  const result: Record<string, any> = {}

  // 转换已有的分组
  for (const key in input) {
    const group = input[key]
    result[key] = {
      desc: group.name,
      ratio: group.ratio,
    }
  }
  return result
}
