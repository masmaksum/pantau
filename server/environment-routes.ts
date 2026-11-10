import { Router } from "express";
import { resolve } from "node:path";
import { SourceCache } from "./cache.js";
import { places, safeUrl } from "./domain.js";
import { datasets, fileLayerIds, gfwVectors } from "../shared/environment.js";
import { readConfig } from "./config.js";
import {
  loadAir,
  loadBiodiversity,
  loadContextFile,
  loadGfw,
} from "./environment.js";

export interface EnvironmentOptions {
  gfwKey?: string;
  contextManifest?: string;
  contextRoot?: string;
}
interface ContextConfig {
  id: string;
  file: string;
  sourceUrl: string;
  license: string;
  vintage: string;
}
const isContextConfig = (value: unknown): value is ContextConfig => {
  const c = value as ContextConfig;
  return (
    !!c &&
    fileLayerIds.includes(c.id) &&
    typeof c.file === "string" &&
    c.file.endsWith(".geojson") &&
    !!safeUrl(c.sourceUrl) &&
    typeof c.license === "string" &&
    !!c.license.trim() &&
    typeof c.vintage === "string" &&
    !!c.vintage.trim()
  );
};
export function environmentRoutes(
  cache: SourceCache,
  options: EnvironmentOptions,
) {
  const router = Router();
  const config = () =>
    readConfig(
      options.contextManifest ?? "config/context.json",
      isContextConfig,
    );
  router.get("/datasets", async (_req, res) => {
    const local = await config();
    res.json({
      reference: "https://github.com/ammar-rasyidi/mandum-rimba",
      datasets: datasets.map((d) => {
        const entry = local.items.find((c) => c.id === d.id);
        return {
          ...d,
          ...(entry
            ? {
                url: entry.sourceUrl,
                license: entry.license,
                vintage: entry.vintage,
              }
            : {}),
          configured:
            d.access === "ready" ||
            (d.access === "key" && !!options.gfwKey) ||
            (d.access === "file" && !!entry),
          configError: d.access === "file" ? local.error : undefined,
        };
      }),
    });
  });
  router.get("/air-quality", async (req, res) => {
    const city = String(req.query.city ?? "jakarta").toLowerCase();
    const p = places.find((p) => p[0] === city && p[3] === "city");
    if (!p) {
      res.status(400).json({ error: "Pilih kota dari /api/cities" });
      return;
    }
    const result = await cache.get(
      `air-${city.replaceAll(" ", "-")}`,
      3_600_000,
      () => loadAir(city, p[1], p[2]),
    );
    res.status(result.value ? 200 : 502).json(result);
  });
  router.get("/biodiversity", async (_req, res) => {
    const result = await cache.get(
      "gbif-indonesia",
      86_400_000,
      loadBiodiversity,
    );
    res.status(result.value ? 200 : 502).json(result);
  });
  router.get("/context/:id", async (req, res) => {
    const id = String(req.params.id);
    const dataset = datasets.find((d) => d.id === id && d.kind === "vector");
    if (!dataset) {
      res.status(404).json({ error: "Lapisan tidak tersedia" });
      return;
    }
    if (gfwVectors[id]) {
      if (!options.gfwKey) {
        res.json({
          value: null,
          status: "unconfigured",
          message: "Isi GFW_API_KEY milik operator untuk lapisan ini.",
        });
        return;
      }
      res.json(
        await cache.get(`gfw-${id}`, 86_400_000, () =>
          loadGfw(id, options.gfwKey!),
        ),
      );
      return;
    }
    const local = await config();
    const entry = local.items.find((c) => c.id === id);
    if (!entry) {
      res.json({
        value: null,
        status: local.error ? "error" : "unconfigured",
        message:
          local.error ??
          "Belum ada berkas GeoJSON dan metadata operator untuk lapisan ini.",
      });
      return;
    }
    // SourceCache is bypassed for local files so edits/replacements are reflected immediately.
    try {
      const value = await loadContextFile(
        entry.file,
        id,
        resolve(options.contextRoot ?? "config/context-data"),
      );
      res.json({
        value,
        status: "ok",
        fetchedAt: new Date().toISOString(),
        message:
          "Waktu baca berkas, bukan tanggal pembaruan dataset. Lihat tahun data di katalog.",
      });
    } catch {
      res
        .status(502)
        .json({
          value: null,
          status: "error",
          message: "Berkas konteks tidak dapat dibaca atau divalidasi.",
        });
    }
  });
  return router;
}
