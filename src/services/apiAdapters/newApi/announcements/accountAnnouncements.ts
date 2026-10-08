import type { SiteAnnouncementsCapability } from "~/services/apiAdapters/contracts/siteAnnouncements"
import {
  fetchLaoZhangMessages,
  markLaoZhangMessageRead,
} from "~/services/apiService/newApiFamily/variants/laozhangMessages"

export const laoZhangAccountAnnouncements: SiteAnnouncementsCapability = {
  fetch: fetchLaoZhangMessages,
  markRead: markLaoZhangMessageRead,
}
