import { EnvHttpProxyAgent, fetch as proxyFetch } from "undici";
const dispatcher = new EnvHttpProxyAgent();
const MAX_BYTES = 5 * 1024 * 1024;

export async function download(url: string): Promise<string> {
  const response = await proxyFetch(url, {
    dispatcher,
    signal: AbortSignal.timeout(15_000),
    headers: {
      "user-agent":
        "PANTAU/0.1 (open-source situational awareness; RSS/API reader)",
      accept: "application/json, application/xml, text/xml, text/csv, */*",
    },
    redirect: "error",
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`HTTP ${response.status}`);
  }
  if (Number(response.headers.get("content-length")) > MAX_BYTES) {
    await response.body?.cancel();
    throw new Error("Respons sumber terlalu besar");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Respons sumber kosong");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) throw new Error("Respons sumber terlalu besar");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString("utf8");
}
export const downloadJson = async (url: string): Promise<unknown> =>
  JSON.parse(await download(url));
