# 题仓 Android 候选版交付与国内发布准备

更新：2026-10-28。状态：开发候选版，未提交应用市场；本阶段按用户要求暂停手机实测，仅准备交付材料。

本文件不是审核通过证明、最终隐私政策或销售授权。另见 [源码交付说明](source-handoff.md) 和 [历史真机验收记录](../superpowers/plans/2026-10-16-android-device-acceptance.md)。

## 产品与版本

| 项目 | 当前内容 |
| --- | --- |
| 产品 / 商店名称 | 题仓 |
| 软件全称 | 题仓错题整理软件 |
| 核心用户 | 大学生、考证学习者，其次是其他学习者 |
| 风格 / 宣传语 | 专业、简洁、高效 / 拍照归档，专注提分 |
| 建议分类 | 教育 / 学习工具，按市场实际类目确认 |
| Android 包名 | `com.nanen9396.ticang` |
| Android 版本 | versionName `1.0`，versionCode `1` |
| SDK 配置 | min 24 / compile 36 / target 36 |
| 运行方式 | Capacitor Android 壳、React / TypeScript、本地 OCR / IndexedDB |
| 完整备份 | `.ticang.json`，兼容旧 `cuotiji` v1，含原图，最大 100 MB |

来源：[已批准品牌规格](../../app/docs/superpowers/specs/2026-10-01-ticang-brand-design.md)、[Android 配置](../../app/android/app/build.gradle)、[SDK 配置](../../app/android/variables.gradle)。`app/package.json` 的 `0.1.0` 不是 Android 版本号。最低 SDK 是配置下限，不代表所有版本均已真机验收。

## 商店文案草稿

简短介绍：拍照识别并归档错题，按科目与题型整理，随时乱序复习。

详细介绍：

> 题仓是一款本地优先的错题整理工具，为大学课程与考证复习保存易错点。
>
> 拍照或从相册选取题目图片，识别印刷中英文后人工校对；按学习目标、科目和题型归档，也可以输入自己的考试名称与科目。复习时顺序或乱序刷题，查看原题图片与已填写答案。题目、图片和笔记保存在当前设备，可导出包含原图的完整备份。
>
> 目前不提供 AI 解题、云同步或账号服务。手写、复杂公式与图表内容需要自行核对；图表通过原图保留，不提供图片语义理解。卸载、清除应用或浏览器数据可能导致题库丢失，请自行保存完整备份。

不得添加“准确率 99%”“手写公式全识别”“自动解题”“永不丢失”“所有手机兼容”等无依据宣传。本地优先不等于已通过整应用隐私安全认证。

## 已实现与待验收

| 能力 | 已实现 | 未关闭项 |
| --- | --- | --- |
| 拍照 / 相册 | 系统入口、预览；Android 相机可见性已修复 | 相机直接返回、取消和厂商兼容 |
| OCR | 内置中英文模型；真实引擎自动回归和历史单机离线识别证据 | 干净题干质量、公式和低内存表现；不承诺手写支持 |
| 分类 / 题库 | 自定义目标科目、待分类、搜索、编辑、事务回滚 | 大题库实用性及非空答案笔记真机检查 |
| 复习 | 原图、顺序 / 乱序入口、显示答案、下一题 | 单题真机入口不能证明多题乱序效果 |
| 完整备份 | 导出、系统分享 / 下载、导入去重；多 MB 图片校验修复 | 隔离设备完整恢复，不能删除用户唯一数据来测试 |
| 其他平台 | 仓库含 iOS 工程 | 未完成 Xcode 验收；没有原生鸿蒙 HAP / ArkTS 成品 |

## 构建与交接

环境：Node、pnpm、JDK 21、Android SDK Platform 36 / Build Tools 36；本机 SDK 路径按 [README](../../README.md) 配置。使用 pnpm 锁文件和 Tesseract.js 补丁：

```powershell
cd app
pnpm install --frozen-lockfile
pnpm run check:runtime
pnpm run test:backup
pnpm run test:model
pnpm run test:ocr
pnpm run typecheck
pnpm run native:sync
pnpm run test:release
$env:JAVA_HOME = '<JDK 21 安装目录>'
cd android
.\gradlew.bat --no-daemon assembleRelease bundleRelease
cd ..
.\scripts\verify-android-ocr.ps1
Get-FileHash -Algorithm SHA256 -LiteralPath 'android/app/build/outputs/apk/release/app-release.apk'
Get-FileHash -Algorithm SHA256 -LiteralPath 'android/app/build/outputs/bundle/release/app-release.aab'
```

