# @eppt/editor

React / TypeScript 在线演示文稿编辑器，使用 LeaferJS 画布、Slate 富文本、Yjs 协同。当前为 **0.3.0-alpha.1 阶段预览**，不是首版整体验收通过或 PowerPoint/PPTX 全量兼容实现。新增页面/文字能力及剩余工作见 [在线编辑执行清单](docs/ONLINE-EDITING-PLAN.md)，其他边界见 [补充交付矩阵](docs/DELIVERY-CONTRACT.md)。

本版新增多页选择/批量操作、隐藏页/分节/大纲、编号/缩进/段落间距/内边距、上下标/删除线/安全超链接。schema 2 / protocol 1 / **codecRevision 5**；宿主和全部客户端需同时升级，旧客户端明确拒绝，不清空或重建文稿/epoch。0.2.1 的性能记录为历史结果，不冒充本版压测。

## 运行

需要 Node.js 24（演示宿主使用内置 SQLite）。

```sh
yarn install
yarn dev --host 127.0.0.1
```

打开 http://127.0.0.1:5173 。两个页面打开同一 `?room=demo` 可协作；`?room=demo&readonly=1` 是只读演示。演示宿主将 Yjs 状态与图片存放在 `.demo-data/presentations-v2.sqlite`。不要将演示服务暴露到公网：它没有生产身份认证、Doca ACL 或租户隔离。

## 已实现的编辑路径

- 幻灯片新建、复制、拖拽排序、删除；16:9 / 4:3 画布；背景、备注、缩放。缩略图支持前/后落点提示、边缘滚动、Alt + 上下键排序及一步撤销，普通上下键导航。
- 文本框、25 种分类预设形状、线条、图片、画布内直接编辑的表格及 AntV G2 柱状/折线/饼/环形图；多系列、堆积/百分比、平滑线/阶梯线。
- 拖动、缩放、旋转、位置/尺寸、颜色、透明度、位置锁定、图层顺序、多选、平面组合/取消组合、页面对齐、等距分布。
- Slate 字符级富文本协同，字体/字号/粗斜体/下划线/颜色、段落对齐/项目符号、查找替换、用户本地撤销重做、应用内元素剪贴板。
- 页面放映、单击/按键翻页、基础入场动画；当前页 PNG、打印为 PDF、可编辑 PPTX 基础导出；顶部直接上传/下载 PPTX 及兼容性报告。
- 多会话元素选区、只读防护、服务端初始状态、断线重连、精确 ACK、丢失 ACK 超时重试、SQLite 提交后 ACK。

表格通过稳定行列 ID 和不可变操作合并，可独立编辑不同单元格、并发插入行列；同一单元格整段字符串确定性最后写入，并非字符级合并。图表数据仍是整块数据提交，发现远端更新时阻止旧草稿覆盖，不宣称图表单元格 CRDT。平面组合不等于 OOXML 嵌套组合。功能边界及证据见 [本轮直接编辑记录](docs/DIRECT-EDIT-INCREMENT.md) 和 [完整差距审计](docs/PARITY-AUDIT.md)。

查找入口、面板、查询状态及 Ctrl/⌘ F 快捷键统一由 Doca 宿主管理；包内不展示查找/替换界面，也不拦截查找快捷键。底层保留 `findText`、`EditorController.find/replaceMatch/replaceAll`，宿主可通过 `PresentationWorkspaceHandle.revealAnchor(match.anchor)` 定位到文本框（不是字符高亮）。替换权限由宿主校验，并同步控制器只读状态；结果需在正文变化后重新查询。直线支持三角末端箭头；导入保留已支持对象的原始层序和段内软换行/静态文本域。

图片支持非破坏矩形裁剪（拖动选区/四角、百分比、取消/应用/恢复）、水平/垂直翻转及透明度。裁剪、镜像和旋转组合在画布、缩略图和放映中一致，PPTX 原生参数可往返。文字支持顶端/中部/底端对齐，进入 Slate 编辑后保持对应布局。

