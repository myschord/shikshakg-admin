// Runs after `next build`: fills the CSP placeholder in out/_headers with this build's API origin.
import fs from "node:fs";

const file = "out/_headers";
if (!fs.existsSync(file)) {
  console.error(`write-headers: ${file} not found. Run "next build" first.`);
  process.exit(1);
}
const origin = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};
const api = origin(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8020");
const uniq = (l) => [...new Set(l.filter(Boolean))];

const policy = {
  "default-src": ["'self'"],
  // Next.js writes small inline bootstrap scripts into every static page.
  "script-src": ["'self'", "'unsafe-inline'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  // Staff preview question images, which come from the API or its storage origin.
  "img-src": uniq(["'self'", "data:", "blob:", "https:", api]),
  "font-src": ["'self'", "data:"],
  "media-src": uniq(["'self'", "blob:", api]),
  "connect-src": uniq(["'self'", api]),
  "frame-src": ["'none'"],
  "worker-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
};
const csp = Object.entries(policy).map(([k, v]) => `${k} ${v.join(" ")}`).join("; ");
const text = fs.readFileSync(file, "utf8");
if (!text.includes("{{CSP}}")) {
  console.error("write-headers: no {{CSP}} placeholder in public/_headers.");
  process.exit(1);
}
fs.writeFileSync(file, text.replace("{{CSP}}", csp));
if (!api || /localhost|127\.0\.0\.1/.test(api)) console.warn(`write-headers: API origin is ${api}. Set NEXT_PUBLIC_API_URL for a production build.`);
console.log(`write-headers: Content-Security-Policy written to ${file} (API origin ${api}).`);
