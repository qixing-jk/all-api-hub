import AppKit
import ApplicationServices
import Foundation

func attribute(_ element: AXUIElement, _ name: String) -> AnyObject? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}
func text(_ element: AXUIElement) -> String {
    let attributes = (attribute(element, "AXSubrole") as? String) == "AXSecureTextField" ? ["AXTitle", "AXDescription"] : ["AXTitle", "AXDescription", "AXValue"]
    return attributes.compactMap { attribute(element, $0) as? String }.joined(separator: " ")
}
func descendants(_ element: AXUIElement, _ depth: Int = 0) -> [AXUIElement] {
    if depth > 10 { return [] }
    return [element] + ((attribute(element, "AXChildren") as? [AXUIElement]) ?? []).flatMap { descendants($0, depth + 1) }
}
let args = CommandLine.arguments
var dialogs: [[String: Any]] = []
var pressed = false
for app in NSWorkspace.shared.runningApplications {
    let name = app.localizedName ?? ""
    if args.count > 2 && name != args[2] { continue }
    let root = AXUIElementCreateApplication(app.processIdentifier)
    for window in (attribute(root, "AXWindows") as? [AXUIElement]) ?? [] {
        let elements = descendants(window)
        let buttons = elements.filter { attribute($0, "AXRole") as? String == "AXButton" }
        dialogs.append(["app": name, "text": elements.map { text($0) }.joined(separator: "\n"), "buttons": buttons.map { (attribute($0, "AXTitle") as? String) ?? (attribute($0, "AXDescription") as? String) ?? "" }])
        if args[1] == "authenticate" && name == "Safari" && elements.map({ text($0) }).joined(separator: "\n").contains("Safari is trying to allow unsigned extensions."),
           let field = elements.first(where: { (attribute($0, "AXSubrole") as? String) == "AXSecureTextField" }),
           let button = buttons.first(where: { (attribute($0, "AXTitle") as? String) == "OK" || (attribute($0, "AXDescription") as? String) == "OK" }),
           let password = readLine() {
            pressed = AXUIElementSetAttributeValue(field, "AXValue" as CFString, password as CFString) == .success
            pressed = pressed && AXUIElementPerformAction(button, "AXPress" as CFString) == .success
        }
        if args.count > 3 && ["press", "enable"].contains(args[1]), let target = elements.first(where: {
            let role = attribute($0, "AXRole") as? String ?? ""
            let actionable = args[1] == "enable" ? role == "AXCheckBox" : ["AXButton", "AXCheckBox", "AXRadioButton", "AXMenuItem", "AXPopUpButton"].contains(role)
            return actionable && ((attribute($0, "AXTitle") as? String) == args[3] || (attribute($0, "AXDescription") as? String) == args[3])
        }) {
            if args[1] == "enable" && (attribute(target, "AXValue") as? NSNumber)?.intValue == 1 {
                pressed = true
            } else {
                pressed = AXUIElementPerformAction(target, "AXPress" as CFString) == .success
                if args[1] == "enable" {
                    for _ in 0..<20 {
                        if (attribute(target, "AXValue") as? NSNumber)?.intValue == 1 { break }
                        Thread.sleep(forTimeInterval: 0.05)
                    }
                    pressed = pressed && (attribute(target, "AXValue") as? NSNumber)?.intValue == 1
                }
            }
        }
    }
}
if ["press", "enable", "authenticate"].contains(args[1]) { exit(pressed ? 0 : 1) }
let data = try JSONSerialization.data(withJSONObject: dialogs, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
