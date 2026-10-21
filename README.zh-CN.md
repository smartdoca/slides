# @smartdoca/slides

[English](README.md)

可嵌入的 React 协同演示文稿编辑器。画布使用 LeaferJS，文字使用 Slate，文档是 Yjs 结构。宿主负责身份、图片、权限和网络。

许可证为 [MIT](LICENSE)。0.3.0-alpha.4 是预览版，不是完整的 PowerPoint 兼容。

## 安装

```sh
npm install @smartdoca/slides react react-dom
```

```tsx
import { PresentationWorkspace, createYDocument } from "@smartdoca/slides";
import "@smartdoca/slides/styles.css";

const document = createYDocument();

export function Slides() {
  return <PresentationWorkspace document={document} chrome="embedded" />;
}
```

文档会话只创建一次 `Y.Doc`。只读、选区和面板变化必须复用它。

## Props

`PresentationWorkspace` 接收 `PresentationWorkspaceProps`。`document` 必填。

| Prop | 类型 | 作用 |
|---|---|---|
| `document` | `Y.Doc` | 用 `createYDocument` 创建的文稿。 |
| `readOnly` | `boolean` | 停止编辑。 |
| `chrome` | `"embedded" \| "demo"` | 嵌入模式没有演示用业务外壳。默认嵌入。 |
| `resources` | `PresentationResources` | `uploadImage` 保存文件，`resolveUrl` 返回显示地址。 |
| `onImagePreview` | `PresentationImagePreviewHandler` | 用所有幻灯片的稳定图片引用打开宿主图库。 |
| `members` | `PresentationPresence[]` | 宿主提供的远端在线状态。 |
| `sessionId` | `string` | 当前标签的会话。 |
| `onPresence` | `(slideId, ids) => void` | 本地页面和元素选区。它不是内容写入。 |
| `commentMarkers` | `CommentMarker[]` | 宿主拥有的评论。 |
| `onCommentAnchorClick` | function | 点击位置上重叠的标记。 |
| `renderCommentAction` | function | 单个评论锚点的宿主操作。 |
| `onSelectionChange` | function | 本地编辑器选区。 |
| `panels` | 幻灯片、属性、备注 | 哪些侧栏打开。 |
| `presentation` | `boolean` | 放映模式。 |
| `locale` | `string` | 默认中文。未知代码使用英文。 |
| `messages` | `Record<string, string>` | 替换单个文案键。不改变文档内容。 |
| `onExport` | function | 宿主导出 `pptx`、`json` 或 `pdf`。 |
| `onImport` | function | 宿主导入一个文件。 |
| `onReconnect` | `() => void` | 宿主重连。 |
| `status`、`saveLabel` | `string` | 宿主的保存文案。 |

`onReady` 在画布组件 `PresentationEditor` 上。`PresentationWorkspace` 通过 ref 给出 `PresentationWorkspaceHandle`：`getSelection`、`captureAnchor`、`revealAnchor` 和 `commitTextEdit`。

## 协同

`@smartdoca/slides/core` 读取并校验文档。`@smartdoca/slides/collaboration` 定义会话、连接状态和更新队列的类型。

- 只有本地内容事务可以写入。在线状态、选区和面板变化不进入发送队列。
- `readOnly` 不发布编辑。
- `members` 和 `onPresence` 是临时状态。`captureAnchor` 创建由宿主保存的评论锚点。
- 导出快照前调用 `commitTextEdit`，把尚未结束的文字编辑包含进去。
- `@smartdoca/slides/pptx` 提供 `importPptx`、`exportPptx` 和 `validatePptxFile`。

## 样式操作

选中对象后显示紧凑浮动格式栏，按实测飞书幻灯片的顺序提供文字预设、字体搜索、每次一磅的字号步进、对齐、列表、加粗、链接、字体颜色/高亮、格式刷和右侧格式面板。格式刷单击应用一次、双击连续应用、Esc 退出；`⌘/Ctrl Shift C/V` 复制/粘贴格式。文字选区和多选对象通过原生编辑事务修改，每次操作可一步撤销；跳过锁定对象，只读入口不写文档。

右侧面板包括位置大小、字体、段落对齐与列表、行距、独立四边文字边距和字间距。提供五种文字预设、六种形状预设；圆形色板包含文稿使用色、基础色和自定义十六进制输入。AI 编辑、云字体上传、公式转换和高级效果尚未实现。详细行为与验证记录见 [样式操作](docs/STYLING.md)。

## 表格操作

支持矩形/整行/整列选择、合并拆分、矩阵粘贴、Tab 导航与末格自动增行、行列尺寸拖动、整格文字和背景样式、右键菜单及一步撤销。原生 PPTX 保留合并、样式和尺寸。单元格仍为纯文本，尚无字符范围富文本或同格字符级协作。新表格操作使用 `codecRevision: 6`，宿主客户端与服务端须同步升级；生产宿主需单独适配。详见 [表格行为与验证](docs/TABLES.md)。

## 图片预览

编辑时单击选中图片，再次点击或使用预览按钮放大；只读时可单击预览。默认弹层支持前后按钮、方向键、左右拖动/滑动和触控板切换所有幻灯片内的图片。传入 `onImagePreview` 后由宿主以稳定资源引用打开自己的授权预览。详见 [API 与资源边界](docs/IMAGE-PREVIEW.md)及 [0.3.0-alpha.4 发布说明](docs/releases/0.3.0-alpha.4.md)。
