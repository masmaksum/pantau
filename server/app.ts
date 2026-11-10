import express from "express";
import { timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Event, Snapshot, SourceStatus } from "../shared/types.js";
import { SourceCache } from "./cache.js";
import { deduplicate, places, withinHours } from "./domain.js";
import { isAllowedReport } from "../shared/topic-policy.js";
import {
  BMKG_URL,
  loadFeed,
  loadFires,
  loadQuakes,
  loadWeather,
  NEWS_FEEDS,
} from "./providers.js";
import { isCamera, isSocialFeed, readConfig } from "./config.js";
import {
  environmentRoutes,
  type EnvironmentOptions,
} from "./environment-routes.js";

export interface Options extends EnvironmentOptions {
  cacheDir?: string;
  apiToken?: string;
  firmsKey?: string;
  camerasPath?: string;
  socialPath?: string;
}
export function createApp(options: Options = {}) {
  const app = express();
  const cache = new SourceCache(options.cacheDir ?? ".cache");
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
    });
    next();
  });
  app.get("/healthz", (_req, res) =>
    res.json({ status: "ok", service: "pantau", version: "0.1.2" }),
  );
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (options.apiToken) {
      const provided = Buffer.from(
        req.headers.authorization?.replace(/^Bearer /, "") ?? "",
      );
      const expected = Buffer.from(options.apiToken);
      if (
        provided.length !== expected.length ||
        !timingSafeEqual(provided, expected)
      ) {
        res.status(401).json({ error: "Token akses diperlukan" });
        return;
      }
    }
    next();
  });
  app.get("/api/cities", (_req, res) =>
    res.json(
      places
        .filter((p) => p[3] === "city")
        .map(([name, lat, lon]) => ({ name, lat, lon })),
    ),
  );
  app.use("/api", environmentRoutes(cache, options));
  app.get("/api/situation", async (req, res) => {
    const hours = Number(req.query.hours ?? 24);
    if (![6, 24, 72].includes(hours)) {
      res.status(400).json({ error: "hours harus 6, 24, atau 72" });
      return;
    }
    const social = await readConfig(
      options.socialPath ?? "config/social.json",
      isSocialFeed,
    );
    const providers = [
      ...NEWS_FEEDS.map((feed) => ({
        ...feed,
        ttl: 120_000,
        load: () => loadFeed(feed.url, feed.name),
      })),
      {
        id: "bmkg",
        name: "BMKG · Gempa",
        url: BMKG_URL,
        ttl: 60_000,
        load: loadQuakes,
      },
      ...(options.firmsKey
        ? [
            {
              id: "firms",
              name: "NASA FIRMS",
              url: "https://firms.modaps.eosdis.nasa.gov/",
              ttl: 600_000,
              load: () => loadFires(options.firmsKey!),
            },
          ]
        : []),
      ...social.items.map((feed) => ({
        id: `social-${feed.id}`,
        name: feed.name,
        url: feed.url,
        ttl: 180_000,
        load: () => loadFeed(feed.url, feed.name),
      })),
    ];
    const results = await Promise.all(
      providers.map(async (provider) => {
        const r = await cache.get<Event[]>(
          provider.id,
          provider.ttl,
          provider.load,
        );
        // Reapply current policy to last-good snapshots saved before this change.
        const events = (r.value ?? []).filter(isAllowedReport);
        return {
          events,
          status: {
            id: provider.id,
            name: provider.name,
            // Configured feed paths/query strings can contain credentials. Expose only the origin.
            url: new URL(provider.url).origin,
            status: r.status,
            fetchedAt: r.fetchedAt,
            attemptedAt: r.attemptedAt,
            count: events.length,
            message: r.message,
          } satisfies SourceStatus,
        };
      }),
    );
    const sources: SourceStatus[] = results.map((r) => r.status);
    if (!options.firmsKey)
      sources.push({
        id: "firms",
        name: "NASA FIRMS",
        url: "https://firms.modaps.eosdis.nasa.gov/",
        status: "unconfigured",
        fetchedAt: null,
        attemptedAt: new Date().toISOString(),
        count: 0,
        message: "Tambahkan FIRMS_MAP_KEY untuk mengaktifkan hotspot.",
      });
    if (!social.items.length)
      sources.push({
        id: "social",
        name: "Sosial · RSS",
        url: "https://www.threads.com/",
        status: social.error ? "error" : "unconfigured",
        fetchedAt: null,
        attemptedAt: new Date().toISOString(),
        count: 0,
        message:
          social.error ??
          "Tambahkan feed resmi atau berizin dalam config/social.json.",
      });
    const snapshot: Snapshot = {
      generatedAt: new Date().toISOString(),
      events: deduplicate(results.flatMap((r) => r.events))
        .filter((e) => withinHours(e, hours))
        .slice(0, 2500),
      sources,
    };
    res.json(snapshot);
  });
  app.get("/api/weather", async (req, res) => {
    const name = String(req.query.city ?? "jakarta").toLowerCase();
    const place = places.find((p) => p[0] === name && p[3] === "city");
    if (!place) {
      res.status(400).json({ error: "Pilih kota dari /api/cities" });
      return;
    }
    const r = await cache.get(
      `weather-${name.replaceAll(" ", "-")}`,
      600_000,
      () => loadWeather({ name, lat: place[1], lon: place[2] }),
    );
    res.status(r.value ? 200 : 502).json(r);
  });
  app.get("/api/cameras", async (_req, res) => {
    const config = await readConfig(
      options.camerasPath ?? "config/cameras.json",
      isCamera,
    );
    res.json({
      cameras: config.items,
      status: config.error
        ? "error"
        : config.items.length
          ? "configured"
          : "unconfigured",
      message:
        config.error ??
        (config.items.length
          ? "Ketersediaan stream bergantung pada sumber."
          : "Belum ada kamera. Tambahkan sumber publik berizin ke config/cameras.json."),
    });
  });
  if (existsSync(resolve("dist/index.html"))) {
    app.use(
      express.static(resolve("dist"), {
        index: "index.html",
        dotfiles: "deny",
      }),
    );
  }
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint tidak ditemukan" }),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error(
        "Request failed:",
        error instanceof Error ? error.name : "unknown",
      );
      res.status(500).json({ error: "Terjadi kesalahan server" });
    },
  );
  return app;
}
