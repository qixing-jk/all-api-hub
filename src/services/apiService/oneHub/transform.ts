import type { UserGroupInfo } from "~/services/accountTokens/tokenProvisioningModel"
import type {
  OneHubModelPricing,
  OneHubUserGroupMap,
  OneHubUserGroupsResponse,
} from "~/services/apiService/oneHub/type"
import {
  type ModelPricing,
  type PricingResponse,
} from "~/services/modelList/pricingModel"
import {
  MODEL_VENDOR_EVIDENCE_KINDS,
  normalizeModelDescriptors,
} from "~/services/models/modelDescriptor"

/**
 * 将 OneHub 模型定价转换为通用定价
 * @param modelPricing 原始模型定价
 * @param userGroupMap 用户分组配置信息
 * @returns 转换后的结构
 */
export function transformModelPricing(
  modelPricing: OneHubModelPricing,
  userGroupMap: OneHubUserGroupMap = {},
): PricingResponse {
  const data: ModelPricing[] = Object.entries(modelPricing).map(
    ([modelName, model]) => {
      const enableGroups = model.groups.length > 0 ? model.groups : ["default"]
      // OneHub derives `owned_by` from an editable channel-type mapping, so it
      // is routing-provider evidence rather than immutable publisher metadata.
      // https://github.com/MartialBE/one-hub/blob/387f8bf16ed0d601fdede7ade378adb10aa1a35a/relay/model.go
      // https://github.com/MartialBE/one-hub/blob/387f8bf16ed0d601fdede7ade378adb10aa1a35a/model/model_ownedby.go
      const vendorEvidence = normalizeModelDescriptors([
        {
          id: modelName,
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider,
            name: model.owned_by,
          },
        },
      ])[0]?.vendorEvidence

      return {
        model_name: modelName,
        ...(vendorEvidence === undefined ? {} : { vendorEvidence }),
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
 * @returns 通用结构
 */
export function transformUserGroup(
  input: OneHubUserGroupsResponse["data"],
): Record<string, UserGroupInfo> {
  const result: Record<string, UserGroupInfo> = {}

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
