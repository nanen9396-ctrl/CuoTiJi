# Android 真机验收记录（2026-10-16）

## 范围与安全边界

- 沿用 `codex/local-ocr` 工作区，基础提交 `ce1ac42`，不修改根目录 main。
- 用户授权连接手机、安装题仓和真机验收；ADB 始终指定同一台用户授权设备，不将序列号提交到仓库。
- 手机为 HUAWEI NOH-AN00、Android 12 / API 31、arm64-v8a，Huawei WebView 114.0.5.302，物理分辨率 1344 × 2772、density 560。
- 安装前未发现 `com.nanen9396` 应用；首次安装与本次修复均用 `install -r`，未卸载、清除存储或修改安全设置。
- 只抓取题仓页面，不截图系统相机画面。真实拍照由用户对准测试题完成；不自动按快门。
- 用户开启飞行模式并关闭 Wi-Fi；仅只读核对设置，不擅自修改通信状态。验收结束后需提醒恢复网络。
- 不通过删除错题来测试恢复；原机重导入只验证去重，丢失后恢复需另用隔离设备。

## Task 1：连接、安装和启动

- [x] 解决空设备列表及 `unauthorized` 前置状态；用户在手机上授权后，ADB 为 `device`。
- [x] 校验阶段二 APK SHA256 `ECF20B6B18D1EA8AB3D7A7245E9BA9B962B3A0312B91FB6BFCA3172114E107B5`，安装返回 `Success`。
- [x] 核对包名 `com.nanen9396.ticang`、versionCode 1、versionName 1.0；真实首页截图显示标题、拍照按钮、分类入口。
- [x] 应用在前台且进程存在。仅采集本应用日志；未发现本次启动的 FATAL EXCEPTION。厂商 WebView/媒体组件有常规警告，不据此宣称应用崩溃。

## Task 2：相机入口修复（红 → 绿 → 真机）

- [x] 原机复现：题仓 → 拍照录入 → 拍照，实际前台为 `com.android.documentsui/.picker.PickActivity`，不是相机。
- [x] 查 Capacitor 8.5.0：`BridgeWebChromeClient.showImageCapturePicker` 先调用 `ACTION_IMAGE_CAPTURE.resolveActivity()`，为 null 时回退文件选择器；当前 Manifest 未声明相机 intent 查询。系统 shell 可解析 `com.huawei.camera/.ThirdCamera`。
- [x] 先新增配置回归检查并观察失败：queries 为空。补最小 `<queries><intent><action android:name="android.media.action.IMAGE_CAPTURE" /></intent></queries>` 后变绿。
- [x] 不添加 Camera 插件、依赖、`CAMERA` / 存储权限或 `QUERY_ALL_PACKAGES`。Android 官方依据：[声明软件包可见性需求](https://developer.android.com/training/package-visibility/declaring)。
- [x] 本地离线 `assembleRelease bundleRelease` 构建成功，实际 APK XML 含查询声明，APK v2 签名验证通过；两种安装包各 18 个 OCR 资源逐 SHA256 比对通过。
- [x] 修复版覆盖安装返回 `Success`，手机实际 `/data/app/.../base.apk` SHA256 与修复 APK 一致。
- [x] 再次点击拍照，实际前台为 `com.huawei.camera/.ThirdCamera`。相机调起问题已在同一设备关闭；此结论不包含照片返回/OCR。
- [x] 独立只读审查：无 Critical/Important；配置测试有 XML 格式敏感这一非阻塞局限，没有测试或节点执行顺序依赖。
- [ ] 用户实际拍照并确认返回题仓，核对照片预览/取消路径。

## Task 3：离线识别与本地数据闭环

- [ ] 在飞行模式开启、Wi-Fi 关闭且无有效网络时首次识别中英文印刷题，核对结果而非仅看进度。
- [ ] 保存目标、科目、答案与笔记，核对原图、题库数量和分类。
- [ ] 停止并重开进程，确认题目与原图持久化。
- [ ] 检查顺序/乱序复习、显示答案/下一题，以及系统返回。
- [ ] 生成备份、打开系统分享，确认实际保存后能重新选取并导入。
- [ ] 同设备重复导入提示新增 0、跳过原有题数；不清空或删除用户数据来模拟恢复。

## 修复版产物

- APK：13,480,675 bytes；SHA256 `C26DC11F92E9B8E5A21B8C4EC134891BEFE6D6464E2CA20EF98BAAB4115D097C`。
- AAB：13,305,083 bytes；SHA256 `7FA7B26750FC0612F103958A681231E5B0A1E433B5D188AFAE3D9E924BC0DFAD`。
- AAB 的 jarsigner 验证退出码为 0，但报告自签名、无时间戳及 JarInputStream 顺序读取不一致警告；不据此声称发布验收完成，正式分发前仍需 bundletool/目标应用市场校验。
- 保留 versionCode 1 / versionName 1.0，尚未提交应用市场。历史阶段记录中的哈希对应旧包，不用于本次安装。
- 本阶段未重新执行 iOS 编译、低内存机或其他厂商真机验收；商业再分发权属审查仍未完成。

## 本地验证

- 新增相机可见性红测先失败再通过；capacitor/native-back/release 11/11 通过。
- 模型 14、备份 8、OCR 4、图标 5、Sites 4，补充回归 35/35 通过；与上述 11 项共 46 项自动检查，不将历史交互回归计入本次运行。
- 29 个受保护运行时文件完整性检查、类型检查及 `git diff --check` 通过。
- 图标补充检查首次因沙盒浏览器路径缺失而未能运行；使用本机已有浏览器重跑，不安装依赖、不弱化检查。
- 最终各项验证及用户实测结果继续补记；不将待验收项目标为通过。
