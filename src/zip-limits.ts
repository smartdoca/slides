/** Read the standard ZIP central directory before allocating decompressed entries. ZIP64 is deliberately unsupported. */
export function checkPptxZip(bytes: ArrayBuffer | Uint8Array) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--)
    if (
      v.getUint32(i, true) === 0x06054b50 &&
      i + 22 + v.getUint16(i + 20, true) === b.length
    ) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("文件损坏：缺少有效 ZIP 目录");
  const count = v.getUint16(end + 10, true),
    size = v.getUint32(end + 12, true);
  let offset = v.getUint32(end + 16, true),
    total = 0;
  if (
    v.getUint16(end + 4, true) ||
    v.getUint16(end + 6, true) ||
    count === 65535 ||
    offset === 0xffffffff ||
    size === 0xffffffff
  )
    throw new Error("不支持分卷或 ZIP64 PPTX");
  if (count > 10000 || offset + size > end)
    throw new Error("PPTX ZIP 目录超过限制或已损坏");
  const limit = offset + size;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > limit || v.getUint32(offset, true) !== 0x02014b50)
      throw new Error("文件损坏：无效 ZIP 条目");
    if (v.getUint16(offset + 8, true) & 1) throw new Error("不支持加密的 PPTX");
    const expanded = v.getUint32(offset + 24, true);
    total += expanded;
    if (expanded === 0xffffffff || total > 60 * 1024 * 1024)
      throw new Error("PPTX 声明解压体积超过 60 MB");
    offset +=
      46 +
      v.getUint16(offset + 28, true) +
      v.getUint16(offset + 30, true) +
      v.getUint16(offset + 32, true);
  }
  if (offset !== limit) throw new Error("文件损坏：ZIP 目录长度不符");
}
