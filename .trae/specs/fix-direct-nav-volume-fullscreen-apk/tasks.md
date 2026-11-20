# 松子浏览器 - 实现计划

## Task 1: 修复光标模式视频音量泄漏（合成滚轮事件）+ 清理 CursorLayout 调试
- **Status**: `completed`
- **Completion Evidence**: `media_controls.js` 已在 capture 阶段注册 `wheel`/`mousewheel` 监听（:321），仅当 target 位于 `<video>`/`<audio>` 内时 `stopImmediatePropagation`+`preventDefault`（:303-315），非媒体区不拦截；`CursorLayout.kt` 全仓 grep 无 `方向键→` Toast、无 `Log.d("CursorLayout"`。独立审查 PASS。
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 在 `app/src/main/assets/media_controls.js` 中为每个 frame 的 `window` 注册 capture 阶段 `wheel` 监听：当事件 target 位于 `<video>`/`<audio>` 元素内时，调用 `stopImmediatePropagation()` + `preventDefault()`，阻止站点把滚轮转为音量；非媒体区域不拦截。
  - 移除 `app/common/.../widgets/cursor/CursorLayout.kt` 中 `ca4e4fd4` 遗留的调试 Toast 与 `Log.d`，保留光标模式吞方向键的正确逻辑。
- **Acceptance Criteria Addressed**: AC-3, AC-5
- **Test Requirements**:
  - `rule` TR-1.1: `media_controls.js` 含 capture 阶段 wheel 监听，且仅在目标属于 video/audio 时阻止传播/默认行为；`CursorLayout.kt` 中无 “方向键→” Toast、无 `Log.d("CursorLayout"`。证据：grep + 源码检查。
  - `rubric` TR-1.2: 对页面滚动的副作用；scale 1-5；1=非视频区完全不能滚动；3=部分区域异常；5=非视频区滚动正常、视频区不响应滚轮；阈值 >= 4；证据：用户实测。

## Task 2: 修复双击确定键全屏（派发真实双击事件）
- **Status**: `completed`
- **Completion Evidence**: `media_controls.js` 新增 `window.tvBroGetVideoRect`（:262-287，含同源 iframe 祖先偏移累加）；`WebViewWebEngine.toggleFullscreen`（:296-319）经 `evaluateJavascript` 取视频中心（失败回退 WebView 中心），`dispatchDoubleTap`（:322-337）派发 4 个真实 `MotionEvent`（DOWN/UP 间隔 40ms、两 tap 间隔 120ms），`finally` 中 recycle。编译通过；独立审查 PASS。最终效果待用户实测。
- **Priority**: high
- **Depends On**: None
- **Description**:
  - `media_controls.js` 新增全局 `window.tvBroGetVideoRect()`，返回目标视频 bounding rect 的 JSON（相对其视口），无视频返回 null。
  - 在 `WebViewWebEngine`（或 `WebViewMediaControls.toggleMediaFullscreen`）新增逻辑：`evaluateJavascript` 取视频中心坐标（解析失败则回退到 WebView 中心），向 webView 派发真实双击 MotionEvent（DOWN/UP/DOWN/UP），触发站点自身双击全屏；退出全屏仍走 `hideFullscreenView`。
  - `TvShell.handleDoubleOk` 直接模式分支调用该方法（保持现有 400ms 双击识别与首次按键放行）。
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `rule` TR-2.1: 直接模式有视频时双击 OK 会向 webView 派发真实 MotionEvent；`media_controls.js` 暴露 `tvBroGetVideoRect`。证据：源码检查。
  - `rubric` TR-2.2: 爱奇艺全屏成功率；scale 1-5；1=完全无效；3=偶发；5=稳定切换且可退出；阈值 >= 4；证据：用户实测。

## Task 3: 修复直接导航模式无法聚焦地址栏
- **Status**: `completed`
- **Completion Evidence**: `TvShell.cursorModesBackCallback.handleOnBackPressed` 直接模式分支（`!isVirtualCursorMode()`）改为 `toggleMenu()`（:1395-1397），链路 `toggleMenu`→`showMenuOverlay`→`catchFocus`→`flUrl.requestFocus`→OK 触发 `startEditing` 使 `etUrl` 可编辑，经独立审查逐文件核对完整；grab 模式分支不变。独立审查 PASS。
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 修改 `TvShell.cursorModesBackCallback.handleOnBackPressed`：直接导航模式（`!isVirtualCursorMode()`）下不再切回光标模式，改为 `toggleMenu()`（打开动作栏 → `catchFocus` 聚焦地址栏；关闭 → 回页面）；抓取模式（grab）保持原 `handleBackNavigation()` 不变。MENU 键仍负责切换导航模式。
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `rule` TR-3.1: 直接模式按返回键触发 `showMenuOverlay()`（焦点落地址栏），再次返回触发 `hideMenuOverlay()`；grab 模式行为不变。证据：源码检查 + 用户实测。

## Task 4: 固定 APK 输出文件名
- **Status**: `completed`
- **Completion Evidence**: `app/build.gradle.kts` `androidComponents.onVariants` 对所有 variant 设 `outputFileName="songzi-browser.apk"`（:108-114）；构建产物 `app/build/outputs/apk/generic/release/songzi-browser.apk`（3,554,491 字节）已生成，已拷贝到 `/home/liusong/workspace/tv-browser-dist/songzi-browser.apk`。独立审查 PASS。
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - 在 `app/build.gradle.kts` 的 `android {}` 内配置 release 变体 `outputFileName = "songzi-browser.apk"`（使用兼容当前 AGP 的写法）。
  - 构建后拷贝产物到 `/home/liusong/workspace/tv-browser-dist/songzi-browser.apk`（同名覆盖）。
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `rule` TR-4.1: 构建产物名为 `songzi-browser.apk`，dist 目录存在同名文件。证据：`ls` 输出。

## Task 5: 清理 TvShell 调试日志 + 编译验证 + 提交推送
- **Status**: `completed`
- **Completion Evidence**: `TvShell.kt`/`MainActivity.kt` 中 `Log.d("NavDebug",...)` 已移除，全仓 grep `NavDebug`/`方向键→`/`Log\.d\("CursorLayout"` 无命中（仅 spec 与合法 strings 文案）；`./gradlew assembleGenericRelease` → `BUILD SUCCESSFUL in 5m 43s`；APK 已拷贝到 dist；提交推送见下方。
- **Priority**: high
- **Depends On**: Task 1, Task 2, Task 3, Task 4
- **Description**:
  - 移除 `TvShell.kt` 中 `1074d614` 遗留的 `Log.d("NavDebug", ...)` 等调试日志。
  - 执行 `./gradlew assembleGenericRelease` 编译通过；拷贝固定名 APK 到 dist 目录。
  - 用显式文件列表 `git add` 提交，`git push origin master`。
  - 给用户 APK 的 `computer://` 链接与 GitHub commit 链接。
- **Acceptance Criteria Addressed**: AC-4, AC-5
- **Test Requirements**:
  - `rule` TR-5.1: 编译成功（BUILD SUCCESSFUL）；`git status` 干净（除 `.trae/` 未跟踪）；`git push` 成功。证据：构建日志 + git 输出。