工作台参考用户提供的飞书截图组织工具：默认收起格式面板，快捷工具栏跟随对象。文字颜色、字符高亮、文本框背景可直接设置；元素右键菜单含四种图层顺序命令、复制、组合和锁定。表格点击单元格输入，周围按钮插入/删除行列，手柄移动，Escape 取消草稿；不必切到右侧。拖动对象有对齐/等距参考线，Alt 暂停吸附，设计菜单可关闭。没有实现的媒体、公式不展示假入口。

图表按需加载 `@antv/g2`，通过 SVG 渲染并缓存，画布、缩略图与放映使用同一绘图结果。PPTX 仍导出原生可编辑图表及数据；不承诺与网页逐像素相同。饼/环要求非负且至少一个正值。`ChartElement.chartType` 在 schema 2 增加 `pie` / `doughnut`，不重建存量 Y.Doc；宿主需统一升级客户端和校验端，旧包不能可靠处理新类型。既有 bar/line 文档保持可读。测试服务可通过 `EPPT_TEST_ORIGIN=ws://127.0.0.1:5180` 切换端口。

`ImageElement.crop` 是可选的 `[left, top, right, bottom]` 比例数组；缺省为完整图片。作为一个原子范围同步，同时修改同一图片的裁剪范围采用最后写入值，不把两人的相反边界拼成无效范围。它是 schema 2 的加法字段，无需重建已有 Y.Doc/epoch；旧包不能呈现裁剪效果，宿主应统一升级客户端，不混用旧渲染版本。当前不支持负裁剪边距或剩余区域小于 1%、任意形状蒙版；导入此类参数会明确警告。

## npm 接入

```tsx
import { useState } from 'react'
import { PresentationWorkspace } from '@eppt/editor'
import { createPresentation, createYDocument } from '@eppt/editor/core'
import '@eppt/editor/styles.css'

export function LocalPresentation() {
  const [document] = useState(() => createYDocument(createPresentation()))
  return <div style={{ height: 720 }}><PresentationWorkspace document={document} /></div>
}
```

这是独立本地文档例子。协作文档必须创建**空的** `new Y.Doc()`，通过宿主 transport 完成服务端权威初始化后，再挂载一个稳定的编辑器。不要让每个客户端各自 `createPresentation()` 后互相合并，不要用 JSON 重建已存在的 CRDT。

工作台默认 embedded，不带平台标题/账户/保存状态/文件栏；宿主提供有高度的容器。`chrome="demo"` 显式启用独立演示外壳（标题通过 `onTitleChange` 交给宿主）。实际类型示例见 [最小宿主适配](examples/doca-host.tsx)，其中 HostSession 是示例适配形状，不宣称为 Doca 已有 API。

`panels` / `onPanelsChange` 与 `presentation` / `onPresentationChange` 支持受控本地视图；ref 导出 `getSelection`、`captureAnchor`、`revealAnchor`、`setPanels`、`setPresentation`、`commitTextEdit`、`exportCurrentPng`。后者仍为当前已挂载画布导出，不是任意页固定快照 PNG 转换器。评论通过 `renderCommentAction`、`commentMarkers`、`onCommentAnchorClick` 注入，抽屉与数据属于宿主。`CommentAnchor` 支持元素集合，`commentCandidates` 返回身份重叠候选；原生文本选区捕获尚未交付。

`SlidePreviewStore` 提供单页模型快照与内容变更失效订阅；`SlidePreview` 是 memo React 预览。两者均不写 Yjs，尚不构成生产级异步 PNG 缩略图服务。

- 根入口：工作台、裸画布、模型及协作 API，**仅限浏览器**。SSR 应将画布设为 client-only / `ssr: false`，不能在 Node 直接执行根入口（Leafer 需要 Canvas DOM）。
- `@eppt/editor/core`：无 UI 的 EMU 模型、命令、Yjs codec、查找及相对锚点。
- `@eppt/editor/collaboration`：Session、transport 类型、可选 WebSocketTransport、outbox。
- `@eppt/editor/pptx`：`exportPptx(document, resolveAsset?)`、`importPptx(bytes)`、`validatePptxFile(file)`、`pptxFilename(title)`、`PPTX_MIME`、`PPTX_MAX_BYTES`。
- `@eppt/editor/styles.css`：工作台样式。

