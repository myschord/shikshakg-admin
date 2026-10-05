// Serves out/ the way Cloudflare does: static files, clean URLs and the headers from out/_headers. For local checks and e2e.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("out");
const port = Number(process.env.PORT ?? 3100);
const blocks = [];
let cur = null;
for (const line of fs.readFileSync(path.join(root, "_headers"), "utf8").split(/\r?\n/)) {
  if (!line.trim() || line.startsWith("#")) continue;
  if (!/^\s/.test(line)) {
    cur = { pat: line.trim(), h: {} };
    blocks.push(cur);
  } else {
    const i = line.indexOf(":");
    cur.h[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
}
const match = (pat, url) => new RegExp("^" + pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$").test(url);
const types = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".txt": "text/plain", ".woff2": "font/woff2", ".mp4": "video/mp4", ".xml": "application/xml" };

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    const candidates = [url, url + ".html", path.join(url, "index.html")];
    let file = null;
    for (const c of candidates) {
      const p = path.join(root, c);
      if (p.startsWith(root) && fs.existsSync(p) && fs.statSync(p).isFile()) {
        file = p;
        break;
      }
    }
    const headers = {};
    for (const b of blocks) if (match(b.pat, url)) Object.assign(headers, b.h);
    if (!file) {
      res.writeHead(404, { ...headers, "content-type": "text/html" });
      return res.end(fs.readFileSync(path.join(root, "404.html")));
    }
    res.writeHead(200, { ...headers, "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`serving out/ on ${port}`));
