# 自动更新配置

本文说明本项目使用的发布与自动更新流程。

## 概览

本项目使用 GitHub Releases 作为更新后端。在发布工作流中，GitHub Actions 会替换 `src-tauri/tauri.conf.json` 里的更新占位符，使应用指向：

```text
https://github.com/<owner>/<repo>/releases/latest/download/latest.json
```

## 前置条件

1. 生成用于安全更新的签名密钥对
2. 在 GitHub Actions 中配置签名相关 Secrets
3. 从 `main` 分支发版
4. 使用 `vX.Y.Z` 格式的标签发布版本

## 步骤 1：生成签名密钥

运行以下命令生成密钥对：

```bash
pnpm tauri signer generate -w ~/.tauri/myapp.key
```

该命令会输出：
- **私钥**：保存到 `~/.tauri/myapp.key`
- **公钥**：一个以 `dW50cnVzdGVkIGNvbW1lbnQ6...` 开头的字符串

请妥善保管私钥。

## 步骤 2：配置 GitHub Secrets

在 GitHub 仓库的 Settings → Secrets and variables → Actions 中添加以下 Secrets：

1. `TAURI_SIGNING_PRIVATE_KEY` - `~/.tauri/myapp.key` 的内容
2. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` - 你设置的密码（如果有）
3. `TAURI_SIGNING_PUBLIC_KEY` - 第 1 步生成的公钥

## 步骤 3：保持版本文件一致

发布脚本要求以下文件中的版本号保持一致：

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

不要只手动修改其中一个文件，统一使用发布脚本作为版本发布入口。

## 步骤 4：创建发布

运行：

```bash
pnpm release:version
```

脚本在真正修改文件前会执行发布前检查：
- 确保工作区干净
- 强制要求当前分支为 `main`
- 校验三个版本文件完全一致
- 检查目标 tag 是否已在本地或远端 `origin` 存在

之后它会：
- 同步更新所有版本文件
- 创建发布提交
- 创建 `vX.Y.Z` tag
- 可选地推送分支和 tag

GitHub Actions 会在收到 `v*` 标签后触发。

## 步骤 5：验证发布产物

GitHub Actions 完成后，确认最新已发布 Release 中包含以下更新相关资源：
- `latest.json`
- Windows updater bundle 产物
- 签名文件

如果最新已发布 Release 中缺少 `latest.json`，客户端将无法发现更新。

## 工作原理

1. 应用会在启动时或手动检查时访问 updater endpoint
2. 如果发现更高版本，应用会显示更新对话框
3. 如果没有更新，手动检查会明确显示当前已是最新版本
4. 如果检查失败，界面会显示错误，而不是误报为已是最新版本
5. 下载过程中，进度基于累计下载字节数计算
6. 安装完成后，应用会自动重启

## 故障排查

**更新检查失败：**
- 检查最新 Release 资源中是否包含 `latest.json`
- 确认签名密钥配置正确

**检测不到更新：**
- 确认已安装应用的版本低于最新 Release 的版本
- 确认发布标签使用 `vX.Y.Z` 格式

**签名验证失败：**
- 确认 `TAURI_SIGNING_PRIVATE_KEY` 与 `TAURI_SIGNING_PUBLIC_KEY` 匹配
- 修正 Secrets 后重新构建并重新发布

## 相关文件

- `.github/workflows/release.yml`
- `scripts/release-version.mjs`
- `src-tauri/tauri.conf.json`
