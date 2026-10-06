import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import * as accountBootstrap from "~/services/apiService/newApiFamily/default/accountBootstrap"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import * as apiyi from "~/services/apiService/newApiFamily/variants/apiyi"
import * as laozhang from "~/services/apiService/newApiFamily/variants/laozhang"
import { LAOZHANG_TODAY_LOG_QUERY_CONFIG } from "~/services/apiService/newApiFamily/variants/laozhang"
import { fetchLaoZhangSiteNotice } from "~/services/apiService/newApiFamily/variants/laozhangSiteNotice"
import {
  INVITE_LINK_FAILURE_REASONS,
  InviteLinkError,
} from "~/services/inviteLinks/errors"

import { laoZhangAccountAnnouncements } from "../accountAnnouncements"
import { withLaozhangKeySettings } from "../laozhangKeyResourceEditor"
import { readLaozhangPreservedTokenFields } from "../laozhangPreservedTokenFields"
import { createLogQueryVariant } from "../variantOperations/data"
import { apiyiPricing } from "../variantOperations/pricing"
import type { NewApiVariantRegistration } from "../variantRegistration"

export const laozhangVariant: NewApiVariantRegistration = {
  key: {
    transport: {
      // https://api2.laozhang.ai/token v31.1.5: p=0/pageSize, bare arrays;
      // groupPro and available_model match the APIyi transport contract.
      fetchAccountTokens: laozhang.fetchAccountTokens,
      fetchTokenById: laozhang.fetchTokenById,
      fetchAccountAvailableModels: apiyi.fetchAccountAvailableModels,
      fetchUserGroups: apiyi.fetchUserGroups,
      createApiToken: laozhang.createApiToken,
      updateApiToken: laozhang.updateApiToken,
    },
    readPreservedFields: readLaozhangPreservedTokenFields,
    extendEditor: withLaozhangKeySettings,
    async readEditableToken(request, listed) {
      const detail = await laozhang.fetchTokenById(request, listed.id)
      if (detail.id !== listed.id || detail.user_id !== listed.user_id)
        throw new Error("token_identity_mismatch")
      return detail
    },
  },
  credentials: {
    // System token issuance needs the site's security proof and reveals the secret once.
    // Cookie onboarding must never rotate or issue a token: /account/profile owns that.
    // LaoZhang v31.1.5: https://api2.laozhang.ai/account/profile
    getOrCreateAccessToken: (request) =>
      accountBootstrap.fetchUserInfo(request),
    missingTokenReason:
      AUTO_DETECT_FAILURE_REASONS.AccessTokenVerificationRequired,
  },
  data: createLogQueryVariant(LAOZHANG_TODAY_LOG_QUERY_CONFIG),
  pricing: apiyiPricing,
  bootstrap: {
    extractCheckInSupport: (status) =>
      status &&
      "CheckinEnabled" in status &&
      typeof status.CheckinEnabled === "boolean"
        ? status.CheckinEnabled
        : undefined,
  },
  inviteLink: {
    async fetchInviteLink({ request }) {
      // https://api2.laozhang.ai/ v31.1.5 constructs /register/?aff_code=.
      const code = await newApiFamilyRequests.data<string>(request, {
        endpoint: "/api/user/aff/",
      })
      if (typeof code !== "string" || !code.trim())
        throw new InviteLinkError(INVITE_LINK_FAILURE_REASONS.InviteDataMissing)
      const url = new URL("/register/", request.baseUrl)
      url.searchParams.set("aff_code", code.trim())
      return url.toString()
    },
  },
  notice: { fetch: fetchLaoZhangSiteNotice },
  announcements: laoZhangAccountAnnouncements,
}
