import AppKit
import ApplicationServices
import Foundation

func attribute(_ element: AXUIElement, _ name: String) -> AnyObject? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}
func text(_ element: AXUIElement) -> String {
    return ["AXTitle", "AXDescription", "AXValue"].compactMap { attribute(element, $0) as? String }.joined(separator: " ")
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
        if args.count > 3 && args[1] == "press", let button = buttons.first(where: { (attribute($0, "AXTitle") as? String) == args[3] || (attribute($0, "AXDescription") as? String) == args[3] }) {
            pressed = AXUIElementPerformAction(button, "AXPress" as CFString) == .success
        }
    }
}
if args[1] == "press" { exit(pressed ? 0 : 1) }
let data = try JSONSerialization.data(withJSONObject: dialogs, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
