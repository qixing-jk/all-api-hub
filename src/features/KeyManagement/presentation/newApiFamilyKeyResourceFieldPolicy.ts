import { type ResourceFieldPresentation } from "~/features/ResourceEditor/model/resourceFieldPolicy"
import {
  RESOURCE_FIELD_TYPES,
  type ResourceFieldDescriptor,
} from "~/services/apiAdapters/contracts/resourceNative"

import type { AccountKeyResourceFieldConfiguration } from "./accountKeyResourceEditorPresentation"
import { laozhangDeploymentFields } from "./laozhangKeyResourceFieldPolicy"
import {
  expiry,
  group,
  groupNamePolicy,
  ips,
  issues,
  models,
  name,
  quota,
  quotaField,
} from "./nativeKeyResourceFieldPrimitives"
import { rixApiDeploymentFields } from "./rixApiKeyResourceFieldPolicy"

export const buildNewApiFamilyFields = (
  descriptors: readonly ResourceFieldDescriptor[],
): AccountKeyResourceFieldConfiguration => {
  const descriptorsById = new Map(
    descriptors.map((descriptor) => [descriptor.fieldId, descriptor]),
  )

  const candidateFields: ResourceFieldPresentation[] = [
    name,
    group("group", false, true),
    ...(descriptorsById.has("quotaUsd")
      ? quota("quotaUsd", "unlimited_quota")
      : quotaField(
          "quota",
          "unlimited_quota",
          (t) => t("keyManagement:financial.nativeQuota"),
          undefined,
          (t) => t("keyManagement:financial.nativeQuota"),
        )),
    expiry,
    {
      fieldId: "model_limits_enabled",
      section: "advanced",
      order: 0,
      renderer: RESOURCE_FIELD_TYPES.Boolean,
      resolveLabel: (t) => t("keyManagement:dialog.modelLimits"),
      issueLabelResolvers: issues,
    },
    {
      ...models("model_limits"),
      visibleWhen: (values) => values.model_limits_enabled === true,
    },
    ips("allow_ips"),
    ...rixApiDeploymentFields(issues),
    ...laozhangDeploymentFields(issues),
  ]

  const fields = candidateFields
    .filter((field) => descriptorsById.has(field.fieldId))
    .map((field) =>
      field.renderer === RESOURCE_FIELD_TYPES.Select
        ? {
            ...field,
            resolveNullableOptionLabel: descriptorsById.get(field.fieldId)
              ?.nullable
              ? field.resolveNullableOptionLabel
              : undefined,
          }
        : field,
    )

  return {
    automaticName: groupNamePolicy("group"),
    fields,
  }
}
