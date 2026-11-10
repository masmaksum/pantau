import { Router } from "express";
import type { NewsPipeline } from "./news-pipeline.js";
import type { ArchiveFilter } from "./archive.js";

function dateBoundary(value: unknown, end: boolean): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("Tanggal harus YYYY-MM-DD (WIB)");
  const day = Date.parse(value + "T00:00:00Z");
  if (
    !Number.isFinite(day) ||
    new Date(day).toISOString().slice(0, 10) !== value
  )
    throw new Error("Tanggal tidak valid");
  return new Date(
    Date.parse(value + "T00:00:00+07:00") + (end ? 86_400_000 : 0),
  ).toISOString();
}
export function archiveFilter(query: Record<string, unknown>): ArchiveFilter {
  const limit = Number(query.limit ?? 25),
    offset = Number(query.offset ?? 0);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 1_000_000
  )
    throw new Error("Pagination tidak valid");
  const text = (key: string) => {
    const value = query[key];
    if (value === undefined || value === "") return undefined;
    if (typeof value !== "string" || value.length > 200)
      throw new Error("Filter tidak valid");
    return value;
  };
  const located = text("located");
  if (located && !["yes", "no"].includes(located))
    throw new Error("Filter lokasi tidak valid");
  const from = dateBoundary(query.from, false),
    to = dateBoundary(query.to, true);
  if (from && to && from >= to) throw new Error("Rentang tanggal tidak valid");
  return {
    q: text("q"),
    source: text("source"),
    category: text("category"),
    location: text("location"),
    located: located as "yes" | "no" | undefined,
    from,
    to,
    limit,
    offset,
  };
}
export function archiveRoutes(pipeline: NewsPipeline) {
  const router = Router();
  router.get("/archive/status", (_req, res) => res.json(pipeline.health()));
  router.get("/archive/policies/:fingerprint", (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(String(req.params.fingerprint))) {
      res.status(400).json({ error: "Fingerprint tidak valid" });
      return;
    }
    const policy = pipeline.archive.policy(String(req.params.fingerprint));
    if (!policy) {
      res.status(404).json({ error: "Snapshot aturan tidak ditemukan" });
      return;
    }
    res.json(policy);
  });
  router.get("/archive", (req, res) => {
    let filter: ArchiveFilter;
    try {
      filter = archiveFilter(req.query);
    } catch (e) {
      res
        .status(400)
        .json({ error: e instanceof Error ? e.message : "Filter tidak valid" });
      return;
    }
    res.json(pipeline.archive.list(filter));
  });
  router.get("/archive/:id", (req, res) => {
    const record = pipeline.archive.detail(String(req.params.id));
    if (!record) {
      res.status(404).json({ error: "Berita arsip tidak ditemukan" });
      return;
    }
    res.json(record);
  });
  return router;
}
