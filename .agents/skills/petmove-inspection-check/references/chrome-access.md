# User's Chrome on Windows

Use an existing authenticated Chrome session for inspection-provider checks. Browser inventory and Windows app inventory are separate: `cua_repl` may list only the in-app browser and MCP Apps, or return `Browser is not available: chrome`, while the desktop Chrome remains accessible.

Prefer the Chrome extension connection and the returned `profileName: 펫무브`. A Chrome profile choice is not a provider login and does not require a password. Do not launch a new generic Chrome/profile-picker window when the required authenticated profile is already connected. If the extension is not connected, explain the missing connection and ask for `@Chrome` rather than repeatedly trying the same failing Windows capture.

After binding Chrome, name the session before claiming/opening tabs. `tabs.list()` only lists agent-owned tabs: an empty result does not mean the user's tabs are absent. Inspect `user.openTabs()`, choose the observed task-relevant tab and use `user.claimTab(...)`; use `tabs.get(...)` only for tabs the session already owns. Preserve an existing filled draft instead of navigating or reloading it.

Changing extension file access can restart its connection. If the selected browser is explicitly unavailable, read the browser troubleshooting documentation and refresh inventory. Rebind the actual returned browser and reclaim the draft. Do not hardcode IDs or reselect a browser merely for an empty tab list.

When the user mentions `@Chrome`, select that browser with `cua.getBrowser({id:'chrome'})` and follow its returned documentation. This route was verified on 2026-10-02 after the user explicitly mentioned Chrome: the extension browser became available, and both KRSL and eminwon logins succeeded by clicking the login button with saved credentials. Reuse the selected browser binding; do not hardcode its numeric ID. If no agent tabs exist, create tabs in that browser or inspect its user-owned tabs. Prefer this working browser route over Windows automation.

Windows Computer Use may stop with `could not determine the current browser URL ... to enforce policy` even when it can list a Chrome window. Window discovery alone does not prove page access. Obey that stop and explain the blocker; do not repeatedly retry the same blocked window capture or describe Chrome itself as unavailable. A user-provided `@Chrome` connection is the verified browser route for this situation.

When browser access does not expose Chrome:

1. Read the available `computer-use:computer-use` skill and its `docs/guidance.md`, `docs/api.md`, and `docs/confirmations.md`. Follow their current interaction and recovery rules.
2. Discover `mcp__node_repl__js` from the available tool metadata if deferred. In its persistent JavaScript session initialize the bundled runtime:

   ```js
   if (!globalThis.sky) {
     const { sky } = await import('@oai/sky');
     globalThis.sky = sky;
   }
   ```

3. Call `sky.list_apps()` and select the Google Chrome app and task-relevant window from the returned objects. Never hardcode window IDs. If Chrome has no open window, launch the returned app ID and refresh the inventory.
4. Use `sky.get_window_state` to inspect the selected Chrome window, then use the documented `sky` UI methods to navigate and read provider pages. Preserve the existing profile and saved login session. Keep forms unchanged for verification; for an explicitly authorized application, follow `application.md`.
5. Do not report Chrome as unavailable merely because browser inventory omitted it. Report a blocker only after the available Windows route and its documented recovery have failed, or a human-only login step blocks progress. State the actual error or human action needed.

This route was verified on 2026-10-02: `@oai/sky` imported successfully and `sky.list_apps()` returned a running Google Chrome window titled `펫무브워크 - Chrome`, despite Chrome being unavailable through `cua_repl` browser access. This verifies window discovery; provider login and application checks still require reading their pages.
