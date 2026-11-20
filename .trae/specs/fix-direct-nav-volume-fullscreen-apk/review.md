# 松子浏览器 - 独立审查记录

## 审查概要
- **审查类型**: Spec Mode 独立代码审查（只读，全新上下文 agent）
- **审查时间**: 构建进行中并行执行（不修改文件、不运行构建）
- **总体结论**: **PASS**（静态审查通过；AC-2/AC-3 最终效果需用户实测，存在少量非阻塞风险）
- **审查范围**: 见 `spec.md` / `tasks.md`，以及 7 个变更文件的源码。
- **验证方式**: 源码阅读 + 全仓 grep（`NavDebug` / `方向键→` / `Log\.d\("CursorLayout"` / `toggleMenu` / `showMenuOverlay` / `catchFocus`）；核对 AGP 版本与 `onVariants` API 兼容性。无运行时验证（无 adb/logcat）。

## 逐项验收结论
| AC | 结论 | 证据 |
|----|------|------|
| AC-1 直接模式聚焦地址栏 | ✅ 达成 | `TvShell.kt:1395-1397` 直接模式分支改 `toggleMenu()` → `showMenuOverlay` 动画 `withEndAction` 调 `vActionBar.catchFocus()`（:1462）→ `flUrl.requestFocus()`（`ActionBar.kt:368`）→ 按 OK 触发 `startEditing` 使 `etUrl` 可编辑（`ActionBar.kt:223/320-332`）；再次 Back → `hideMenuOverlay`。链路完整。 |
| AC-2 双击 OK 全屏 | ✅ 达成（代码正确，待实测） | `handleDoubleOk` 直接模式且有 media 调 `playback.toggleFullscreen()`（`TvShell.kt:854-857`）→ `evaluateJavascript` 取 `tvBroGetVideoRect` 视频中心、失败回退 WebView 中心，再 `dispatchDoubleTap` 派发真实 `MotionEvent`（`WebViewWebEngine.kt:296-337`）；已全屏走 `hideFullscreenView`（:852）。DOWN/UP 40ms、两 tap 间隔 120ms 在系统双击窗口内；坐标按 `wv` 宽高归一化并 clamp [0,1]；`finally` 中 `recycle()`。user activation 根因处理正确。 |
| AC-3 光标模式视频音量泄漏 | ✅ 达成 | capture 阶段 `wheel`/`mousewheel` 监听（`media_controls.js:321`），`isInMedia` 沿 `parentElement` 查 VIDEO/AUDIO，命中才 `stopImmediatePropagation`+`preventDefault`（:303-315），非媒体区不拦截。同源 iframe 祖先偏移累加正确（:269-283）；跨源 iframe 因同源策略无法注入监听，安全降级（可接受）。 |
| AC-4 APK 固定文件名 | ✅ 达成 | `androidComponents.onVariants` 对所有 variant 设 `outputFileName="songzi-browser.apk"`（`build.gradle.kts:108-114`），AGP 9.5.1 支持该 API；构建产物与 dist 拷贝均为该名。 |
| AC-5 调试日志清理 | ✅ 达成 | 全仓 grep 无 `NavDebug`、无“方向键→”Toast、无 `Log.d("CursorLayout"`（仅 spec/strings 合法文案命中）；`CursorLayout.kt` 无 Toast/Log，吞方向键逻辑保留。 |

## 非阻塞风险（记录，不阻塞通过）
1. 若传 `-PenableAbiSplits`，同 variant 多 ABI output 同名会互相覆盖；默认 `assembleGenericRelease` 不开 splits，不影响 AC-4。若后续启用 splits，需在 `onVariants` 中按 output 类型区分文件名。
2. AC-2（爱奇艺全屏成功率）与 AC-3（音量实测）最终效果依赖用户安装 APK 实测，无 adb/logcat 无法在审查阶段确认；静态仅确认实现正确。
3. wheel 拦截对所有站点视频生效，可能影响个别靠滚轮 seek 的站点（spec 范围内可接受）。

## 审查结论处理
- 无空指针、越界或明显回归；审查未修改任何文件、未运行构建。
- 结论为 PASS，无需返回 Implement 阶段。AC-2/AC-3 的用户实测作为上线后验证项跟踪。

## Review History
- 2025-11-20 第 1 轮：独立审查 → PASS（本轮）。
