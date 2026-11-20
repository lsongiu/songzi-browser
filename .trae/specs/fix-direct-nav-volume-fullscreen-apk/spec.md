# 松子浏览器 - 遥控器体验修复（直接导航/音量/全屏/APK命名）PRD

## Overview
- **Summary**: 修复直接导航模式无法聚焦地址栏、双击确定键爱奇艺无法全屏、光标模式方向键误改视频音量三个问题，并固定 APK 输出文件名。
- **Purpose**: 让遥控器两种导航模式都能稳定、可预期地操作浏览器与在线视频。
- **Target Users**: 在 Android TV 上用遥控器使用「松子浏览器」观看爱奇艺等在线视频的用户。

## Goals
- 直接导航模式下可用返回键打开地址栏并输入网址。
- 直接导航模式下双击确定键可让爱奇艺（及同类站点）视频全屏 / 退出全屏。
- 光标模式下方向键不再改变视频音量，页面其它位置仍可正常滚动。
- 每次构建产物 APK 文件名固定，不再每次一个新名字。

## Non-Goals
- 不引入完整的网页空间导航 JS（直接导航仍依赖 WebView 原生焦点移动）。
- 不改变光标模式下方向键移动光标的行为。
- 不重构媒体播放架构。

## Background & Context
- 仓库：tv-bro v3.0.5 二开，`/home/liusong/workspace/tv-browser`，当前 HEAD `75a83b8c`。
- 两种模式：光标模式（`CursorLayout.willNotDraw()==false`，D-pad 移动光标）、直接导航模式（`willNotDraw()==true`，D-pad 交给 WebView）。MENU 键切换。
- 已提交但未解决问题的尝试：`ca4e4fd4`（CursorLayout 吞方向键）、`1074d614`（Activity 层拦截方向键）。两者都假设音量泄漏来自按键，但**根因是合成滚轮事件**，故无效，且代码中留有调试 Toast / 日志。
- 无 adb / logcat，验证靠编译后用户实测。
- 约束：APK 放 `/home/liusong/workspace/tv-browser-dist/`；提交用**显式文件列表**（避免 `.trae/` 误提交）；推送到 `https://github.com/lsongiu/songzi-browser` 的 master。

## Functional Requirements
- **FR-1**: 直接导航模式下，按返回键打开顶部动作栏并把焦点落到地址栏（`flUrl`），可编辑网址；再次按返回键关闭动作栏回到页面。导航模式切换仍走 MENU 键。
- **FR-2**: 直接导航模式下且页面有视频时，400ms 内第二次按确定键，向 WebView 派发真实双击触摸事件到视频中心，触发站点自身的双击全屏（爱奇艺可用）；已全屏则退出。
- **FR-3**: 光标模式下，光标移动 / 边缘滚动产生的合成滚轮事件落在 `<video>`/`<audio>` 上时不改变音量；页面其它区域滚轮仍可滚动。
- **FR-4**: release 构建产物文件名固定为 `songzi-browser.apk`，拷贝到 dist 目录时同名覆盖。
- **FR-5**: 移除前两次调试遗留的 Toast 与 NavDebug 日志（不改变行为）。

## Non-Functional Requirements
- **NFR-1**: 不破坏光标模式现有交互，不破坏直接导航模式下链接的方向键聚焦。
- **NFR-2**: 改动尽量局部，避免引入回归。

## Constraints
- **Technical**: Kotlin / AndroidX WebView。`evaluateJavascript` 执行上下文**没有用户激活**，故全屏不能仅靠 JS `requestFullscreen`；真实 `MotionEvent` 经 `WebView.dispatchTouchEvent` 走 Chromium 输入管线，携带用户激活。
- **Business**: 不引入新依赖。
- **Dependencies**: 无。

## Assumptions
- 爱奇艺视频位于 WebView 中心区域，双击中心可命中视频。
- 爱奇艺在其页面（或同源 iframe）监听 dblclick 切换全屏。
- 用户无 adb，通过安装 APK 实测验证。

## Acceptance Criteria

### AC-1: 直接导航可聚焦地址栏
- **Type**: `rule`
- **Given**: 处于直接导航模式（光标隐藏），页面非全屏、无其它面板打开
- **When**: 按返回键
- **Then**: 顶部动作栏滑入并聚焦地址栏，按确定键可开始编辑网址；再次按返回键关闭动作栏回到页面
- **Pass Condition**: 直接导航模式下能输入并提交网址
- **Evidence**: 编译后用户实测（无 logcat）

### AC-2: 双击确定键全屏爱奇艺
- **Type**: `rule`
- **Given**: 直接导航模式，爱奇艺视频页且存在正在播放的视频
- **When**: 400ms 内连续按两次确定键
- **Then**: 视频进入全屏；全屏状态下再次双击退出全屏
- **Pass Condition**: 爱奇艺全屏切换成功且可退出
- **Evidence**: 用户实测

### AC-3: 光标模式不误改音量
- **Type**: `rule`
- **Given**: 光标模式，光标位于视频上方
- **When**: 按方向键（含把光标推到屏幕边缘触发滚动）
- **Then**: 视频音量不变化；光标在页面非视频区域时方向键推到边缘仍可滚动页面
- **Pass Condition**: 视频上音量不变 + 非视频区可滚动
- **Evidence**: 用户实测

### AC-4: APK 文件名固定
- **Type**: `rule`
- **Given**: 执行 `./gradlew assembleGenericRelease`
- **When**: 构建完成
- **Then**: 产物为 `app/build/outputs/apk/generic/release/songzi-browser.apk`，并拷贝到 `/home/liusong/workspace/tv-browser-dist/songzi-browser.apk`（同名覆盖）
- **Pass Condition**: 文件名不含版本 / 提交哈希，多次构建同名
- **Evidence**: `ls` 输出

### AC-5: 无调试残留
- **Type**: `rule`
- **Given**: 构建并运行
- **When**: 操作方向键 / 确定键
- **Then**: 不再弹出 “方向键→光标 / 方向键→WebView” Toast，无 NavDebug 日志输出
- **Pass Condition**: 源码中无相关 Toast / Log.d
- **Evidence**: grep 无匹配

## Open Questions
- 无（已与用户确认“输入框”指浏览器顶部地址栏）
