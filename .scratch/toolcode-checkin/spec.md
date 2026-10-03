# ToolCode growth-center check-in (#1556)

Status: ready-for-agent

## Scope and boundary

- Source: https://github.com/qixing-jk/all-api-hub/issues/1556
- Keep the existing `sub2api` account site type and adapter family. Add one discovery-only method, `toolcode:daily-checkin`, displayed with source ToolCode. No new site type or managed-site capability is required: the saved installation URL already distinguishes accounts, and only the check-in protocol differs.
- Use structural status discovery across Sub2API installations, not a brand/domain allow-list. Keep legacy migration and automatic-execution intent unchanged.
- Reuse saved Sub2API Bearer credentials and the existing identity-bound refresh lifecycle. Do not introduce cookies, login automation, or a new credential store. Status discovery disables proactive refresh and unauthorized recovery; POST is single-dispatch, followed by existing status reconciliation if uncertain.

## Live evidence (Edge, 2026-10-04 Asia/Singapore)

The existing authenticated browser session exposed `https://toolcode.top/engagement`, title Growth Center - ToolCode, the 成长中心 heading, and the 立即签到 control.

- GET `/api/v1/engagement/checkin/status?timezone=Asia%2FSingapore`: HTTP 200, `{code:0,message:"success",data:{checkin_enabled:true,checked_in_today:false,can_checkin:true,...}}`.
- The page sends a Bearer-authenticated bodyless POST `/api/v1/engagement/checkin`; no timezone query or request body.
- Successful POST: HTTP 200, `checked_in_today:true`, `points_reward:10`, `reward_amount:0`, `expires_at:"0001-01-01T00:00:00Z"`. Points balance increased 10 to 20. The page showed 今日已签到 and a success notice.
- GET readback: enabled true, checked true, can_checkin false, points balance 20.
- One duplicate POST: HTTP 409, `{code:409,message:"今日已签到，请勿重复签到",reason:"CHECKIN_ALREADY_COMPLETED"}`. Follow-up GET confirmed points stayed 20.
- No points were exchanged. Points and expiring bonus grants are separate growth-center assets, so this method leaves the quota reward unset. Positive bonus issuance remains unverified on this account; it needs a streak milestone.
- No secrets, authentication exports, or unrelated account records are included in this evidence.

## Validation boundary

The site-page grant and duplicate response were verified live. The extension's re-detection, saved selection, refresh, and already-checked execution were verified with a temporary account. A fresh grant through the extension was not repeated on the same day; focused transport and provider tests cover dispatch and reconciliation. Positive bonus issuance remains unverified and needs a streak milestone.
