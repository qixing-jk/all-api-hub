import Foundation
import SafariServices

// Isolated account transport. No browser/shared cookie jars, credential stores or logging.
// HTTPS uses system TLS trust; plain HTTP is limited to loopback fixtures.
private final class CookieOperation: NSObject, URLSessionDataDelegate {
    let context: NSExtensionContext
    let id: String
    let key: String
    var session: URLSession!
    var task: URLSessionDataTask!
    var data = Data()
    var response: HTTPURLResponse?
    var failure: String?

    init(context: NSExtensionContext, id: String, key: String) {
        self.context = context; self.id = id; self.key = key
    }

    func start(_ request: URLRequest, deadline: TimeInterval) {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.urlCredentialStorage = nil
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 10
        config.timeoutIntervalForResource = min(15, max(0.001, deadline - Date().timeIntervalSince1970))
        session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        task = session.dataTask(with: request)
        task.resume()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        failure = "redirect-rejected"
        completionHandler(nil)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        // Never supply cached HTTP/proxy credentials. Default TLS validation only.
        completionHandler(challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust ? .performDefaultHandling : .cancelAuthenticationChallenge, nil)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let http = response as? HTTPURLResponse, response.expectedContentLength <= 524288 else {
            failure = "response-too-large"; completionHandler(.cancel); return
        }
        self.response = http
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        if self.data.count + data.count > 524288 {
            failure = "response-too-large"; dataTask.cancel(); return
        }
        self.data.append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        defer { session.invalidateAndCancel() }
        SafariWebExtensionHandler.lock.lock()
        SafariWebExtensionHandler.operations.removeValue(forKey: key)
        SafariWebExtensionHandler.lock.unlock()
        if let failure = failure { finish(["ok": false, "code": failure]); return }
        if let error = error as NSError? {
            finish(["ok": false, "code": error.code == NSURLErrorCancelled ? "cancelled" : (error.code == NSURLErrorTimedOut ? "timeout" : "network-error")]); return
        }
        guard let http = response, let body = String(data: data, encoding: .utf8) else {
            finish(["ok": false, "code": "invalid-response"]); return
        }
        if (300..<400).contains(http.statusCode) { finish(["ok": false, "code": "redirect-rejected"]); return }
        // URLSession decodes transfer/content encodings. Do not replay those
        // lengths/encodings, or expose cookie-setting headers to the JS caller.
        var headers: [String: String] = [:]
        for (name, value) in http.allHeaderFields {
            let name = String(describing: name).lowercased()
            if ["content-type", "retry-after"].contains(name) { headers[name] = String(describing: value) }
        }
        finish(["ok": true, "status": http.statusCode, "headers": headers, "body": body])
    }

