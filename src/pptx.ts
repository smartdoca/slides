import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { createId } from "./model/create";
import { imageFrame, validCrop } from "./model/image";
import { isShapeKind } from "./model/shapes";
import { chartSeries } from "./model/chart";
import { safeTextLink } from "./model/text-format";
import { PPTX_MAX_BYTES, PPTX_MIME, pptxFilename } from "./file-exchange";
import { validateDocument } from "./model/validate";
import { checkPptxZip } from "./zip-limits";
export {
  PPTX_MIME,
  PPTX_MAX_BYTES,
  validatePptxFile,
  pptxFilename,
} from "./file-exchange";
import {
  EMU_PER_INCH,
  type PresentationDocument,
  type Slide,
  type SlideElement,
  type TextParagraph,
} from "./model/types";

export interface CompatibilityIssue {
  slideId?: string;
  elementId?: string;
  message: string;
}
export interface PptxImportResult {
  document: PresentationDocument;
  assets: { id: string; name: string; bytes: Uint8Array; mime: string }[];
  issues: CompatibilityIssue[];
  warnings: CompatibilityIssue[];
}
export async function exportPptx(
  document: PresentationDocument,
  resolveAsset?: (id: string) => Promise<string>,
): Promise<{
  blob: Blob;
  filename: string;
  mime: string;
  issues: CompatibilityIssue[];
  warnings: CompatibilityIssue[];
}> {
  // Capture before the first asynchronous asset read; callers may retain/mutate their model.
  document = structuredClone(document);
  validateDocument(document);
  const pptx = new PptxGenJS();
  const issues: CompatibilityIssue[] = [];
  pptx.defineLayout({
    name: "EPPT",
    width: document.size.width / EMU_PER_INCH,
    height: document.size.height / EMU_PER_INCH,
  });
  pptx.layout = "EPPT";
  pptx.title = document.title;
  pptx.subject = "EPPT presentation";
  for (const slideId of document.slideOrder) {
    const model = document.slides[slideId],
      slide = pptx.addSlide();
    slide.hidden = model.hidden ?? false;
    if (model.sectionId)
      issues.push({
        slideId,
        message: "分节组织暂未写入 PPTX；页面内容、顺序和隐藏状态保留。",
      });
    slide.background = { color: color(model.background ?? "#ffffff") };
    if (model.notes) slide.addNotes(model.notes);
    for (const id of model.elementOrder) {
      const el = model.elements[id];
      if (el.visible === false) continue;
      const t = el.transform;
      const pos = {
        x: t.x / EMU_PER_INCH,
        y: t.y / EMU_PER_INCH,
        w: t.width / EMU_PER_INCH,
        h: t.height / EMU_PER_INCH,
        rotate: t.rotation,
        objectName: el.name ?? id,
      };
      // Canvas rotates around the top-left; DrawingML rotates around the box centre.
      const radians = (t.rotation * Math.PI) / 180;
      pos.x +=
        ((Math.cos(radians) - 1) * pos.w) / 2 - (Math.sin(radians) * pos.h) / 2;
      pos.y +=
        (Math.sin(radians) * pos.w) / 2 + ((Math.cos(radians) - 1) * pos.h) / 2;
      if (el.animation)
        issues.push({
          slideId,
          elementId: id,
          message: "元素动画未写入 PPTX timing；导出保留最终静态外观。",
        });
      if (el.groupId)
        issues.push({
          slideId,
          elementId: id,
          message: "组合关系未写入 PPTX；成员保留为独立可编辑对象。",
        });
      if (el.type === "text") {
        if (
          el.paragraphs.some(
            (p) => p.list === "number" && (p.indentLevel ?? 0) > 0,
          )
        )
          issues.push({
            slideId,
            elementId: id,
            message: "多级编号导出为原生分级编号；编号前缀外观可能不同。",
          });
        const runs = el.paragraphs.flatMap((p, pi) =>
          p.children.map((run, ri) => ({
            text: run.text || " ",
            options: {
              fontFace: run.fontFamily ?? "Arial",
              fontSize: run.fontSize ?? 24,
              color: color(run.color ?? el.fill ?? "#202124"),
              highlight:
                run.backgroundColor && run.backgroundColor !== "transparent"
                  ? color(run.backgroundColor)
                  : undefined,
              bold: run.bold,
              italic: run.italic,
              underline: run.underline ? { style: "sng" as const } : undefined,
              strike: run.strike,
              superscript: run.script === "superscript",
              subscript: run.script === "subscript",
              hyperlink:
                run.link && safeTextLink(run.link)
                  ? { url: safeTextLink(run.link)! }
                  : undefined,
              align: p.align,
              indentLevel: p.indentLevel,
              lineSpacingMultiple: p.lineHeight,
              paraSpaceBefore: p.spaceBefore,
              paraSpaceAfter: p.spaceAfter,
              bullet:
                ri === 0 &&
                (p.list === "number" ||
                  p.list === "bullet" ||
                  (!p.list && p.bullet))
                  ? {
                      type:
                        p.list === "number"
                          ? ("number" as const)
                          : ("bullet" as const),
                      indent: 27,
                    }
                  : undefined,
              breakLine:
                ri === p.children.length - 1 && pi < el.paragraphs.length - 1,
            },
          })),
        );
        slide.addText(runs, {
          ...pos,
          margin: ((el.padding ?? 0) * 72) / 96,
          valign: el.verticalAlign ?? "top",
          fill: el.background ? { color: color(el.background) } : undefined,
          transparency: 100 * (1 - (el.opacity ?? 1)),
        });
      } else if (el.type === "shape") {
        slide.addShape(pptx.ShapeType[el.shape], {
          ...pos,
          fill: {
            color: color(el.fill ?? "#325af0"),
            transparency: 100 * (1 - (el.opacity ?? 1)),
          },
          line: {
            color: color(el.stroke ?? el.fill ?? "#325af0"),
            width: (el.strokeWidth ?? 0) * 0.75,
          },
        });
      } else if (el.type === "line") {
        slide.addShape(pptx.ShapeType.line, {
          ...pos,
          line: {
            color: color(el.stroke),
            width: el.strokeWidth * 0.75,
            beginArrowType: undefined,
            endArrowType: el.arrow ? "triangle" : undefined,
          },
        });
      } else if (el.type === "image") {
        if (!resolveAsset) {
          issues.push({
            slideId,
            elementId: id,
            message: "缺少资源解析器，图片未导出。",
          });
          continue;
        }
        const frame = imageFrame(pos.w, pos.h, el.crop);
        slide.addImage({
          ...pos,
          w: frame.width,
          h: frame.height,
          ...(el.crop
            ? {
                sizing: {
                  type: "crop" as const,
                  w: pos.w,
                  h: pos.h,
                  x: -frame.x,
                  y: -frame.y,
                },
              }
            : {}),
          data: await resolveAsset(el.assetId),
          altText: el.alt,
          flipH: t.flipH,
          flipV: t.flipV,
          transparency: 100 * (1 - (el.opacity ?? 1)),
        });
      } else if (el.type === "table") {
        slide.addTable(
          el.cells.map((row, i) =>
            row.map((text) => ({
              text,
              options: {
                fill: {
                  color: i === 0 ? color(el.headerFill ?? "#325af0") : "FFFFFF",
                },
                color: i === 0 ? "FFFFFF" : "24314B",
              },
            })),
          ),
          {
            ...pos,
            fontSize: 14,
            border: { color: "CDD5E4", pt: 1 },
            rowH: pos.h / el.cells.length,
            autoPage: false,
          },
        );
      } else if (el.type === "chart") {
        slide.addChart(
          pptx.ChartType[el.chartType],
          chartSeries(el).map((s) => ({
            name: s.name,
            labels: el.labels,
            values: s.values,
          })),
          {
            ...pos,
            chartColors:
              el.chartType === "pie" || el.chartType === "doughnut"
                ? [color(el.color), "FF922B", "30B79A", "8C72DF", "F4C14D"]
                : chartSeries(el).map((s) => color(s.color ?? el.color)),
            holeSize: 60,
            barDir: "col",
            barGrouping:
              el.stacking === "percent"
                ? "percentStacked"
                : el.stacking === "stacked"
                  ? "stacked"
                  : "clustered",
            lineSmooth: el.curve === "smooth",
            showLegend: el.showLegend ?? chartSeries(el).length > 1,
            showTitle: !!el.title,
            title: el.title,
            showValue: el.showLabels ?? false,
            catAxisLabelFontSize: 10,
            valAxisLabelFontSize: 10,
          },
        );
        if (el.curve === "step")
          issues.push({
            slideId,
            elementId: id,
            message: "阶梯线在 PPTX 中以原生折线导出，数据与可编辑性保留。",
          });
      }
    }
  }
  const data = await pptx.write({ outputType: "arraybuffer" });
  return {
    blob: new Blob([data as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
    issues,
    warnings: issues,
    filename: pptxFilename(document.title),
    mime: PPTX_MIME,
  };
}
const color = (s: string) =>
  /^#[a-f\d]{6}$/i.test(s)
    ? s.slice(1)
    : /^[a-f\d]{6}$/i.test(s)
      ? s
      : "202124";
const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  removeNSPrefix: false,
  transformTagName: (name: string) => name.split(":").at(-1)!,
  transformAttributeName: (name: string) =>
    name === "@_r:id" ? "@_relId" : name.replace(/^@_[^:]+:/, "@_"),
};
const parser = new XMLParser(parserOptions);
const orderedParser = new XMLParser({ ...parserOptions, preserveOrder: true });
const many = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const n = (value: unknown, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
function path(base: string, target: string): string {
  const result: string[] = target.startsWith("/")
    ? []
    : base.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "..") result.pop();
    else if (part && part !== ".") result.push(part);
  }
  return result.join("/");
}