首次下载依赖、SDK 和 Gradle 需要网络；缓存齐全后 Gradle 可用 `--offline`。`native:sync` 不等于完成 iOS 编译。发行者在仓库外配置签名，缺少配置时 release 构建会拒绝执行；私钥和密码不放入普通交付包。

APK 是安装候选包，AAB 是候选分发产物；目标渠道决定接受的格式。每次交付重记提交号、工作区修改状态、包大小、SHA256、签名核验和资源比对，不能复用历史包哈希。历史 AAB 有 jarsigner 顺序读取警告，未完成 bundletool / 目标市场校验，不得标记为正式发布包。

## 用户数据与备份

1. “数据管理”→“生成完整备份”→“分享或下载”→系统本地文件保存入口。
2. 核对 `.ticang.json` 实际存在且非空；仅出现分享提示不证明文件已落盘。
3. 备份未加密，含照片和笔记，不应公开上传。升级前先备份，不卸载或清空题库。
4. “导入备份”选择文件；相同 ID 跳过，不覆盖本机题目。
5. 跨设备恢复由用户主动授权传输，在隔离环境核对文字、分类、非空答案笔记和原图；不能在唯一数据设备上删除后试恢复。

当前 OCR / 题库无应用服务端；网页版向同源站点加载资源，原生包内置资源。用户选择第三方分享目标后的数据处理不由应用承诺控制。Manifest 声明 INTERNET 权限，不能宣传整个进程绝不联网；主 Manifest 也不能替代最终合并权限核验。

## 国内上架材料工作单

| 材料 | 已有内容 / 仍需完成 |
| --- | --- |
| 主体 | 发行者确定真实个人 / 企业主体；核实市场是否接受该主体和类目再实名；不在仓库保存身份证、住址 |
| 名称与分类 | 复用本文件；名称与商标可用性待核实，不保证注册成功 |
| 软件包与证书 | 从本次签名产物提取包名、版本、公钥 / 指纹；文件 SHA256 不是证书指纹 |
| 图标 | [批准母版](../../app/docs/superpowers/specs/assets/ticang-icon-approved.png)，按市场尺寸导出；adaptive 前景不直接当商店图标 |
| 截图 | 首页、校对、分类、复习、备份；只用自编题目和授权图片，不用用户照片或伪造通过提示；本轮不生成实测截图 |
| 隐私说明 | 真实发行者、反馈渠道、数据处理、选图 / 分享、保存删除、第三方清单、可访问政策地址；目前无最终政策及应用内“关于与隐私”入口 |
| 版权与资质 | 核实源码、模板、图标、字体、OCR 模型和二进制依赖分发权；软著等按实际渠道要求准备 |
| APP 备案适用性 | 以当前无自营服务端的实际形态咨询渠道 / 主管部门；不因 INTERNET 权限就认定必需备案，也不自行保证单机豁免 |
| 审核说明 | 无账号；写清选图→校对→保存→复习→备份的路径和局限；实测暂缓不能写验收完成 |

官方资料核对于 2026-10-28：工信部说明 APP 互联网信息服务备案办理渠道；小米指引区分不联网单机与需要联网接入的 APP。本项目是否满足渠道的单机认定仍需确认，不为申请虚构服务器或域名。[工信部解读](https://www.miit.gov.cn/jgsj/xgj/hlwgl/art/2023/art_564bf0759d7e41d5b4aa8ce4996b9e84.html)、[小米备案指引](https://dev.mi.com/xiaomihyperos/documentation/detail?pId=1739)。

华为当前公开入门页介绍 HarmonyOS 分发、实名、隐私与资质环节，不证明本项目 Android APK 自动等于原生鸿蒙包或可在所有华为系统发布。先确认目标平台与包格式。[华为分发入门](https://developer.huawei.com/consumer/cn/appgallery/devstart/)。

## 后续顺序与放行条件

1. 选定一个接收 Android 包的国内渠道，确认个人准入、类目、包格式和单机备案口径。
2. 确认主体展示名、反馈邮箱和政策托管地址，再设计并开发“关于、隐私与许可”入口；不写假联系人和备案号。
3. 关闭模板 / 图标 / OCR / 依赖权属问题；按白名单准备源码，不公开全仓压缩包。
4. 用户恢复实测后，补齐相机、纯题干、多题复习和隔离恢复；核对厂商与 Android 兼容。
5. 按渠道补齐隐私、漏洞、资质等检测，重建并核验产物，再由发行者决定提交。

当前未放行：真机补验、权属、发行者政策信息、市场准入和产物发布校验。继续准备材料不是提前放行。
