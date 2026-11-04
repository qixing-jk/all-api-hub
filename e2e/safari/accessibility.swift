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
func snapshot(_ element: AXUIElement, _ depth: Int = 0) -> [String: Any] {
    var result: [String: Any] = ["role": (attribute(element, "AXRole") as? String) ?? "", "text": text(element)]
    if (attribute(element, "AXRole") as? String) == "AXCheckBox" { result["value"] = (attribute(element, "AXValue") as? NSNumber)?.intValue }
    if depth < 10 { result["children"] = ((attribute(element, "AXChildren") as? [AXUIElement]) ?? []).map { snapshot($0, depth + 1) } }
    return result
}
func enableCheckbox(_ target: AXUIElement) -> Bool {
    if (attribute(target, "AXValue") as? NSNumber)?.intValue == 1 { return true }
    guard AXUIElementPerformAction(target, "AXPress" as CFString) == .success else { return false }
    for _ in 0..<40 {
        if (attribute(target, "AXValue") as? NSNumber)?.intValue == 1 { return true }
        Thread.sleep(forTimeInterval: 0.05)
    }
    return false
}
func installedExtensionCheckbox(_ elements: [AXUIElement], _ name: String) -> AXUIElement? {
    // Safari's installed row labels the extension beside an unnamed checkbox.
    for label in elements where (attribute(label, "AXRole") as? String) == "AXStaticText" && ((attribute(label, "AXValue") as? String) == name || (attribute(label, "AXTitle") as? String) == name) {
        var parent = attribute(label, "AXParent") as! AXUIElement?
        for _ in 0..<6 {
            guard let container = parent, (attribute(container, "AXRole") as? String) != "AXWindow" else { break }
            let checkboxes = descendants(container).filter { (attribute($0, "AXRole") as? String) == "AXCheckBox" }
            if checkboxes.count == 1 { return checkboxes[0] }
            parent = attribute(container, "AXParent") as! AXUIElement?
        }
    }
    return nil
}
let args = CommandLine.arguments
var dialogs: [[String: Any]] = []
var pressed = false
for app in NSWorkspace.shared.runningApplications {
    let name = app.localizedName ?? ""
    if args.count > 2 && name != args[2] { continue }
    let root = AXUIElementCreateApplication(app.processIdentifier)
    for window in (attribute(root, "AXWindows") as? [AXUIElement]) ?? [] {
        let allElements = descendants(window)
        let elements = args[1] == "popover" ? allElements.filter { attribute($0, "AXRole") as? String == "AXPopover" }.flatMap { descendants($0) } : allElements
        if args[1] == "popover" && elements.isEmpty { continue }
        let buttons = elements.filter { attribute($0, "AXRole") as? String == "AXButton" }
        dialogs.append(["app": name, "text": elements.map { text($0) }.joined(separator: "\n"), "roles": Array(Set(elements.compactMap { attribute($0, "AXRole") as? String })).sorted(), "tree": snapshot(window), "buttons": buttons.map { (attribute($0, "AXTitle") as? String) ?? (attribute($0, "AXDescription") as? String) ?? "" }])
        let scopeRole = args.count > 4 ? (args[4] == "toolbar" ? "AXToolbar" : args[4] == "popover" ? "AXPopover" : "") : ""
        let targets = scopeRole.isEmpty ? elements : allElements.filter { attribute($0, "AXRole") as? String == scopeRole }.flatMap { descendants($0) }
        if args.count > 3 && args[1] == "extension-enabled", let checkbox = installedExtensionCheckbox(elements, args[3]) {
            pressed = (attribute(checkbox, "AXValue") as? NSNumber)?.intValue == 1
        }
        if args[1] == "authenticate" && name == "Safari" && elements.map({ text($0) }).joined(separator: "\n").contains("Safari is trying to allow unsigned extensions."),
           let field = elements.first(where: { (attribute($0, "AXSubrole") as? String) == "AXSecureTextField" }),
           let button = buttons.first(where: { (attribute($0, "AXTitle") as? String) == "OK" || (attribute($0, "AXDescription") as? String) == "OK" }),
           let password = readLine() {
            pressed = AXUIElementSetAttributeValue(field, "AXValue" as CFString, password as CFString) == .success
            pressed = pressed && AXUIElementPerformAction(button, "AXPress" as CFString) == .success
        }
        if args.count > 3 && ["press", "enable"].contains(args[1]), let target = targets.first(where: {
            let role = attribute($0, "AXRole") as? String ?? ""
            let actionable = args[1] == "enable" ? role == "AXCheckBox" : ["AXButton", "AXCheckBox", "AXRadioButton", "AXMenuItem", "AXPopUpButton"].contains(role)
            return actionable && ((attribute($0, "AXTitle") as? String) == args[3] || (attribute($0, "AXDescription") as? String) == args[3])
        }) {
            pressed = args[1] == "enable" ? enableCheckbox(target) : AXUIElementPerformAction(target, "AXPress" as CFString) == .success
        }
    }
}
if ["press", "enable", "extension-enabled", "authenticate"].contains(args[1]) { exit(pressed ? 0 : 1) }
let data = try JSONSerialization.data(withJSONObject: dialogs, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
