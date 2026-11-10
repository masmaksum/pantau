import "dotenv/config";
import { createApp } from "./app.js";
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT tidak valid");
const app = createApp({
  cacheDir: process.env.CACHE_DIR,
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
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
