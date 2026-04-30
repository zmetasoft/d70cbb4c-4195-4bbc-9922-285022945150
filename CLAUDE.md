# Zmetaboard AI Board - Sidecar Authoring Context

本文件为外部 AI 工具（Cursor / Codex / Claude Code 等）提供 AI 看板的编辑上下文。
请直接修改当前目录下的源码文件，修改后在 Zmetaboard 产品中预览效果。

## 目录结构

当前目录是一个 AI 看板文档。React renderer、数据配置与资源都位于当前文档根目录。

```text
{visdocId}/
├── datasets.json          # 数据集定义列表
├── datasources.json       # 数据源定义列表
├── file-data/             # 文件数据源的数据文件（.json + .csv）
├── assets/                # 文档资源
├── widgets.json           # Widget manifest
├── board.tsx              # React renderer 入口
├── board.css              # 补充样式
└── components/            # 自定义组件
```

### 允许编辑的路径

- `board.tsx`
- `components/`
- `board.css`
- `assets/`
- `widgets.json`

## 运行时与编译

**AI 看板由 Zmetaboard 宿主编译和挂载**：`board.tsx` 会通过宿主服务端 esbuild 编译为浏览器可加载的 ESM module，预览页直接渲染该 module。

这意味着：
- 当前目录不是完整 React 应用，不需要也不允许自行创建 `index.html`、`main.tsx` 或 `createRoot` 挂载入口。
- 不要运行本地打包器或开发服务器；编译、挂载、React singleton、dataset 和 widget runtime 都由 Zmetaboard 提供。
- 不能使用 `require()`，不能依赖 Node.js API（`fs`、`path` 等）。
- `react`、`react/jsx-runtime`、`react-dom/client` 与 `@zmeta/ai-board-sdk` 由宿主映射；直接 `import { useState } from "react"` 即可。
- 默认不要引入第三方 npm 包；服务端编译不解析普通裸包名，除宿主映射模块外的裸 import 会失败。

## 编辑规则

- 直接修改允许编辑的文件来满足用户要求。
- 优先做最小且有针对性的修改，避免不必要的大改。
- 默认面向中文读者，可见文案优先使用简体中文。
- 除非用户明确要求移动端、竖屏或自适应网页，默认生成单屏 16:9 的 1920x1080 看板。
- 默认把首屏视为完整画布，不要产出依赖长滚动的文章式页面。
- 默认导出 Board 组件，在 `board.tsx` 中完成主体修改。
- 入口挂载逻辑由系统提供，不要自行调用 createRoot，也不要改动挂载协议。
- 不要创建 `index.html` 或 `main.tsx`；AI Board document 只提供被宿主加载的 React 子集。
- 如需拆分组件，只在 `components/` 下新增或修改文件，文件名使用小写 kebab-case。
- 上层环境提供 `@zmeta/ai-board-sdk`，可导入 `useDataset`、`useDatasets`、`assetUrl`、`WidgetHost`。
- 优先使用静态 className 字面量；避免通过字符串拼接、模板字符串插值或运行时映射生成 Tailwind 类名。
- `board.css` 只用于少量普通 CSS、字体或补充样式；不要在其中写 @tailwind、@config 或依赖 Tailwind 配置文件。
- 不要创建、修改或依赖 package.json、node_modules、vite.config.*、tailwind.config.*、postcss.config.*、tsconfig.json 等工具链文件。
- 不要启动本地开发服务器。预览由 Zmetaboard 平台提供，修改文件后在产品中刷新即可看到效果。

## 数据

Widget 绑定数据集后，平台会在预览时自动通过 API 加载数据并注入 widget，不需要在代码中嵌入数据。

读取 `datasets.json` 查看当前看板有哪些数据集。每个 dataset 主要字段：
- `id` — 数据集唯一标识，绑定 widget 时使用
- `name` — 数据集名称
- `fields[]` — 字段列表，每项有 `name`（字段名）和 `type`（`string` / `number` 等）

数据文件只允许读取，不允许创建、删除或修改。如需变更数据，请在 Zmetaboard 产品中操作。

## Widget 协议

所有图表类需求优先使用 custom-chart widget，而不是固定图表 widget、手写 SVG、Canvas 或复杂 DOM 图形。

### 使用方式

1. 在 JSX 中渲染宿主节点：优先使用 `import { WidgetHost } from "@zmeta/ai-board-sdk"` 后写 `<WidgetHost id="你的组件id" className="min-h-[320px]" />`；也可直接写 `<div data-zmeta-widget-id="你的组件id" className="min-h-[320px]" />`。
2. 在 `widgets.json` 中新增同 id 的 widget 定义，图表 widget 的 `type` 固定写 `custom-chart`。
3. widget 宿主节点需要有明确高度。
4. 不要自行实现 widget runtime，也不要改动平台提供的 widget 加载协议。

### Widget Manifest 格式 (`widgets.json`)

```json
{
  "version": 1,
  "widgets": [
    {
      "id": "my-chart",
      "type": "custom-chart",
      "config": {
        "renderer": "function",
        "optionFunction": "const option = { series: [] };"
      }
    }
  ]
}
```

