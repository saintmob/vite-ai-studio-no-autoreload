# Vite AI Studio 禁止额外自刷新配置

这是一个专门用于 Google AI Studio Build 项目的 `vite.config.ts` 方案。

目标不是阻止 AI Studio 在改完文件后刷新预览，而是阻止 Vite 自己因为 websocket 断线、重连、轮询等原因额外刷新页面。

## 本地热更新不会被破坏

这个补丁现在已经加上了环境开关。

它只会在检测到以下环境变量之一时启用：

```text
DISABLE_HMR=true
AI_STUDIO_NO_AUTORELOAD=true
```

在普通本地开发环境中，如果这两个变量都不存在，补丁不会安装，Vite 标准热更新行为保持不变。

这意味着你把代码拉到本地后，仍然可以正常使用 Vite HMR。

## 你需要改什么

只需要覆盖或局部修改你项目里的 `vite.config.ts`。

你**不需要**改动：

- `package.json`
- npm scripts
- dependencies
- React 入口文件
- app 业务源码
- Google AI Studio Build 设置

这个仓库刻意只保留一个 Vite 配置方案，避免对用户项目造成额外干扰。

## 问题

在 Google AI Studio Build 的预览控制台里，可能会看到：

```text
[vite] connecting...
[vite] connected.
[vite] server connection lost. Polling for restart...
```

这说明页面中加载了 Vite 的浏览器端客户端 `/@vite/client`。

当 dev server 连接断开并恢复时，这个客户端可能会轮询、重连，并触发页面刷新。如果你正在使用预览页面，页面状态会被破坏。

本项目**不试图阻止** Google AI Studio 在 AI 修改文件后触发的预览刷新。它只处理 Vite 自己造成的额外 websocket / polling / reconnect 刷新。

## 方案

保留 `vite dev`，但只在 AI Studio 补丁模式下，把浏览器端的 `/@vite/client` 替换成一个不会 websocket、不会 polling、不会 reload 的假客户端。

这个配置会：

- 继续兼容 Google AI Studio Build 必须使用的 `vite dev`
- 只在 AI Studio 补丁模式下禁用 Vite 浏览器端 websocket 重连、轮询和自动刷新
- 只在 AI Studio 补丁模式下禁用 HMR
- 保留 Vite dev 模式下的 CSS 注入能力
- 保留文件监听，让 Vite dev server 在文件变化后仍可更新模块缓存
- 在没有 AI Studio 环境标记时，不干涉本地 Vite HMR

## 用法

把本仓库 `vite.config.ts` 中的 `neutralizeViteClient()` 插件、`enableAiStudioNoAutoreloadPatch` 环境开关，以及相关条件式 `server` 配置复制到你自己的 `vite.config.ts` 中。

你现有的 dev script 可以保持不变。例如，AI Studio 常见的脚本不需要改：

```json
{
  "scripts": {
    "dev": "vite --port=3000 --host=0.0.0.0"
  }
}
```

继续用原来的方式运行：

```bash
npm run dev
```

## 启用规则

补丁会在以下条件下启用：

```text
DISABLE_HMR=true
```

或：

```text
AI_STUDIO_NO_AUTORELOAD=true
```

也可以用下面的变量显式关闭：

```text
AI_STUDIO_NO_AUTORELOAD=false
```

这适合 AI Studio 设置了 `DISABLE_HMR=true`，但你临时想绕过本补丁的情况。

## AI Studio 中的成功状态

浏览器控制台中不应再出现：

```text
[vite] connecting...
[vite] connected.
[vite] server connection lost. Polling for restart...
```

CSS 应该仍然正常显示。

## 本地开发中的成功状态

如果没有 `DISABLE_HMR=true` 或 `AI_STUDIO_NO_AUTORELOAD=true`，Vite 会正常工作：

- `/@vite/client` 不会被替换
- HMR 保持启用
- 本地热更新继续可用

## 代价

当补丁启用时，它会有意关闭 Vite 浏览器端 HMR。

AI Studio 修改文件后，请依赖 AI Studio 自己的预览刷新，或者手动刷新页面。这个配置的设计目标是“稳定使用预览页面”，不是传统本地开发中的热更新体验。

## 兼容性

这个配置基于以下类型的项目整理：

- Vite 6
- React 19
- `@vitejs/plugin-react`
- `@tailwindcss/vite`
- Google AI Studio Build

如果未来 Vite 的 `/@vite/client` 增加新的导出，可能需要在 fake client 中补充对应的 no-op 导出。

## 排查

### 本地热更新失效

检查你的本地环境是否设置了以下变量：

```text
DISABLE_HMR=true
AI_STUDIO_NO_AUTORELOAD=true
```

取消这些变量，或使用下面的变量运行：

```text
AI_STUDIO_NO_AUTORELOAD=false
```

### 报错：`/@vite/client` 不提供某个 export

把报错中缺失的 export 名称补进 `neutralizeViteClient()` 里的 fake client，通常做成空函数即可。

### CSS 丢失

确认 fake client 中保留了：

```ts
export function updateStyle(id, content) {}
export function removeStyle(id) {}
```

Vite dev 模式下，CSS import 会通过 JavaScript 注入到页面。如果这两个函数缺失或为空，样式可能不会出现。

### 页面仍然刷新

先看控制台里是否还有 Vite 日志。

如果 Vite 日志已经消失，但页面仍然刷新，来源通常不是 Vite browser client，而可能是：

- `location.reload`
- `window.location`
- service worker 更新逻辑
- AI Studio 平台层预览刷新
- 应用内部路由或状态重置

## 来源

本仓库源自一次与 ChatGPT 关于 Google AI Studio Build 预览自刷新问题的调试讨论。README 文件和初始代码由 ChatGPT 参与讨论整理，并通过 ChatGPT 辅助的 GitHub 操作提交到本仓库。