    func finish(_ result: [String: Any]) {
        var result = result; result["version"] = 3; result["id"] = id
        let item = NSExtensionItem(); item.userInfo = [SFExtensionMessageKey: result]
        context.completeRequest(returningItems: [item], completionHandler: nil)
    }
}

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    fileprivate static let lock = NSLock()
    fileprivate static var operations: [String: CookieOperation] = [:]
    private static var cancelled: [String: Date] = [:]

    func beginRequest(with context: NSExtensionContext) {
        guard let item = context.inputItems.first as? NSExtensionItem,
              let input = item.userInfo?[SFExtensionMessageKey] as? [String: Any],
              input["version"] as? Int == 3,
              let id = input["id"] as? String, UUID(uuidString: id) != nil else {
            reply(context, id: "", code: "invalid-message"); return
        }
        var profile = "default"
        if #available(macOS 14.0, iOS 17.0, *) {
            profile = String(describing: item.userInfo?[SFExtensionProfileKey] ?? "default")
        }
        let key = profile + ":" + id
        if input["command"] as? String == "capabilities" {
            let reply = NSExtensionItem()
            reply.userInfo = [SFExtensionMessageKey: ["version": 3, "id": id, "ok": true,
                "transport": "isolated-cookie-urlsession", "cancel": true, "deadline": true, "urlPolicy": "https-or-loopback-http"]]
            context.completeRequest(returningItems: [reply], completionHandler: nil)
            return
        }
        if input["command"] as? String == "cancel" {
            Self.lock.lock()
            Self.cancelled = Self.cancelled.filter { $0.value.timeIntervalSinceNow > -30 }
            // Tombstone covers a cancel racing the request message's admission.
            if Self.cancelled.count < 256 { Self.cancelled[key] = Date() }
            let operation = Self.operations[key]
            operation?.task.cancel()
            Self.lock.unlock()
            reply(context, id: id, code: operation == nil ? "cancel-pending" : "cancelled"); return
        }
        guard input["command"] as? String == "request",
              let deadlineMS = input["deadline"] as? Double, deadlineMS.isFinite,
              deadlineMS > Date().timeIntervalSince1970 * 1000,
              deadlineMS <= Date().timeIntervalSince1970 * 1000 + 20000,
              let rawURL = input["url"] as? String, rawURL.utf8.count <= 8192,
              let url = URL(string: rawURL), (url.scheme == "https" || (url.scheme == "http" && url.host == "127.0.0.1")), url.user == nil, url.password == nil,
              let origin = input["origin"] as? String,
              origin == url.scheme! + "://" + url.host! + (url.port.flatMap { ($0 == 443 && url.scheme == "https") || ($0 == 80 && url.scheme == "http") ? nil : ":\($0)" } ?? ""),
              let method = input["method"] as? String, ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].contains(method),
              let headers = input["headers"] as? [String: String], headers.count <= 64,
              let cookie = headers["cookie"], !cookie.trimmingCharacters(in: .whitespaces).isEmpty,
              headers["origin"] == origin else {
            reply(context, id: id, code: "scope-rejected"); return
        }
        var request = URLRequest(url: url)
        request.httpMethod = method; request.httpShouldHandleCookies = false
        var headerBytes = 0
        for (name, value) in headers {
            headerBytes += name.utf8.count + value.utf8.count
            guard name.range(of: "^[!#$%&'*+.^_`|~0-9a-z-]+$", options: .regularExpression) != nil,
                  value.rangeOfCharacter(from: .newlines) == nil,
                  !["host", "connection", "content-length", "transfer-encoding", "proxy-authorization", "set-cookie"].contains(name),
                  !name.hasPrefix("sec-"), !name.hasPrefix("all-api-hub"), headerBytes <= 65536 else {
                reply(context, id: id, code: "headers-rejected"); return
            }
            request.setValue(value, forHTTPHeaderField: name)
        }
        if let body = input["body"] as? String {
            guard body.utf8.count <= 524288, !["GET", "HEAD"].contains(method) else { reply(context, id: id, code: "body-rejected"); return }
            request.httpBody = body.data(using: .utf8)
        } else if !(input["body"] is NSNull) { reply(context, id: id, code: "body-rejected"); return }
        Self.lock.lock()
        Self.cancelled = Self.cancelled.filter { $0.value.timeIntervalSinceNow > -30 }
        // If tombstones are full, reject admission rather than lose a cancel
        // that raced the request message. Expiry restores bounded capacity.
        guard Self.cancelled.count < 256, Self.operations.count < 32, Self.operations[key] == nil, Self.cancelled[key] == nil else {
            Self.lock.unlock(); reply(context, id: id, code: "admission-rejected"); return
        }
        let operation = CookieOperation(context: context, id: id, key: key)
        Self.operations[key] = operation
        // Establish task while holding the admission lock, before cancel can find it.
        operation.start(request, deadline: deadlineMS / 1000)
        Self.lock.unlock()
    }

    private func reply(_ context: NSExtensionContext, id: String, code: String) {
        let item = NSExtensionItem()
        item.userInfo = [SFExtensionMessageKey: ["version": 3, "id": id, "ok": false, "code": code]]
        context.completeRequest(returningItems: [item], completionHandler: nil)
    }
}
