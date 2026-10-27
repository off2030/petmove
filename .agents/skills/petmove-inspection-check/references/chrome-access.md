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

## 주소 검색 팝업 입력이 멈출 때

2026-10-27 KRSL 우편번호 보완에서 검증한 복구 경로다. 본문은 정상인데 `Kakao Postcode Service`의 `about:blank` 팝업만 DOM 조회가 되고 클릭·키 입력·화면 캡처가 시간 초과되면, 같은 입력을 반복하거나 전체 Chrome 연결 실패로 보고하지 않는다. 읽기 전용 우편번호 속성을 변경하거나 주소 검색 결과를 임의 주입하지 않는다.

1. 현재 팝업과 원래 수정 화면의 실제 탭 ID·창 ID를 확인한다. 기존 수정 화면과 작성값을 보존한다.
2. 현재 브라우저 관리 기능 문서를 읽고, **사용자가 허용한 창·탭 이동 범위** 안에서만 진행한다. 기존 지시·승인이 해당 복구 이동을 포함하면 같은 승인을 반복 요청하지 않는다. 관리 기능이 명시적 이동 요청을 요구하고 기존 승인이 없을 때만 구체적인 이동을 확인한다.
3. 검증된 방법은 기존 주소 검색 탭을 `management.windows.create({tabId: 실제_팝업_ID})`로 **새 일반 창으로 이동**하고 그 창을 전면으로 가져오는 것이다. 기존 탭을 이동하므로 주소 검색의 원래 입력 화면 연결을 유지한다. 당시 `tabs.update({active:true})`는 지원되지 않았고, 원래 창 전면 전환·단축키·연결 핸들 초기화만으로는 해결되지 않았다. 미지원 API를 반복하거나 Windows URL 정책 중단을 우회하지 않는다.
4. 이동 후 정상 주소 검색에서 우편번호와 도로명을 대조해 선택한다. 팝업이 닫힌 직후에는 원래 화면 값 반영이 조금 늦을 수 있으므로, 우편번호가 실제 채워졌는지 재조회한 뒤 저장한다. 첫 조회가 공란이라는 이유로 주소 선택을 반복하지 않는다.
5. 수정 저장 후 해당 접수번호의 수정 화면을 다시 열어 우편번호를 확인한다. 기존 한글·영문 주소, 동/호, 소유주·동물·백신 정보 등 다른 값이 달라지지 않았는지 대조한다. 이 경로는 네 건에서 실제 저장·재조회로 확인했다.

일반 창으로 이동한 팝업은 주소 선택 후 자동으로 닫혔다. 사용자가 원하면 창·탭 배치는 원래 위치로 되돌릴 수 있음을 알린다. 이 복구 절차는 신청·결제·추가 데이터 변경 권한을 확대하지 않는다.
