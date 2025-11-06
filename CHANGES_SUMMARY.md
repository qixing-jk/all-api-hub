# Changes Summary

## Bug Fix: Removed Redundant Cookie Header Manipulation

### Issue
There was a TODO comment indicating a bug where cookies were still being sent when using Bearer token authentication, even though the code attempted to clear the Cookie header by setting it to an empty string.

### Root Cause
The comment said: "TODO：bug，还是带上了 cookie，导致网站没有使用 access_token进行验证" (TODO: bug, cookies are still being sent, causing the website to not use access_token for verification)

The attempted fix was setting `headers["Cookie"] = ""`, but this doesn't actually prevent the browser from sending cookies. The browser's cookie behavior is controlled by the `credentials` option in the fetch request, not by the Cookie header.

### Solution
The proper fix was already implemented in the codebase:
- `createTokenAuthRequest()` uses `credentials: "omit"` (line 89), which instructs the browser to NOT send cookies
- `createCookieAuthRequest()` uses `credentials: "include"` (line 82), which allows cookies to be sent

### Changes Made
**File: `services/apiService/common/utils.ts`**

Removed lines 35-37:
```typescript
// TODO：bug，还是带上了 cookie，导致网站没有使用 access_token进行验证
if (accessToken) {
  headers["Cookie"] = "" // 使用 Bearer token 时清空 Cookie 头
```

Kept the essential logic:
```typescript
if (accessToken) {
  headers["Authorization"] = `Bearer ${accessToken}`
}
```

### Impact
- Cleaner code without misleading TODO comment
- Removed unnecessary and ineffective Cookie header manipulation
- The actual bug fix (using `credentials: "omit"`) remains in place and functioning correctly
- No behavioral changes - the authentication flow continues to work as intended

### Technical Details
When using Bearer token authentication:
1. `createRequestHeaders()` adds the Authorization header with the Bearer token
2. `createTokenAuthRequest()` wraps this with `credentials: "omit"` 
3. The browser's fetch API respects `credentials: "omit"` and does NOT send cookies
4. The server receives only the Authorization header, not cookies

This is the correct implementation for Bearer token authentication.