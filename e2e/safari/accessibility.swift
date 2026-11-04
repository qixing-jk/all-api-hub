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
func waitUntil(_ timeout: TimeInterval, _ condition: () -> Bool) -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    repeat {
        if condition() { return true }
        RunLoop.current.run(until: Date().addingTimeInterval(0.05))
    } while Date() < deadline
    return false
}
func activateApplication(_ name: String) -> AXUIElement? {
    var application: NSRunningApplication?
    guard waitUntil(10, {
        application = NSWorkspace.shared.runningApplications.first { $0.localizedName == name }
        return application != nil
    }), let app = application else { return nil }
    _ = app.activate(options: [.activateIgnoringOtherApps])
    guard waitUntil(5, { NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier }) else { return nil }
    return AXUIElementCreateApplication(app.processIdentifier)
}
func settingsWindow(_ root: AXUIElement) -> AXUIElement? {
    ((attribute(root, "AXWindows") as? [AXUIElement]) ?? []).first { window in
        descendants(window).contains { element in
            guard (attribute(element, "AXRole") as? String) == "AXToolbar" else { return false }
            let buttons = descendants(element).filter { (attribute($0, "AXRole") as? String) == "AXButton" }
            return ["General", "Extensions", "Advanced"].allSatisfy { title in
                buttons.contains { (attribute($0, "AXTitle") as? String) == title || (attribute($0, "AXDescription") as? String) == title }
            }
        }
    }
}
func openSettings(_ root: AXUIElement, _ name: String) -> Bool {
    if let window = settingsWindow(root) {
        guard AXUIElementPerformAction(window, "AXRaise" as CFString) == .success else { return false }
    } else {
        var applicationMenu: AXUIElement?
        guard waitUntil(10, {
            guard let menuBar = attribute(root, "AXMenuBar") as! AXUIElement? else { return false }
            applicationMenu = descendants(menuBar).first {
                (attribute($0, "AXRole") as? String) == "AXMenuBarItem" && (attribute($0, "AXTitle") as? String) == name
            }
            return applicationMenu != nil
        }), let menu = applicationMenu, AXUIElementPerformAction(menu, "AXPress" as CFString) == .success else { return false }
        var settingsItem: AXUIElement?
        guard waitUntil(5, {
            settingsItem = descendants(menu).first {
                (attribute($0, "AXRole") as? String) == "AXMenuItem" && (attribute($0, "AXTitle") as? String) == "Settings…"
            }
            return settingsItem != nil
        }), let item = settingsItem, AXUIElementPerformAction(item, "AXPress" as CFString) == .success else { return false }
    }
    return waitUntil(10) {
        guard let window = settingsWindow(root), let focused = attribute(root, "AXFocusedWindow") else { return false }
        return CFEqual(window, focused)
    }
}
func usage() -> Never {
    FileHandle.standardError.write(Data("usage: accessibility <mode> [args...]\n".utf8))
    exit(2)
}
let args = CommandLine.arguments
guard args.count > 1 else { usage() }
if args[1] == "trusted" {
    print(AXIsProcessTrusted() ? "true" : "false")
    exit(0)
}
if ["activate", "open-settings"].contains(args[1]) {
    guard args.count > 2 else { usage() }
    guard AXIsProcessTrusted(), let root = activateApplication(args[2]) else {
        FileHandle.standardError.write(Data("Accessibility access or application activation unavailable\n".utf8))
        exit(1)
    }
    if args[1] == "open-settings" && !openSettings(root, args[2]) {
        FileHandle.standardError.write(Data("Safari settings window unavailable or not focused\n".utf8))
        exit(1)
    }
    exit(0)
}
var dialogs: [[String: Any]] = []
var pressed = false
for app in NSWorkspace.shared.runningApplications {
    let name = app.localizedName ?? ""
    if args.count > 2 && name != args[2] { continue }
    if args[1] == "authorization" && !["UserNotificationCenter", "SecurityAgent", "CoreServicesUIAgent"].contains(name) { continue }
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
        if args.count > 3 && args[1] == "close-window", (attribute(window, "AXTitle") as? String) == args[3],
           let button = elements.first(where: { (attribute($0, "AXSubrole") as? String) == "AXCloseButton" }) {
            pressed = AXUIElementPerformAction(button, "AXPress" as CFString) == .success
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
        if pressed { break }
    }
    if pressed { break }
}
if ["press", "enable", "extension-enabled", "close-window", "authenticate"].contains(args[1]) { exit(pressed ? 0 : 1) }
let data = try JSONSerialization.data(withJSONObject: dialogs, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
