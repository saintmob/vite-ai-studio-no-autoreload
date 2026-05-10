# Vite AI Studio 禁止额外自刷新配置

这是一个专门用于 Google AI Studio Build 项目的 `vite.config.ts` 方案。

目标不是阻止 AI Studio 在改完文件后刷新预览，而是阻止 Vite 自己因为 websocket 断线、重连、轮询等原因额外刷新页面。

## 问题

在 Google AI Studio Build 的预览控制台里，可能会看到：

```text
[vite] connecting...
[vite] connected.
[vite] server connection lost. Polling for restart...
```

这说明页面中加载了 Vite 的浏览器端客户端 `/@vite/client`。

当 dev server 连接断开并恢复时，这个客户端可能会轮询、重连，并触发页面刷新。如果你正在使用预览页面，页面状态会被破坏。

AI Studio 在 AI 修改文件后触发的刷新不属于这里要处理的问题。这个仓库只处理 Vite 自己造成的额外刷新。

## 方案

保留 `vite dev`，但把浏览器端的 `/@vite/client` 替换成一个不会 websocket、不会 polling、不会 reload 的假客户端。

这个配置会：

- 继续兼容 Google AI Studio Build 必须使用的 `vite dev`
- 禁用 Vite 浏览器端 websocket 重连、轮询和自动刷新
- 禁用 HMR
- 保留 Vite dev 模式下的 CSS 注入能力
- 保留文件监听，让 Vite dev server 在文件变化后仍可更新模块缓存

## 用法

把本仓库的 `vite.config.ts` 复制到你的 Vite React 项目中。

`package.json` 可以继续保持 AI Studio 常用的 dev script：

```json
{
  "scripts": {
    "dev": "vite --port=3000 --host=0.0.0.0"
  }
}
```

运行：

```bash
npm run dev
```

## 成功状态

浏览器控制台中不应再出现：

```text
[vite] connecting...
[vite] connected.
[vite] server connection lost. Polling for restart...
```

CSS 应该仍然正常显示。

## 代价

这个方案会有意关闭 Vite 浏览器端 HMR。

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
