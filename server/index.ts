import "dotenv/config";
import { createApp } from "./app.js";
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT tidak valid");
const app = createApp({
  cacheDir: process.env.CACHE_DIR,
  archivePath: process.env.ARCHIVE_PATH,
  apiToken: process.env.PANTAU_API_TOKEN,
  firmsKey: process.env.FIRMS_MAP_KEY,
  camerasPath: process.env.CAMERAS_CONFIG,
  gfwKey: process.env.GFW_API_KEY,
  contextManifest: process.env.CONTEXT_CONFIG,
  contextRoot: process.env.CONTEXT_DATA_DIR,
});
const server = app.listen(port, process.env.HOST ?? "127.0.0.1", () =>
  console.log(
    `PANTAU listening on http://${process.env.HOST ?? "127.0.0.1"}:${port}`,
  ),
);
// Poll on the server even when no dashboard is open. Cache coalesces request/interval work.
const pollNews = () =>
  app.locals
    .pollNews()
    .catch(() =>
      console.error("News intake failed; inspect source/archive status."),
    );
void pollNews();
const newsTimer = setInterval(() => {
  void pollNews();
}, 120_000);
newsTimer.unref();
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    clearInterval(newsTimer);
    server.close(() => {
      void app.locals.dispose().then(() => process.exit(0));
    });
  });