/** Editable OOXML subset, with a best-effort (not exhaustive) loss report. */
export async function importPptx(
  bytes: ArrayBuffer | Uint8Array,
): Promise<PptxImportResult> {
  if (bytes.byteLength > PPTX_MAX_BYTES)
    throw new Error("PPTX 文件超过 30 MB，请先拆分或压缩媒体资源。");
  checkPptxZip(bytes);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error(
      "无法读取 PPTX：文件损坏、已加密，或并非有效的 PPTX 文件。",
    );
  }
  if (Object.keys(zip.files).length > 10000)
    throw new Error("PPTX 内部文件数量超过处理限制。");
  let expandedBytes = 0;
  async function xml(file: string, withOrder = false): Promise<any> {
    const content = await zip.file(file)?.async("string");
    if (!content) return {};
    expandedBytes += content.length;
    if (expandedBytes > 60 * 1024 * 1024)
      throw new Error("解压文档超出处理限制");
    return withOrder
      ? { value: parser.parse(content), order: orderedParser.parse(content) }
      : parser.parse(content);
  }
  async function rels(file: string) {
    const bits = file.split("/");
    const name = bits.pop()!;
    const data = await xml([...bits, "_rels", name + ".rels"].join("/"));
    return new Map<string, any>(
      many<any>(data.Relationships?.Relationship).map((r) => [r["@_Id"], r]),
    );
  }
  const pres = (await xml("ppt/presentation.xml")).presentation;
  if (!pres) throw new Error("不是有效的 PPTX 演示文稿");
  const document: PresentationDocument = {
    id: createId("presentation"),
    schemaVersion: 2,
    title: "导入的演示文稿",
    size: {
      width: n(pres.sldSz?.["@_cx"], 12192000),
      height: n(pres.sldSz?.["@_cy"], 6858000),
    },
    slides: {},
    slideOrder: [],
  };
  const issues: CompatibilityIssue[] = [];
  const assets: PptxImportResult["assets"] = [];
  const relation = await rels("ppt/presentation.xml");
  const theme = (await xml("ppt/theme/theme1.xml")).theme?.themeElements;
  const palette: Record<string, string> = {};
  for (const [key, value] of Object.entries<any>(theme?.clrScheme ?? {})) {
    const c = value?.srgbClr?.["@_val"] ?? value?.sysClr?.["@_lastClr"];
    if (c) palette[key] = "#" + c;
  }
  palette.tx1 = palette.dk1 ?? "#202124";
  palette.bg1 = palette.lt1 ?? "#ffffff";
  function fill(v: any, fallback = "#ffffff"): string {
    return (
      v?.srgbClr
        ? "#" + v.srgbClr["@_val"]
        : (palette[v?.schemeClr?.["@_val"]] ?? fallback)
    ).toLowerCase();
  }
  for (const item of many<any>(pres.sldIdLst?.sldId)) {
    const rid = item["@_relId"];
    const target = relation.get(rid)?.["@_Target"];
    if (!target) {
      issues.push({ message: "无法解析幻灯片关系：" + rid });
      continue;
    }
    const file = path("ppt/presentation.xml", target);
    const sourceXml = await xml(file, true);
    const source = sourceXml.value?.sld;
    const slide: Slide = {
      id: createId("slide"),
      ...(source?.["@_show"] === "0" || source?.["@_show"] === "false"
        ? { hidden: true }
        : {}),
      background: fill(source?.cSld?.bg?.bgPr?.solidFill),
      elements: {},
      elementOrder: [],
    };
    document.slides[slide.id] = slide;
    document.slideOrder.push(slide.id);
    const relations = await rels(file);
    const tree = source?.cSld?.spTree ?? {};
    // PresentationML paints spTree children in document order, not by type.
    const orderedTree =
      sourceXml.order
        ?.find((v: any) => v.sld)
        ?.sld.find((v: any) => v.cSld)
        ?.cSld.find((v: any) => v.spTree)?.spTree ?? [];
    const counts: Record<string, number> = {};
    const sourceRanks = new Map<any, number>();
    orderedTree.forEach((child: any, index: number) => {
      const kind = Object.keys(child).find((key) => key !== ":@");
      if (!kind) return;
      const occurrence = counts[kind] ?? 0;
      counts[kind] = occurrence + 1;
      sourceRanks.set(many<any>(tree[kind])[occurrence], index);
    });
    const ranks = new Map<string, number>();
    const add = (el: SlideElement, sourceObject: any) => {
      slide.elements[el.id] = el;
      slide.elementOrder.push(el.id);
      ranks.set(
        el.id,
        sourceRanks.get(sourceObject) ?? Number.MAX_SAFE_INTEGER,
      );
    };
    const warn = (message: string) =>
      issues.push({ slideId: slide.id, message });
    const importedLink = (run: any): string | undefined => {
      const rid = run?.hlinkClick?.["@_relId"];
      if (!rid) return undefined;
      const target = relations.get(rid)?.["@_Target"];
      const url = typeof target === "string" ? safeTextLink(target) : null;
      if (!url) warn("不安全或站内跳转超链接未导入，保留文字。");
      return url ?? undefined;
    };
    if (source?.timing) warn("动画 timing 暂未导入。");
    if (source?.transition) warn("转场暂未导入。");
    const transform = (x: any, mirroredImage = false) => {
      const t = {
        x: n(x?.off?.["@_x"]),
        y: n(x?.off?.["@_y"]),
        width: Math.max(1, n(x?.ext?.["@_cx"], 2743200)),
        height: Math.max(1, n(x?.ext?.["@_cy"], 914400)),
        rotation: n(x?.["@_rot"]) / 60000,
        ...(["1", "true"].includes(x?.["@_flipH"]) ? { flipH: true } : {}),
        ...(["1", "true"].includes(x?.["@_flipV"]) ? { flipV: true } : {}),
      };
      const radians = (t.rotation * Math.PI) / 180;
      t.x = Math.round(
        t.x -
          ((Math.cos(radians) - 1) * t.width) / 2 +
          (Math.sin(radians) * t.height) / 2,
      );
      t.y = Math.round(
        t.y -
          (Math.sin(radians) * t.width) / 2 -
          ((Math.cos(radians) - 1) * t.height) / 2,
      );
      if (!mirroredImage && (t.flipH || t.flipV))
        warn("镜像变换已读取，但网页画布尚未应用镜像显示。");
      return t;
    };
    const lineStyle = (spPr: any) => {
      const end = spPr?.ln?.tailEnd?.["@_type"];
      if (end && end !== "none" && end !== "triangle")
        warn("线条末端样式 " + end + " 暂未还原。");
      if (spPr?.ln?.headEnd?.["@_type"] && spPr.ln.headEnd["@_type"] !== "none")
        warn("线条起点箭头暂未还原。");
      return {
        stroke: fill(spPr?.ln?.solidFill, "#202124"),
        strokeWidth: n(spPr?.ln?.["@_w"], 19050) / 9525,
        ...(end === "triangle" ? { arrow: true } : {}),
      };
    };
    for (const shape of many<any>(tree.sp)) {
      const base = {
        id: createId("element"),
        name: shape.nvSpPr?.cNvPr?.["@_name"],
        transform: transform(shape.spPr?.xfrm),
      };
      if (!shape.spPr?.xfrm)
        warn("占位符缺少直接坐标：尚未解析母版/版式继承，使用默认位置。");
      if (
        shape.spPr?.gradFill ||
        shape.spPr?.pattFill ||
        shape.spPr?.effectLst ||
        shape.spPr?.effectDag
      )
        warn("形状渐变、纹理或效果暂未还原。");
      if (shape.spPr?.prstGeom?.["@_prst"] === "line") {
        add({ ...base, type: "line", ...lineStyle(shape.spPr) }, shape);
      } else if (shape.txBody) {
        if (shape.spPr?.ln) warn("文本框轮廓暂未保留。");
        const orderedParagraphs =
          orderedTree[sourceRanks.get(shape)!]?.sp
            ?.find((v: any) => v.txBody)
            ?.txBody.filter((v: any) => v.p) ?? [];
        const paragraphs: TextParagraph[] = many<any>(shape.txBody.p).map(
          (p, pi) => ({
            type: "paragraph",
            align: (
              { l: "left", ctr: "center", r: "right", just: "justify" } as const
            )[p.pPr?.["@_algn"] as "l"],
            ...(p.pPr?.buChar ? { bullet: true } : {}),
            ...(p.pPr?.buAutoNum ? { list: "number" as const } : {}),
            ...(p.pPr?.["@_lvl"] !== undefined
              ? { indentLevel: Math.max(0, Math.min(8, n(p.pPr["@_lvl"]))) }
              : {}),
            ...(p.pPr?.lnSpc?.spcPct
              ? {
                  lineHeight: Math.max(
                    0.5,
                    Math.min(
                      5,
                      n(p.pPr.lnSpc.spcPct["@_val"], 120000) / 100000,
                    ),
                  ),
                }
              : {}),
            ...(p.pPr?.spcBef?.spcPts
              ? {
                  spaceBefore: Math.max(
                    0,
                    Math.min(240, n(p.pPr.spcBef.spcPts["@_val"]) / 100),
                  ),
                }
              : {}),
            ...(p.pPr?.spcAft?.spcPts
              ? {
                  spaceAfter: Math.max(
                    0,
                    Math.min(240, n(p.pPr.spcAft.spcPts["@_val"]) / 100),
                  ),
                }
              : {}),
            children: (() => {
              const occurrence: Record<string, number> = {};
              const runs = (orderedParagraphs[pi]?.p ?? []).flatMap(
                (node: any) => {
                  const kind = Object.keys(node).find((key) =>
                    ["r", "fld", "br"].includes(key),
                  );
                  if (!kind) return [];
                  const index = occurrence[kind] ?? 0;
                  occurrence[kind] = index + 1;
                  const sourceRun = many<any>(p[kind])[index];
                  if (kind === "fld")
                    warn("动态文本域按当前显示文本导入，不再自动更新。");
                  return [
                    {
                      t: kind === "br" ? "\n" : String(sourceRun?.t ?? ""),
                      rPr: { ...p.pPr?.defRPr, ...sourceRun?.rPr },
                    },
                  ];
                },
              );
              return runs.length
                ? runs.map((run: any) => ({
                    text: run.t,
                    fontSize:
                      n(run.rPr?.["@_sz"], n(p.pPr?.defRPr?.["@_sz"], 2400)) /
                      100,
                    ...(run.rPr?.["@_b"] === "1" ? { bold: true } : {}),
                    ...(run.rPr?.["@_i"] === "1" ? { italic: true } : {}),
                    ...(run.rPr?.["@_strike"] &&
                    run.rPr["@_strike"] !== "noStrike"
                      ? { strike: true }
                      : {}),
                    ...(n(run.rPr?.["@_baseline"]) !== 0
                      ? {
                          script:
                            n(run.rPr["@_baseline"]) > 0
                              ? ("superscript" as const)
                              : ("subscript" as const),
                        }
                      : {}),
                    ...(run.rPr?.hlinkClick
                      ? { link: importedLink(run.rPr) }
                      : {}),
                    ...(run.rPr?.["@_u"] && run.rPr["@_u"] !== "none"
                      ? { underline: true }
                      : {}),
                    color: fill(run.rPr?.solidFill, "#202124"),
                    ...(run.rPr?.highlight
                      ? { backgroundColor: fill(run.rPr.highlight, "#ffff00") }
                      : {}),
                    fontFamily: run.rPr?.latin?.["@_typeface"] ?? "Arial",
                  }))
                : [{ text: "", fontSize: 24 }];
            })(),
          }),
        );
        add(
          {
            ...base,
            type: "text",
            ...(shape.txBody.bodyPr?.["@_lIns"] !== undefined
              ? {
                  padding: Math.max(
                    0,
                    Math.min(200, n(shape.txBody.bodyPr["@_lIns"]) / 9525),
                  ),
                }
              : {}),
            ...(shape.spPr?.solidFill
              ? { background: fill(shape.spPr.solidFill, "#ffffff") }
              : {}),
            verticalAlign:
              ({ ctr: "middle", b: "bottom" } as const)[
                shape.txBody.bodyPr?.["@_anchor"] as "ctr"
              ] ?? "top",
            paragraphs: paragraphs.length
              ? paragraphs
              : [{ type: "paragraph", children: [{ text: "" }] }],
          },
          shape,
        );
      } else {
        const kind = shape.spPr?.prstGeom?.["@_prst"] ?? "rect";
        if (!isShapeKind(kind)) warn("形状 " + kind + " 暂以矩形显示。");
        add(
          {
            ...base,
            type: "shape",
            shape: isShapeKind(kind) ? kind : "rect",
            fill: fill(shape.spPr?.solidFill, "#325af0"),
            stroke: fill(shape.spPr?.ln?.solidFill, "#325af0"),
            strokeWidth: n(shape.spPr?.ln?.["@_w"]) / 9525,
          },
          shape,
        );
      }
    }
    for (const pic of many<any>(tree.pic)) {
      const rel = relations.get(pic.blipFill?.blip?.["@_embed"]);
      if (!rel || rel["@_TargetMode"] === "External") {
        warn("外链图片未下载，请通过宿主资源服务重新关联。");
        continue;
      }
      const assetPath = path(file, rel["@_Target"]);
      const binary = await zip.file(assetPath)?.async("uint8array");
      if (!binary) {
        warn("图片资源缺失");
        continue;
      }
      expandedBytes += binary.length;
      if (expandedBytes > 60 * 1024 * 1024)
        throw new Error("媒体资源超过处理限制");
      const extension = assetPath.split(".").pop()!.toLowerCase();
      const mime = (
        {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          svg: "image/svg+xml",
        } as Record<string, string>
      )[extension];
      if (!mime) {
        warn("图片格式 " + extension + " 暂不支持");
        continue;
      }
      const id = createId("asset");
      assets.push({
        id,
        name: assetPath.split("/").pop()!,
        bytes: binary,
        mime,
      });
      const rect = pic.blipFill?.srcRect;
      const crop = rect
        ? ["l", "t", "r", "b"].map((k) => {
            const value = rect["@_" + k];
            return typeof value === "string" && value.endsWith("%")
              ? Number(value.slice(0, -1)) / 100
              : n(value) / 100000;
          })
        : undefined;
      if (crop && !validCrop(crop))
        warn(
          "图片裁剪范围不支持（负边距或剩余区域小于 1%），保留原图并忽略裁剪。",
        );
      add(
        {
          id: createId("image"),
          type: "image",
          name: pic.nvPicPr?.cNvPr?.["@_name"],
          assetId: id,
          transform: transform(pic.spPr?.xfrm, true),
          ...(validCrop(crop) ? { crop } : {}),
          opacity:
            n(pic.blipFill?.blip?.alphaModFix?.["@_amt"], 100000) / 100000,
          alt: pic.nvPicPr?.cNvPr?.["@_descr"],
        },
        pic,
      );
    }
    for (const line of many<any>(tree.cxnSp))
      add(
        {
          id: createId("line"),
          type: "line",
          name: line.nvCxnSpPr?.cNvPr?.["@_name"],
          transform: transform(line.spPr?.xfrm),
          ...lineStyle(line.spPr),
        },
        line,
      );
    for (const frame of many<any>(tree.graphicFrame)) {
      const table = frame.graphic?.graphicData?.tbl;
      if (table)
        add(
          {
            id: createId("table"),
            type: "table",
            name: frame.nvGraphicFramePr?.cNvPr?.["@_name"],
            transform: transform(frame.xfrm),
            cells: many<any>(table.tr).map((row) =>
              many<any>(row.tc).map((cell) =>
                many<any>(cell.txBody?.p)
                  .map((p) =>
                    many<any>(p.r)
                      .map((r) => r.t ?? "")
                      .join(""),
                  )
                  .join("\n"),
              ),
            ),
            headerFill: "#325af0",
          },
          frame,
        );
      else if (frame.graphic?.graphicData?.chart) {
        const chartRel = relations.get(
          frame.graphic.graphicData.chart["@_relId"],
        );
        const chartFile = chartRel && path(file, chartRel["@_Target"]);
        const chartModel = chartFile
          ? (await xml(chartFile)).chartSpace?.chart
          : undefined;
        const plot = chartModel?.plotArea;
        const source =
          plot?.barChart ??
          plot?.lineChart ??
          plot?.pieChart ??
          plot?.doughnutChart;
        const series = many<any>(source?.ser);
        if (!series.length) {
          warn("该图表类型暂未导入。");
          continue;
        }
        const first = series[0],
          labelPoints = many<any>(
            first.cat?.strRef?.strCache?.pt ??
              first.cat?.strLit?.pt ??
              many<any>(first.cat?.multiLvlStrRef?.multiLvlStrCache?.lvl)[0]
                ?.pt ??
              first.cat?.numRef?.numCache?.pt,
          );
        const labels = labelPoints.map((p) => String(p.v ?? "")),
          values = many<any>(
            first.val?.numRef?.numCache?.pt ?? first.val?.numLit?.pt,
          ).map((p) => n(p.v));
        if (!values.length || labels.length !== values.length) {
          warn("图表数据缓存不可用");
          continue;
        }
        const allSeries = series.map((s, i) => ({
          name: String(
            many<any>(s.tx?.strRef?.strCache?.pt)[0]?.v ??
              s.tx?.v ??
              `系列 ${i + 1}`,
          ),
          values: many<any>(
            s.val?.numRef?.numCache?.pt ?? s.val?.numLit?.pt,
          ).map((p) => n(p.v)),
          color: fill(
            s.spPr?.solidFill,
            ["#527eff", "#ff8a24", "#30b79a", "#8c72df"][i % 4],
          ),
        }));
        if (allSeries.some((s) => s.values.length !== labels.length)) {
          warn("多系列数据长度不一致，图表未导入。");
          continue;
        }
        const title = many<any>(chartModel?.title?.tx?.rich?.p)
          .flatMap((p) => many<any>(p.r).map((r) => String(r.t ?? "")))
          .join("");
        add(
          {
            id: createId("chart"),
            type: "chart",
            name: frame.nvGraphicFramePr?.cNvPr?.["@_name"],
            transform: transform(frame.xfrm),
            chartType: plot.barChart
              ? "bar"
              : plot.lineChart
                ? "line"
                : plot.pieChart
                  ? "pie"
                  : "doughnut",
            labels,
            values,
            color: fill(first.spPr?.solidFill, "#325af0"),
            series: allSeries,
            stacking:
              source.grouping?.["@_val"] === "percentStacked"
                ? "percent"
                : source.grouping?.["@_val"] === "stacked"
                  ? "stacked"
                  : "none",
            curve:
              source.smooth?.["@_val"] === "1" ||
              first.smooth?.["@_val"] === "1"
                ? "smooth"
                : "linear",
            showLegend: !!chartModel?.legend,
            showLabels: source.dLbls?.showVal?.["@_val"] === "1",
            ...(title ? { title } : {}),
          },
          frame,
        );
      } else warn("嵌入对象暂未导入。");
    }
    if (tree.grpSp) warn("组合对象暂未展开。");
    slide.elementOrder.sort((a, b) => ranks.get(a)! - ranks.get(b)!);
    for (const rel of relations.values())
      if (String(rel["@_Type"]).endsWith("/notesSlide")) {
        const notes = (await xml(path(file, rel["@_Target"]))).notes;
        slide.notes = many<any>(notes?.cSld?.spTree?.sp)
          .filter((s) => s.nvSpPr?.nvPr?.ph?.["@_type"] === "body")
          .flatMap((s) =>
            many<any>(s.txBody?.p).map((p) =>
              many<any>(p.r)
                .map((r) => r.t ?? "")
                .join(""),
            ),
          )
          .join("\n");
      }
  }
  if (!document.slideOrder.length) throw new Error("文档中没有可读取的幻灯片");
  issues.push({
    message:
      "当前导入器支持基础 OOXML 子集；主题继承、复杂效果、特殊图表、嵌套组合仍需兼容性扩展。",
  });
  validateDocument(document);
  return { document, assets, issues, warnings: issues };
}
