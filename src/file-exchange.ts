export const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const PPTX_MAX_BYTES = 30 * 1024 * 1024;
export interface PresentationImportContext {
  signal: AbortSignal;
}
export function validatePptxFile(file: { name: string; size: number }) {
  if (!/\.pptx$/i.test(file.name))
    throw new Error("请选择 .pptx 文件；不支持旧版 .ppt、.pptm 或 JSON 文件。");
  if (!file.size) throw new Error("文件为空，请重新选择。");
  if (file.size > PPTX_MAX_BYTES)
    throw new Error("PPTX 文件超过 30 MB，请先拆分或压缩媒体资源。");
}
export function pptxFilename(title: string) {
  const name = title
    .replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g, "_")
    .replace(/[. ]+$/g, "")
    .replace(/\.pptx$/i, "")
    .trim()
    .slice(0, 120);
  return (name || "演示文稿") + ".pptx";
}
