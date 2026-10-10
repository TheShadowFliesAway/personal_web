import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { BlockList, isIP } from "node:net";
import { request } from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import type { Readable } from "node:stream";
import { ImageError, MAX_IMAGE_SOURCE_BYTES } from "./images";

const blocked4 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked4.addSubnet(address, prefix, "ipv4");
const global6 = new BlockList();
global6.addSubnet("2000::", 3, "ipv6");
const blocked6 = new BlockList();
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const)
  blocked6.addSubnet(address, prefix, "ipv6");
export function publicAddress(address: string) {
  const family = isIP(address);
  return family === 4
    ? !blocked4.check(address, "ipv4")
    : family === 6 && global6.check(address, "ipv6") && !blocked6.check(address, "ipv6");
}
export function imageSourceUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ImageError("请提供完整的 HTTPS 图片下载地址，不能使用 sandbox: 路径或本地文件路径。");
  }
  if (
    raw.length > 8192 ||
    url.protocol !== "https:" ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new ImageError("图片链接必须是 HTTPS 地址，不能包含登录信息、片段或自定义端口。");
  return url;
}
type ResolveHost = (host: string) => Promise<LookupAddress[]>;
export async function resolveImageAddress(
  url: URL,
  resolve: ResolveHost = (host) => lookup(host, { all: true, verbatim: true }),
) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const family = isIP(host);
  const addresses = family ? [{ address: host, family }] : await resolve(host);
  // Reject mixed public/private DNS answers as well as localhost and metadata networks.
  if (!addresses.length || addresses.some((item) => !publicAddress(item.address)))
    throw new ImageError("图片地址不能指向本机、内网或保留网络地址。");
  return addresses.find((item) => item.family === 4) || addresses[0];
}
type ImageResponse = { status: number; headers: IncomingHttpHeaders; body: Readable };
type FetchImage = (url: URL, address: LookupAddress, signal: AbortSignal) => Promise<ImageResponse>;
const requestImage: FetchImage = (url, address, signal) =>
  new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        agent: false,
        signal,
        family: address.family,
        // Connect to the previously validated address without doing a second DNS lookup.
        // The original URL still supplies Host, TLS servername and certificate verification.
        lookup: (_host, options, callback) => {
          if (options.all) callback(null, [address]);
          else callback(null, address.address, address.family);
        },
        headers: {
          Accept:
            "image/png,image/jpeg,image/webp,image/gif,image/avif,application/octet-stream;q=0.5",
          "Accept-Encoding": "identity",
          "User-Agent": "Papertrail-ImageImporter/1.0",
        },
      },
      (res) => resolve({ status: res.statusCode || 0, headers: res.headers, body: res }),
    );
    req.on("error", reject);
    req.end();
  });
async function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
export async function downloadImage(
  raw: string,
  deps: { resolve?: ResolveHost; fetch?: FetchImage; timeoutMs?: number } = {},
) {
  const signal = AbortSignal.timeout(deps.timeoutMs ?? 15_000);
  let url = imageSourceUrl(raw);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const address = await abortable(resolveImageAddress(url, deps.resolve), signal);
      signal.throwIfAborted();
      const response = await abortable((deps.fetch || requestImage)(url, address, signal), signal);
      const { status, headers, body } = response;
      const abortBody = () => body.destroy(new Error("Image download timed out"));
      signal.addEventListener("abort", abortBody, { once: true });
      try {
        signal.throwIfAborted();
        if ([301, 302, 303, 307, 308].includes(status)) {
          if (!headers.location || redirects === 3)
            throw new ImageError("图片链接重定向过多或缺少跳转地址。");
          url = imageSourceUrl(new URL(headers.location, url).toString());
          continue;
        }
        if (status !== 200)
          throw new ImageError(
            `图片下载失败（HTTP ${status}），链接可能过期、需要登录或限制外链；请换用图片文件。`,
          );
        const type = String(headers["content-type"] || "")
          .split(";")[0]
          .trim()
          .toLowerCase();
        if (
          type &&
          ![
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif",
            "image/avif",
            "application/octet-stream",
            "binary/octet-stream",
          ].includes(type)
        )
          throw new ImageError(
            "链接没有返回支持的图片。请提供图片本身的下载地址，不是论文网页、PDF 或 SVG。",
          );
        if (headers["content-encoding"] && headers["content-encoding"] !== "identity")
          throw new ImageError("图片下载不支持压缩传输，请换用图片文件。");
        if (Number(headers["content-length"] || 0) > MAX_IMAGE_SOURCE_BYTES)
          throw new ImageError("原始图片超过 20 MB。", 413);
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of body) {
          signal.throwIfAborted();
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += bytes.length;
          if (size > MAX_IMAGE_SOURCE_BYTES) throw new ImageError("原始图片超过 20 MB。", 413);
          chunks.push(bytes);
        }
        return Buffer.concat(chunks);
      } finally {
        signal.removeEventListener("abort", abortBody);
        body.destroy();
      }
    }
  } catch (error) {
    if (error instanceof ImageError) throw error;
    // Never echo the source URL: ChatGPT download links may contain signed credentials.
    throw new ImageError("图片下载失败或超时，请使用有效的图片直链，或重新选择图片文件。");
  }
  throw new ImageError("图片链接无效。");
}
