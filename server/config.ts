import { readFile } from "node:fs/promises";
import type { Camera } from "../shared/types.js";
import { safeUrl } from "./domain.js";

export async function readConfig<T>(
  path: string,
  validate: (item: unknown) => item is T,
): Promise<{ items: T[]; error?: string }> {
  try {
    const data = JSON.parse(await readFile(path, "utf8"));
    if (!Array.isArray(data) || data.length > 30 || !data.every(validate))
      return { items: [], error: "Konfigurasi tidak valid" };
    return { items: data };
  } catch (error) {
    return {
      items: [],
      ...(typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
        ? {}
        : { error: "Konfigurasi tidak dapat dibaca" }),
    };
  }
}
export function isCamera(v: unknown): v is Camera {
  const c = v as Camera;
  return (
    !!c &&
    /^[a-z0-9_-]{1,50}$/i.test(c.id) &&
    typeof c.name === "string" &&
    typeof c.region === "string" &&
    (c.location === undefined ||
      (!!c.location &&
        Number.isFinite(c.location.lat) &&
        Number.isFinite(c.location.lon) &&
        c.location.lat >= -90 &&
        c.location.lat <= 90 &&
        c.location.lon >= -180 &&
        c.location.lon <= 180)) &&
    ["hls", "link"].includes(c.type) &&
    !!safeUrl(c.url) &&
    c.url.startsWith("https://") &&
    !!safeUrl(c.sourceUrl)
  );
}
