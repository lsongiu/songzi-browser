# 删除 Gecko 模块，只保留 WebView Implementation Plan

## Repository Research
当前项目是双内核架构：`app/gecko/` 是独立 Gradle 模块（Firefox GeckoView），`app/src/main/` 是共享代码，`app/src/geckoIncluded/` 有 Gecko 专属资源。构建有两个 flavor dimension：`appstore`（generic/google/foss）和 `webengine`（geckoIncluded/geckoExcluded），生成 3×2×2 = 12 个变体。

主逻辑通过 `BuildConfig.WEB_ENGINE_CLASS` 反射实例化内核，WebView 路径是默认路径，所有其他代码对 Gecko 只有注释级别的引用（UA 字符串、注释），没有硬依赖。

## Files and Modules
| 路径 | 操作 |
|---|---|
| `app/gecko/` 整个目录 | 删除（模块本身 + Java + 资源 + assets） |
| `app/src/geckoIncluded/` | 删除（Gecko 专属 banner 资源） |
| `settings.gradle.kts` | 移除 `include(":app:gecko")` |
| `app/build.gradle.kts` | 移除 `webengine` flavor dimension 和 `geckoIncluded`/`geckoExcluded` flavor，移除 `geckoIncludedImplementation` 依赖；保留 `appstore` 三个 flavor（generic 默认、google、foss），但把 flavor dimension 简化为仅一个 `appstore`，不再构建 webengine 变体 |
| `gradle/libs.versions.toml` | 移除 `geckoview` 版本定义和库条目 |
| `app/gecko/build.gradle.kts` 等 | 随模块目录整体删除 |

构建命令简化为 `./gradlew assembleGenericRelease` / `assembleGenericDebug`（variant 名从 `genericGeckoExcludedRelease` 变为 `genericRelease`）。

## Implementation Steps
1. 删除 `app/gecko/` 整个目录
2. 删除 `app/src/geckoIncluded/` 目录
3. 编辑 `settings.gradle.kts` 移除 `include(":app:gecko")`
4. 编辑 `app/build.gradle.kts`：
   - 移除 `flavorDimensions += listOf("appstore", "webengine")`，改为 `flavorDimensions += listOf("appstore")`
   - 移除 `geckoIncluded` 和 `geckoExcluded` 两个 productFlavor 块
   - 给 generic/google/foss 三个 flavor 明确写 `dimension = "appstore"`（因为不再自动继承）
   - 移除 `"geckoIncludedImplementation"(project(":app:gecko"))` 依赖行
   - 把默认 flavor 选回 generic（`isDefault = true` 已经在 generic 里，不用改）
5. 编辑 `gradle/libs.versions.toml`：删掉 geckoview 版本和库行
6. 构建验证：`./gradlew assembleGenericRelease` 成功 + APK 安装跑起来

## Dependencies and Considerations
- 代码里对 Gecko 的引用（`GeckoWebEngine` 类名、注释里的 "GeckoView"）全部是可选路径或注释，不会被编译到 WebView 变体。删掉模块后这些引用仍留着（只是永远不进执行路径），对运行时无影响。
- `appstore` 三个 flavor（generic/google/foss）保留，因为用户可能有朝一日需要不同签名/渠道。如果你想要最极简，也可以直接连 flavor 也删了变成单变体，等你批准时再说。
- `WEB_ENGINE_CLASS` 这个 BuildConfig 字段保留，值固定为 `com.phlox.tvwebbrowser.webengine.webview.WebViewWebEngine`，反射初始化路径不变，只是构建时不再有 gecko 选项。

## Validation
- `./gradlew assembleGenericRelease` 成功，输出 APK 大小比 GeckoIncluded 版小 20MB+
- APK 安装，启动进入首页，打开 B站，返回键回到自定义首页（之前的 bug 修复仍然有效）

## Risks
- **variant 名变化**：之前命令是 `assembleGenericGeckoExcludedRelease`，简化后是 `assembleGenericRelease`。如果有脚本引用旧名字，需要同步更新。处理：用户手动改一下构建命令即可，本项目之前也没有自动脚本。
- **多 flavor 仍保留**：`genericRelease`、`googleRelease`、`fossRelease` 三个 release 都会构建。如果想只构建 generic，可以用 `./gradlew :app:assembleGenericRelease` 精确指定，或后续再删 google/foss。
