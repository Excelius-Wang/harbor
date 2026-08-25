# 全局快捷键开发指南

本指南介绍如何在 Tauri v2 应用中使用 `tauri-plugin-global-shortcut` 插件实现全局快捷键功能。

## 概述

全局快捷键允许应用在未获得焦点时也能响应键盘组合键。本模板提供了完整的实现方案：

- 键盘事件捕获与转换
- 快捷键注册/注销
- 快捷键输入 UI 组件
- 权限配置

## 配置步骤

### 1. 安装插件

在 `src-tauri/Cargo.toml` 中添加：

```toml
[dependencies]
tauri-plugin-global-shortcut = "2"
```

### 2. 初始化插件

在 `src-tauri/src/lib.rs` 中：

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::init())
        // ... 其他插件
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 3. 配置权限

在 `src-tauri/capabilities/default.json` 中添加：

```json
{
  "permissions": [
    "global-shortcut:default",
    "global-shortcut:allow-is-registered",
    "global-shortcut:allow-register",
    "global-shortcut:allow-register-all",
    "global-shortcut:allow-unregister",
    "global-shortcut:allow-unregister-all"
  ]
}
```

### 4. 安装前端依赖

```bash
pnpm add @tauri-apps/plugin-global-shortcut
```

## 实现方式

### 工具函数 (`src/lib/shortcut.ts`)

#### 转换键盘事件为快捷键字符串

```typescript
import { convertToShortcut } from "@/lib/shortcut";

// 示例：Ctrl+Shift+A
const shortcut = convertToShortcut(keyboardEvent);
```

**支持的修饰键：**
- `Ctrl` / `Cmd` (macOS)
- `Alt`
- `Shift`

**特殊按键：**
- `Space`、`Enter`、`Esc`
- 方向键：`Up`、`Down`、`Left`、`Right`
- 单字符：自动转为大写

#### 注册快捷键

```typescript
import { registerShortcut } from "@/lib/shortcut";

await registerShortcut("Ctrl+Shift+A", () => {
  console.log("快捷键触发！");
});

// 替换已有快捷键
await registerShortcut("Ctrl+Shift+B", callback, "Ctrl+Shift+A");
```

#### 注销快捷键

```typescript
import { unregisterShortcut, unregisterAllShortcut } from "@/lib/shortcut";

// 注销指定快捷键
await unregisterShortcut("Ctrl+Shift+A");

// 注销所有快捷键
await unregisterAllShortcut();
```

### UI 组件 (`src/components/shortcut-input.tsx`)

预构建的快捷键输入组件：

```typescript
import { ShortcutInput } from "@/components/shortcut-input";

function Settings() {
  const [shortcut, setShortcut] = useState("Ctrl+Shift+A");

  return (
    <ShortcutInput
      value={shortcut}
      onChange={setShortcut}
    />
  );
}
```

**功能特性：**
- 点击聚焦并捕获键盘输入
- 按 `Backspace` 或 `Delete` 清除
- 带清除按钮的视觉反馈
- 支持国际化占位符文本

## 完整示例

```typescript
import { useEffect, useState } from "react";
import { ShortcutInput } from "@/components/shortcut-input";
import { registerShortcut, unregisterShortcut } from "@/lib/shortcut";
import { getCurrentWindow } from "@tauri-apps/api/window";

function Settings() {
  const [shortcut, setShortcut] = useState("Ctrl+Shift+A");

  useEffect(() => {
    // 注册快捷键以显示窗口
    const setupShortcut = async () => {
      await registerShortcut(shortcut, async () => {
        const window = getCurrentWindow();
        await window.show();
        await window.setFocus();
      });
    };

    setupShortcut();

    // 组件卸载时清理
    return () => {
      unregisterShortcut(shortcut);
    };
  }, [shortcut]);

  return (
    <div>
      <label>全局快捷键：</label>
      <ShortcutInput value={shortcut} onChange={setShortcut} />
    </div>
  );
}
```

## 最佳实践

1. **始终注销**：组件卸载或快捷键变更时清理注册
2. **验证输入**：确保快捷键至少包含一个修饰键
3. **避免冲突**：注册前检查快捷键是否已被占用
4. **用户反馈**：设置/更改快捷键时显示提示消息
5. **持久化**：将用户自定义快捷键保存到本地存储或配置文件

## 故障排查

### 快捷键无效

- 检查快捷键是否已被系统或其他应用占用
- 验证 `capabilities/default.json` 中的权限配置
- 确保插件已在 `src-tauri/src/lib.rs` 中初始化

### 快捷键冲突

```typescript
import { isRegistered } from "@tauri-apps/plugin-global-shortcut";

const registered = await isRegistered("Ctrl+Shift+A");
if (registered) {
  console.warn("快捷键已被注册");
}
```

## API 参考

### `convertToShortcut(event: KeyboardEvent): string`

将浏览器 KeyboardEvent 转换为 Tauri 快捷键格式。

**返回值：** 快捷键字符串（如 "Ctrl+Shift+A"）或空字符串（无效输入）

### `registerShortcut(shortcut: string, callback: () => void, oldShortcut?: string): Promise<void>`

注册全局快捷键及回调函数。

**参数：**
- `shortcut`：要注册的快捷键字符串
- `callback`：快捷键按下时执行的函数
- `oldShortcut`：可选的旧快捷键，用于注销

### `unregisterShortcut(shortcut?: string): Promise<void>`

注销指定快捷键。

### `unregisterAllShortcut(): Promise<void>`

注销应用注册的所有快捷键。

## 相关文档

- [Tauri 全局快捷键插件](https://v2.tauri.app/plugin/global-shortcut/)
- [键盘事件参考](https://developer.mozilla.org/zh-CN/docs/Web/API/KeyboardEvent)
