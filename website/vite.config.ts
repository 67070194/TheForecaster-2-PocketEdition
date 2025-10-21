import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import os from "os";
import fs from "fs";

// Lightweight uploader wired into Vite dev server
// POST /upload → { url }
// GET  /f/<filename> → serves uploaded .bin
function uploaderPlugin() {
  // DEV uploader endpoints:
  // - POST /upload -> saves .bin and returns { url }
  // - GET  /f/<filename> -> serves uploaded firmware with correct headers
  // Use only in local/dev environment for OTA testing.
  // Canonical upload dir relative to this config file (always web/uploads)
  const uploadsDir = path.resolve(__dirname, "uploads");
  // Legacy/alternative dirs that may have been used earlier
  const legacyDirs = [
    path.resolve(process.cwd(), "web", "uploads"), // when CWD=repo root
    path.resolve(process.cwd(), "uploads"),         // when CWD=web (incorrect old path)
    path.resolve(__dirname, "upload"),             // singular
    path.resolve(process.cwd(), "web", "upload"),  // singular with root CWD
  ];
  fs.mkdirSync(uploadsDir, { recursive: true });

  return {
    name: "firmware-uploader",
    configureServer(server: any) {
      // Static serve for /f/<file>
      server.middlewares.use("/f", (req: any, res: any) => {
        // Strip prefix
        const url = req.url || "/";
        const seg = url.replace(/^\/?f\/?/, "");
        if (!seg) {
          res.statusCode = 400;
          res.end("Missing filename");
          return;
        }
        const fname = path.basename(seg);
        const filePath = path.join(uploadsDir, fname);
        if (!fs.existsSync(filePath)) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        // Headers for binary OTA download
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", "application/octet-stream");
        try {
          const stat = fs.statSync(filePath);
          // Provide explicit length to help constrained HTTP clients
          res.setHeader("Content-Length", String(stat.size));
          // Avoid intermediaries altering content
          res.setHeader("Cache-Control", "no-store");
        } catch {}
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
      });

      // Multipart upload without extra deps (robust enough for single file)
      server.middlewares.use("/upload", async (req: any, res: any) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method Not Allowed");
          return;
        }

        const ct = req.headers["content-type"] || "";
        const m = /boundary=(?:"([^"]+)"|([^;]+))$/i.exec(ct);
        if (!m) {
          res.statusCode = 400;
          res.end("No boundary");
          return;
        }
        const boundary = "--" + (m[1] || m[2]);

        // Buffer body (sufficient for typical .bin sizes in dev; adjust if needed)
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          const bodyBin = Buffer.concat(chunks).toString("binary");
          // Split by boundary markers, ignore preamble and epilogue
          const rawParts = bodyBin.split(boundary).slice(1, -1);
          let saved: { name: string; path: string } | null = null;
          for (let part of rawParts) {
            // Each part generally begins with \r\n
            if (part.startsWith("\r\n")) part = part.slice(2);
            const headerEnd = part.indexOf("\r\n\r\n");
            if (headerEnd < 0) continue;
            const rawHeaders = part.slice(0, headerEnd);
            let dataBin = part.slice(headerEnd + 4);
            // Trim the trailing CRLF that precedes the next boundary
            if (dataBin.endsWith("\r\n")) dataBin = dataBin.slice(0, -2);

            const headers = rawHeaders.split("\r\n").filter(Boolean);
            const disp = headers.find((h) => /^Content-Disposition/i.test(h)) || "";
            const fnameMatch = /filename="([^"]+)"/.exec(disp);
            if (!fnameMatch) continue;
            const original = fnameMatch[1];
            const safe = original.replace(/[^a-zA-Z0-9_.-]/g, "_");
            const out = `${Date.now()}_${safe}`;
            const buf = Buffer.from(dataBin, "binary");
            fs.writeFileSync(path.join(uploadsDir, out), buf);
            saved = { name: original, path: out };
            break; // single file only
          }
          if (!saved) {
            res.statusCode = 400;
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "No file" }));
            return;
          }
          // Eager cleanup: keep only the file we just saved (in all known dirs)
          const safeKeep = path.basename(saved.path);
          const pruneDir = (dir: string) => {
            try {
              if (!fs.existsSync(dir)) return;
              for (const entry of fs.readdirSync(dir)) {
                if (entry === safeKeep) continue;
                try { fs.unlinkSync(path.join(dir, entry)); } catch {}
              }
            } catch {}
          };
          const pruneTargets = Array.from(new Set([uploadsDir, ...legacyDirs]));
          for (const dir of pruneTargets) pruneDir(dir);
          const proto = (req.headers["x-forwarded-proto"] || "http") as string;
          let host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
          // Prefer LAN IPv4 over localhost/127.0.0.1 so ESP32 can reach it
          const pickLanIPv4 = () => {
            const nets = os.networkInterfaces();
            for (const k of Object.keys(nets)) {
              for (const n of nets[k] || []) {
                if (!n.internal && n.family === "IPv4") return n.address;
              }
            }
            return undefined as string | undefined;
          };
          let hostname = host.split(",")[0].trim();
          let port = "";
          const m = /^(.*?):(\d+)$/.exec(hostname);
          if (m) { hostname = m[1]; port = m[2]; }
          if (hostname === "localhost" || hostname === "127.0.0.1") {
            const ip = pickLanIPv4();
            if (ip) hostname = ip;
            if (!port) port = String(server?.config?.server?.port || 5173);
          }
          const hostForDevice = port ? `${hostname}:${port}` : hostname;
          const url = `${proto}://${hostForDevice}/f/${encodeURIComponent(saved.path)}`;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Content-Type", "application/json");
          // include saved file path so client can request cleanup later
          res.end(JSON.stringify({ url, name: saved.name, file: saved.path }));
        });
      });

      // Cleanup endpoint: keep specified file, delete all others in uploads dir
      server.middlewares.use("/cleanup", async (req: any, res: any) => {
        if (req.method === "OPTIONS") {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method Not Allowed");
          return;
        }
        try {
          const chunks: Buffer[] = [];
          req.on("data", (c: Buffer) => chunks.push(c));
          req.on("end", () => {
            let keep = "";
            try {
              const body = Buffer.concat(chunks).toString("utf8");
              const json = JSON.parse(body || "{}");
              keep = String(json.keep || "");
            } catch {}
            if (!keep) {
              res.statusCode = 400;
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Missing 'keep' filename" }));
              return;
            }
            // Normalize to basename and prevent path traversal
            const keepBase = path.basename(keep);
            let removed = 0;
            const pruneDir = (dir: string) => {
              try {
                if (!fs.existsSync(dir)) return;
                for (const entry of fs.readdirSync(dir)) {
                  if (entry === keepBase) continue;
                  try { fs.unlinkSync(path.join(dir, entry)); removed++; } catch {}
                }
              } catch {}
            };
            const pruneTargets = Array.from(new Set([uploadsDir, ...legacyDirs]));
            for (const dir of pruneTargets) pruneDir(dir);
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, kept: keepBase, removed }));
          });
        } catch (e) {
          res.statusCode = 500;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: String((e as any)?.message || e) }));
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  // Determine base for build outputs
  // - Local dev: '/'
  // - CI on GitHub for this repo: '/TheForecaster-2-PocketEdition/'
  // - Fallback build elsewhere: './' (relative assets)
  const isBuild = command === 'build';
  const isGitHubCI = !!process.env.GITHUB_ACTIONS;
  const repo = process.env.GITHUB_REPOSITORY || '';
  const isThisRepo = /\/TheForecaster-2-PocketEdition$/.test(repo);
  const base = isBuild
    ? (isGitHubCI && isThisRepo ? '/TheForecaster-2-PocketEdition/' : './')
    : '/';

  return ({
  base,
  server: {
    host: "::",
    port: 5173,
    proxy: {
      // Forward API calls to the backend server in dev
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:3001",
        changeOrigin: true,
      },
      "/health": {
        target: process.env.API_PROXY_TARGET || "http://localhost:3001",
        changeOrigin: true,
      },
      "/fw": {
        target: process.env.API_PROXY_TARGET || "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), uploaderPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  });
});
