# @smartdoca/slides

[English](README.md)

可嵌入的 React 协同演示文稿编辑器。画布使用 LeaferJS，文字使用 Slate，文档是 Yjs 结构。宿主负责身份、图片、权限和网络。

许可证为 [AGPL-3.0-only](LICENSE)。0.3.0-alpha.1 是预览版，不是完整的 PowerPoint 兼容。

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
