import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fetchMetadataResource } from "./transport";

/**
 * 图标本地化。
 *
 * 为什么必须存本地，不能只存远程 URL：
 *  - 对方换 favicon 或站点挂掉，列表里就是一排灰方块，而且**永远不会自愈**；
 *  - 每次打开首页，浏览器要向几十个第三方域名发请求，慢，而且等于
 *    把「你收藏了什么」逐个泄露给那些站点；
 *  - 第三方图标服务（favicon.im 之类）本来就不保证长期可用。
 *
 * 存本地之后这三个问题一次解决。文件名用 URL 的 hash，同一张图不会重复写。
 */

/**
 * 图标落盘目录。
 *
 * 曾经放在 `public/icons`，踩了个大坑：Next.js standalone 在**启动那一刻**
 * 对 public/ 做一次目录快照，之后新写进去的文件静态服务根本看不见，
 * 一律 404，而且不会自愈 —— 每存一个新图标就得重启一次容器。
 *
 * 现在改放到数据目录（compose 里 `./data:/app/data` 已经挂载），
 * 由 `app/icons/[name]/route.ts` 动态读盘返回。新图标立刻可访问。
 */
export const ICON_DIR =
  process.env.ICON_DIR ?? path.join(process.cwd(), "data", "icons");

/**
 * 对外访问前缀。
 *
 * 保持 `/icons` 不变：库里已经存了一批 `/icons/xxx.png`，
 * 改前缀等于让历史数据全部变成死链。
 */
export const ICON_URL_PREFIX = "/icons";

/** 允许的图标扩展名。路由层拿它挡路径穿越。 */
export const ICON_EXTS = ["png", "ico", "svg", "jpeg", "gif", "webp"] as const;

/** 文件名格式：16 位 hex + 白名单扩展名。路由用它做校验。 */
export const ICON_NAME_RE = /^[a-f0-9]{16}\.(png|ico|svg|jpeg|gif|webp)$/;

/** 抓取上限，和 lib/metadata/fetch.ts 的口径一致 */
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 6000;
/** 统一压到这个尺寸，够 2x 屏用，又不至于让每条书签挂一张大图 */
const TARGET_PX = 64;


/** 已经是本地路径（/icons/xxx）就不用再处理 */
export function isLocalIcon(url: string | null | undefined): boolean {
  return Boolean(url && url.startsWith(`${ICON_URL_PREFIX}/`));
}

function hashFor(remoteUrl: string): string {
  return crypto.createHash("sha1").update(remoteUrl).digest("hex").slice(0, 16);
}

/**
 * 按文件头判断真实格式。
 *
 * 不能信 content-type —— 有的站点给 .ico 却报 image/png，
 * 也有的干脆报 application/octet-stream。
 */
function sniff(buf: Buffer): "png" | "ico" | "svg" | "jpeg" | "gif" | "webp" | null {
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47) return "png";
  if (buf.length >= 3 && buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1) return "ico";
  if (buf.length >= 3 && buf.readUInt16BE(0) === 0xffd8) return "jpeg";
  if (buf.length >= 6 && buf.subarray(0, 3).toString("latin1") === "GIF") return "gif";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF") {
    if (buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  }
  /* SVG 是文本，前面可能有 XML 声明或 BOM，扫开头一小段找 <svg */
  const head = buf.subarray(0, Math.min(buf.length, 512)).toString("utf8").toLowerCase();
  if (head.includes("<svg")) return "svg";
  return null;
}

/**
 * 把远程图标抓下来存成本地文件，返回 `/icons/xxx.png`。
 *
 * 失败返回 null —— 调用方保留原远程地址作为兜底。
 * 图标存不下来不该让「保存书签」失败，那本末倒置。
 */
export async function localizeIcon(
  remoteUrl: string | null | undefined,
): Promise<string | null> {
  if (!remoteUrl) return null;
  if (isLocalIcon(remoteUrl)) return remoteUrl;

  /* E2E / 离线模式：不联网，也不写文件 */
  if (process.env.METADATA_DISABLED === "1") return null;

  let parsed: URL;
  try {
    parsed = new URL(remoteUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const hash = hashFor(remoteUrl);
  const pngName = `${hash}.png`;
  const dest = path.join(ICON_DIR, pngName);

  /* 同一张图抓过一次就复用，重跑批量补全不会重复下载 */
  try {
    await fs.access(dest);
    return `${ICON_URL_PREFIX}/${pngName}`;
  } catch {
    /* 不存在，继续下载 */
  }

  /* 之前以原格式存过（比如 .ico），也算命中 */
  for (const ext of ["ico", "svg", "jpeg", "gif", "webp"] as const) {
    try {
      await fs.access(path.join(ICON_DIR, `${hash}.${ext}`));
      return `${ICON_URL_PREFIX}/${hash}.${ext}`;
    } catch {
      /* 试下一个 */
    }
  }

  try {
    const { response } = await fetchMetadataResource(parsed.href, {
      timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES, accept: "image/*",
    });
    if (response.status !== 200 || !response.bytes) return null;
    const buf = response.bytes;
    if (buf.length === 0 || buf.length > MAX_BYTES) return null;

    const kind = sniff(buf);
    if (!kind) return null;

    /*
     * 统一转 PNG 再落盘。
     *
     * 直接存原图有几个坑：ico 浏览器支持不一致、svg 可能带外部引用、
     * 有的站点给的是几百 KB 的大图。转一次 PNG 把这些差异一次抹平，
     * 体积也稳定在几 KB。
     *
     * 但 sharp 不认 ICO（.ico 里装的是 BMP 位图，不是 PNG），
     * 硬转会直接抛「unsupported image format」。这种情况按原格式存 ——
     * 浏览器对 .ico 的支持其实很好，没必要为了统一格式把图标丢掉。
     */
    await fs.mkdir(ICON_DIR, { recursive: true });

    let outName = pngName;
    let outBuf: Buffer;
    try {
      const sharp = (await import("sharp")).default;
      outBuf = await sharp(buf, { animated: false })
        .resize(TARGET_PX, TARGET_PX, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          withoutEnlargement: true,
        })
        .png({ compressionLevel: 9 })
        .toBuffer();
    } catch {
      /* sharp 解不了就原样存，扩展名跟着真实格式走 */
      outName = `${hash}.${kind}`;
      outBuf = buf;
    }

    const outDest = path.join(ICON_DIR, outName);
    /*
     * 先写临时文件再 rename：并发抓同一张图时不会读到写了一半的文件。
     * rename 在同一文件系统上是原子的。
     */
    const tmp = `${outDest}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, outBuf);
    await fs.rename(tmp, outDest);

    return `${ICON_URL_PREFIX}/${outName}`;
  } catch {
    return null;
  }
}

/**
 * 存下来的图标可能越攒越多（换过的站点会留下孤儿文件）。
 * 这里只做统计，不主动删 —— 删错的代价比留着的代价大。
 */
export async function iconStats(): Promise<{ count: number; bytes: number }> {
  try {
    const names = await fs.readdir(ICON_DIR);
    let bytes = 0;
    let count = 0;
    for (const n of names) {
      if (n === ".gitkeep") continue;
      const st = await fs.stat(path.join(ICON_DIR, n));
      if (st.isFile()) {
        count++;
        bytes += st.size;
      }
    }
    return { count, bytes };
  } catch {
    return { count: 0, bytes: 0 };
  }
}
