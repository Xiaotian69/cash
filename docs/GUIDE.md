# 个人资产管家

本机使用的 Windows 资产管理与极简记账应用。手动维护账户余额，也可以记录收入、支出，并选择是否同步账户余额。没有登录、云同步或银行接口。

## Windows 桌面版

项目使用 React、Vite、TypeScript、IndexedDB 和 Tauri 2。Windows 构建需要 Rust MSVC 工具链、Visual Studio 2022 C++ Build Tools（包含“使用 C++ 的桌面开发”）与 WebView2 Runtime。

```powershell
cd cash
npm install
npm run tauri dev
npm run tauri build
```

构建成功后，可直接运行 `src-tauri\target\release\personal-asset-manager.exe`；安装包为 `src-tauri\target\release\bundle\nsis\个人资产管家_1.0.0_x64-setup.exe`。双击安装包后，程序默认安装在 `%LOCALAPPDATA%\个人资产管家\personal-asset-manager.exe`，开始菜单和桌面均可创建快捷方式。应用关闭窗口即退出，不需要浏览器或本地服务器。开发模式的 Vite 服务只供 `tauri dev` 使用。

Windows 窗口默认 1100×750，最小 900×600。主内容和图表已经按 1366×768、1920×1080 桌面窗口调整。

## 数据和首次使用

首次打开是空状态，不会自动创建演示账户。数据保存在应用自身的 WebView2 IndexedDB 中，位于 `%LOCALAPPDATA%\com.personalassetmanager.desktop\EBWebView\Default\IndexedDB\http_tauri.localhost_0.indexeddb.leveldb`。关闭和重新启动应用会继续读取同一份数据。Web 版 `http://127.0.0.1:5173` 的浏览器数据与桌面版相互独立；如需从浏览器迁移，在原浏览器的设置页先导出 JSON，再在桌面版导入。

卸载 NSIS 安装版时，不勾选“删除应用数据”会保留本机数据；勾选后会删除上述 WebView2 数据目录。无论是否卸载，都建议先导出 JSON 备份。备份文件独立于应用数据目录。

## 使用

- **资产**：添加、编辑、删除账户；点击账户可快速更新余额。信用账户和负债账户内部保存正数欠款，界面显示负号。每次余额变化会更新当天唯一的资产快照。删除有流水的账户时，流水会保留并标记原账户已删除；这些流水不能再恢复已删除账户的余额。
- **记账**：记录支出或收入，选择已有账户，默认同步余额，也可关闭同步以补记历史。资产账户支出减少余额；信用或负债账户支出增加欠款；收入只能进入资产账户。编辑已同步流水会撤销旧影响再应用新影响，删除时可选择是否恢复账户余额。
- **图表**：查看资产、负债、净资产走势，资产构成与账户排行。图表中的历史节点来自每日资产快照，流水统计与资产余额各有自己的含义。
- **设置**：导出、导入 JSON 备份，修改显示货币符号或清空本地数据。导入会覆盖现有账户、流水、快照和设置；旧版没有 `transactions` 字段的备份也可导入。

## 备份与恢复

1. 打开「设置」→「导出备份」，保存生成的 `personal-finance-backup-YYYY-MM-DD.json`。
2. 恢复时打开「设置」→「导入备份」，选择文件并确认覆盖。
3. 导入前会校验账户、流水、历史快照和设置；格式错误时不会修改现有数据。

## 开发检查

```powershell
npm test
npm run lint
npm run build
npm run test:native
```

浏览器操作验收和桌面布局检查需要本机 Microsoft Edge 及 Vite 开发服务器：

```powershell
npm run dev
# 在另一个终端执行
npm run test:browser
npm run test:desktop
```

`test:desktop` 会在 `artifacts\` 生成 1920×1080 的资产、记账、图表和设置页面截图，并检查 900×600、1366×768、1920×1080、2560×1440 的布局几何尺寸。

`test:native` 需要先完成 `npm run tauri build`，会启动真实 Windows 程序并使用 `artifacts` 中独立的 WebView2 测试目录，验证两次正常关闭重启后的 IndexedDB、流水和 JSON 备份恢复。默认测试构建目录中的 exe；设置 `CASH_NATIVE_EXECUTABLE` 为安装目录中的 exe 路径，可验收安装版。

## 发布构建与路径脱敏

Rust 可能把编译环境的绝对路径写入可执行文件。对外分发时，在项目根目录的 PowerShell 中使用以下命令，把用户目录和项目路径映射为通用路径，并移除符号信息：

```powershell
$env:RUSTFLAGS = "--remap-path-prefix=$env:USERPROFILE=/build/user --remap-path-prefix=$((Get-Location).Path)=/build/cash"
$env:CARGO_PROFILE_RELEASE_STRIP = 'symbols'
npm run tauri build
```

参数变化会触发依赖重新编译。发布前仍需扫描最终可执行文件并运行 `npm run test:native`；不要分发本机测试资料、调试符号或运行数据目录。
