import { EnvHttpProxyAgent, fetch as proxyFetch } from "undici";
import robotsParser from "robots-parser";

const dispatcher = new EnvHttpProxyAgent();
const pageHosts: Record<string, string[]> = {
  antara: ["www.antaranews.com"],
  detik: ["news.detik.com", "www.detik.com"],
};
const imageHosts: Record<string, string[]> = {
  antara: ["cdn.antaranews.com", "img.antaranews.com", "www.antaranews.com"],
  detik: ["awsimages.detik.net.id", "akcdn.detik.net.id", "news.detik.com"],
};
export class CaptureError extends Error {
  constructor(
    message: string,
    readonly permanent = false,
    readonly retryAt?: string,
  ) {
    super(message);
  }
}
export function allowedCaptureUrl(
  sourceId: string,
  input: string,
  kind: "page" | "image",
) {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    throw new CaptureError("URL sumber tidak valid", true);
  }
  if (
    u.protocol !== "https:" ||
    u.port ||
    u.username ||
    u.password ||
    !(kind === "page" ? pageHosts : imageHosts)[sourceId]?.includes(u.hostname)
  )
    throw new CaptureError(
      "Host atau protokol tidak didukung untuk preservasi",
      true,
    );
  u.hash = "";
  return u.href;
}
interface RawResponse {
  status: number;
  headers: { get(name: string): string | null };
  body: {
    getReader(): {
      read(): Promise<{ done: boolean; value?: Uint8Array }>;
      cancel(): Promise<unknown>;
    };
    cancel(): Promise<unknown>;
  } | null;
}
export type ArchiveTransport = (url: string) => Promise<RawResponse>;
export interface CaptureResource {
  url: string;
  bytes: Buffer;
  mime: string;
  fetchedAt: string;
}
export class ArticleFetcher {
  private last = new Map<string, number>();
  private robots = new Map<
    string,
    { until: number; rules: ReturnType<typeof robotsParser> | null }
  >();
  constructor(
    private transport: ArchiveTransport = async (url) =>
      proxyFetch(url, {
        dispatcher,
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "user-agent": "PANTAU/0.1 (+public news preservation)",
          accept:
            "text/html, image/jpeg, image/png, image/webp, image/gif, text/plain;q=0.5",
        },
      }),
    private interval = 1500,
  ) {}
  private async request(url: string, maxBytes: number) {
    const host = new URL(url).host;
    const delay = Math.max(
      0,
      (this.last.get(host) ?? 0) + this.interval - Date.now(),
    );
    if (delay) await new Promise((r) => setTimeout(r, delay));
    this.last.set(host, Date.now());
    let r: RawResponse;
    try {
      r = await this.transport(url);
    } catch {
      throw new CaptureError("Jaringan atau timeout saat mengambil sumber");
    }
    if (r.status >= 300 && r.status < 400) {
      await r.body?.cancel();
      return {
        status: r.status,
        location: r.headers.get("location"),
        bytes: Buffer.alloc(0),
        mime: "",
      };
    }
    if (r.status !== 200) {
      await r.body?.cancel();
      return {
        status: r.status,
        location: null,
        bytes: Buffer.alloc(0),
        mime: "",
        retryAfter: r.headers.get("retry-after"),
      };
    }
    if (Number(r.headers.get("content-length")) > maxBytes) {
      await r.body?.cancel();
      throw new CaptureError("Ukuran respons melebihi batas", true);
    }
    const reader = r.body?.getReader();
    if (!reader) throw new CaptureError("Respons sumber kosong");
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        length += value.byteLength;
        if (length > maxBytes)
          throw new CaptureError("Ukuran respons melebihi batas", true);
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof CaptureError) throw error;
      throw new CaptureError(
        "Jaringan atau timeout saat membaca respons sumber",
      );
    } finally {
      await reader.cancel().catch(() => {});
    }
    return {
      status: r.status,
      location: null,
      bytes: Buffer.concat(chunks),
      mime: (r.headers.get("content-type") ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase(),
    };
  }
  private async permitted(url: string) {
    const origin = new URL(url).origin;
    let entry = this.robots.get(origin);
    if (!entry || entry.until < Date.now()) {
      const result = await this.request(origin + "/robots.txt", 512 * 1024);
      if (result.status !== 200 && ![404, 410].includes(result.status))
        throw new CaptureError(
          "Aturan robots.txt belum dapat diperiksa",
          result.status === 401 || result.status === 403,
          retryTimestamp(
            "retryAfter" in result ? result.retryAfter : undefined,
          ),
        );
      entry = {
        until: Date.now() + 3600_000,
        rules:
          result.status === 200
            ? robotsParser(
                origin + "/robots.txt",
                result.bytes.toString("utf8"),
              )
            : null,
      };
      this.robots.set(origin, entry);
    }
    if (entry.rules?.isAllowed(url, "PANTAU") === false)
      throw new CaptureError("Pengambilan dibatasi robots.txt penerbit", true);
    const crawlDelay = entry.rules?.getCrawlDelay("PANTAU");
    if (crawlDelay) {
      if (crawlDelay > 60)
        throw new CaptureError(
          "Crawl-delay penerbit memerlukan penjadwalan lebih panjang",
        );
      const delay = Math.max(
        0,
        (this.last.get(new URL(url).host) ?? 0) +
          crawlDelay * 1000 -
          Date.now(),
      );
      if (delay) await new Promise((r) => setTimeout(r, delay));
    }
  }
  async get(
    sourceId: string,
    input: string,
    kind: "page" | "image",
  ): Promise<CaptureResource> {
    let url = allowedCaptureUrl(sourceId, input, kind);
    for (let redirects = 0; redirects <= 3; redirects++) {
      await this.permitted(url);
      const result = await this.request(
        url,
        kind === "page" ? 5 * 1024 * 1024 : 8 * 1024 * 1024,
      );
      if (result.status >= 300 && result.status < 400 && result.location) {
        url = allowedCaptureUrl(
          sourceId,
          new URL(result.location, url).href,
          kind,
        );
        continue;
      }
      if (result.status !== 200)
        throw new CaptureError(
          `HTTP ${result.status}`,
          [401, 403, 404, 410, 451].includes(result.status),
          retryTimestamp(
            "retryAfter" in result ? result.retryAfter : undefined,
          ),
        );
      if (
        kind === "page" &&
        !["text/html", "application/xhtml+xml"].includes(result.mime)
      )
        throw new CaptureError("Respons bukan halaman HTML", true);
      return {
        url,
        bytes: result.bytes,
        mime: result.mime,
        fetchedAt: new Date().toISOString(),
      };
    }
    throw new CaptureError("Redirect sumber terlalu banyak", true);
  }
}

function retryTimestamp(header: string | null | undefined): string | undefined {
  if (!header) return undefined;
  const at = /^\d+$/.test(header)
    ? Date.now() + Number(header) * 1000
    : Date.parse(header);
  return Number.isFinite(at) && at > Date.now() && at < 8.64e15
    ? new Date(at).toISOString()
    : undefined;
}

export function verifiedImageMime(data: Uint8Array, mime: string): string {
  const b = Buffer.from(data);
  if (mime === "image/jpeg" && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return mime;
  if (
    mime === "image/png" &&
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return mime;
  if (
    mime === "image/webp" &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    return mime;
  if (mime === "image/gif" && /^GIF8[79]a$/.test(b.toString("ascii", 0, 6)))
    return mime;
  throw new CaptureError("Format/signature foto tidak didukung", true);
}
