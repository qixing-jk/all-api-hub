import { ACCOUNT_KEY_IDENTITY_ERRORS } from "~/services/apiAdapters/newApi/keys/accountKeyIdentity"
import { withLaozhangKeySettings } from "~/services/apiAdapters/newApi/keys/laozhangKeyResourceEditor"
import { readLaozhangPreservedTokenFields } from "~/services/apiAdapters/newApi/keys/laozhangPreservedTokenFields"
import * as laozhang from "~/services/apiService/shellApiFamily/laozhang"
import { fetchLaoZhangSiteNotice } from "~/services/apiService/shellApiFamily/laozhangSiteNotice"
import { SHELL_LOG_QUERY_CONFIG } from "~/services/apiService/shellApiFamily/usageLogs"

import type { CompatibleAccountVariant } from "../../compatibleAccountVariantContract"
import { createLogQueryVariant } from "../../newApi/variantOperations/data"
import { shellApiInviteLink } from "../inviteLink"
import { laoZhangAccountAnnouncements } from "./laozhangAnnouncements"

export const laozhangVariant: CompatibleAccountVariant = {
  key: {
    transport: {
      // https://api2.laozhang.ai/token v31.1.5: p=0/pageSize, bare arrays;
      // groupPro and available_model match the APIyi transport contract.
      fetchAccountTokens: laozhang.fetchAccountTokens,
      fetchTokenById: laozhang.fetchTokenById,
      createApiToken: laozhang.createApiToken,
      updateApiToken: laozhang.updateApiToken,
    },
    readPreservedFields: readLaozhangPreservedTokenFields,
    extendEditor: withLaozhangKeySettings,
    async readEditableToken(request, listed) {
      const detail = await laozhang.fetchTokenById(request, listed.id)
      if (detail.id !== listed.id || detail.user_id !== listed.user_id)
        throw new Error(ACCOUNT_KEY_IDENTITY_ERRORS.TokenIdentityMismatch)
      return detail
    },
  },
  data: createLogQueryVariant(SHELL_LOG_QUERY_CONFIG),
  bootstrap: {
    extractCheckInSupport: (status) =>
      status &&
      "CheckinEnabled" in status &&
      typeof status.CheckinEnabled === "boolean"
        ? status.CheckinEnabled
        : undefined,
  },
  inviteLink: shellApiInviteLink,
  notice: { fetch: fetchLaoZhangSiteNotice },
  announcements: laoZhangAccountAnnouncements,
}
