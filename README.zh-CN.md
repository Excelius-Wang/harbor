# Harbor

Harbor 是一个基于 Tauri、React 和 TypeScript 构建的 GitHub 桌面工作台。

它会把常用 GitHub 工作流、必要的 Web 兜底、内容发现和可折叠的 Agent 侧边栏组合在一起，
但不会把嵌入 GitHub Web 当作整个产品架构。

## 本地开发

需要安装 Node.js、pnpm、Rust，以及 Tauri 对应平台的开发依赖。

```bash
pnpm install
pnpm tauri:dev
```

常用检查：

```bash
pnpm check
cargo check --manifest-path src-tauri/Cargo.toml
```

## 项目基础

初始应用外壳基于
[kitlib/tauri-app-template](https://github.com/kitlib/tauri-app-template)。Harbor 维护自己的产品架构，
只通过边界清晰的小接口引入外部实现。

## 许可证与署名

Harbor 的自有代码采用
[AGPL-3.0-only](https://www.gnu.org/licenses/agpl-3.0.html)。复制或修改 Harbor 时，必须保留
[NOTICE](NOTICE) 中的作者署名和原始仓库链接。模板的 MIT 声明及其他需要保留的第三方声明见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
