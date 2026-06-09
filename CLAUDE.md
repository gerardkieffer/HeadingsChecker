# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

This is a pure **Xcode project** — no npm, no Makefile, no external build tools.

- Open `HeadingsMap.xcodeproj` in Xcode (the Xcode project folder is named `HeadingsMap/` but the app is now called **HeadingsChecker**)
- Scheme: `HeadingsMap`, target: macOS
- Build: `Cmd+B` / `xcodebuild -scheme HeadingsMap -destination 'platform=macOS'`
- Run: `Cmd+R` (launches the macOS wrapper app; load/enable the extension in Safari to test)
- No test targets exist

## Architecture

This is a **Safari Web Extension** (Manifest V3) packaged as a macOS app for App Store distribution. Two distinct layers:

### Native layer (Swift, in `HeadingsMap/`)
- `AppDelegate.swift` — standard app delegate, terminates on last window close
- `ViewController.swift` — loads `Resources/Main.html` in a WKWebView; queries `SFSafariExtensionManager` to show enabled/disabled state; handles `open-preferences` WebKit message
- `Resources/Script.js` — companion JS for Main.html; detects macOS version to show "Settings" vs. "Preferences" link

### Extension layer (JS, in `HeadingsMap Extension/Resources/`)
- `manifest.json` — MV3; permissions: `activeTab`, `storage`, `webNavigation`; host: `<all_urls>`; content script injected at `document_end`
- `service-worker.js` — background script; routes messages between popup/panel and content script; manages pinned-tab auto-open feature; handles URL blocklist (analytics, OAuth, embeds); dispatches tab lifecycle events
- `content_scripts/headingsmap.js` — **minified 92KB bundle**; the entire extension UI and DOM analysis logic; injects a panel into the page; uses MutationObserver for live DOM tracking; handles heading tree rendering, landmark detection, element highlighting, search/filter, keyboard shortcuts, and clipboard export

### Communication flow
```
User click → service-worker (chrome.action.onClicked)
           → chrome.tabs.sendMessage() → content script
           → DOM analysis → message back to service-worker → panel UI update
```
Multi-frame support via `webNavigation.getAllFrames()` (covers iframes).

## Key facts

- **Version**: 4.10.6 (in `manifest.json` and `project.pbxproj`)
- **Locales**: `en`, `es`, `fr`, `pl`, `ja` — strings in `Resources/_locales/[lang]/messages.json`; HTML pages in `Resources/html/[page]/[lang].html`
- **Themes**: bright (default) and dark — CSS in `Resources/css/themes/`, icons in `Resources/css/icons/`
- The content script is a minified build. When editing logic, edit the minified file directly or maintain a separate source and re-minify before committing
- `_metadata/` contains verified content hashes — update if resource files change and Safari complains about integrity

## Extension pages

Five localized HTML pages (each in 5 languages under `html/`):
`configuration`, `contribute`, `privacyPolicy`, `releaseNotes`, `help`

These are loaded as web-accessible resources from the content script or opened by the service worker.