宿主注入 `resources.uploadImage(file,{signal})` / `resources.resolveUrl(id)`，以及 `onExport`、`onImport`、保存状态、presence、readonly。宿主拥有身份、权限、资源访问、网络、业务评论和历史；npm 包不依赖 Doca 域名、cookie 或路由。`captureAnchor` / `resolveAnchor` 是锚点基础能力，不是完整评论业务 UI。

Demo 顶部“上传 PPTX”支持选文件或拖入单个 `.pptx`（最大 30 MB）、取消、错误提示与重试；“下载 PPTX”使用当前标题命名。`onImport(file, { signal })` 由宿主上传、创建新资源并切换文稿，必须检查取消及过期结果；原有单参数回调仍可接入。`onExport('pptx')` 由宿主解析图片资源、生成文件并触发浏览器下载。未提供回调时对应入口禁用；只读禁用上传，下载权限由宿主决定。用户界面不提供 JSON 文件交换。完整边界与测试见 [PPTX 文件交换](docs/PPTX-FILE-EXCHANGE.md)。

## 数据与协作契约

- 当前 schemaVersion 为 **2**；Slate 文本使用 `Y.XmlText`。schema 1 原型数据不自动覆盖或迁移，旧数据库保留。迁移必须明确建立新 epoch 并保留原始数据。
- 只上传 `LOCAL_ORIGIN`、`LocalTextOrigin` 和本地 UndoManager 的内容事务；远端、选择、presence、缩放和 readonly 切换不入 outbox。
- 协作分别校验 protocolVersion / codec / codecRevision / schemaVersion / epoch。此包要求 **codecRevision: 5**，客户端和宿主验证端必须同时升级；旧/缺失 revision 在握手阶段拒绝。根 schema 仍为 2，已有 epoch 和 Y.Doc 身份不变。表格原始 cells 基线不可改写，使用 `controller.tableCommand`；checkpoint 必须保存完整 Yjs bytes（原始基线和操作），不能用投影 JSON 替代恢复。只有匹配队首消息 ID 和 epoch 的持久 ACK 才清除更新；sync-response 不等于 ACK。
- ACK 丢失或重连时复用原始 ID 和 bytes；版本/epoch 不匹配会停止编辑并保留内存中的待确认数据。
- outbox **只在内存中**。页面关闭或浏览器崩溃后的离线恢复未实现，不宣称离线持久可靠。
- 演示宿主导入时原子持久化图片与新的协作房间，建立新 epoch；刷新新房间链接可恢复和继续协作，不覆盖原房间。原文稿仍有未确认更新时禁止切换，不清空 outbox。JSON 仅作内部接口，不是用户文件交换格式。

## 测试与打包

```sh
yarn typecheck
yarn test
# 启动演示服务后，对隔离 test-* 房间运行真实联调
EPPT_INTEGRATION=1 yarn test
yarn build
npm pack
```

包含一次真实 60 秒空闲测试，完整测试至少需要一分钟。打包包含 ESM、CommonJS、类型声明及 CSS；不会发布到 npm。当前许可证为 UNLICENSED，发布范围与许可证需要所有者决定。

## 尚未交付

母版/版式继承与主题体系、嵌套组、图片任意形状蒙版与负边距裁剪、音视频、SmartArt、复杂图表/表格、完整动画与转场时间线、评论业务面板、版本历史、持久离线 outbox、生产 Doca 登录权限接入，以及 PPTX 全量保真。目前不能作为“所有标准 PPT 功能已完成”的验收结论。PowerPoint / WPS / Keynote 实测按用户最新要求暂缓。
