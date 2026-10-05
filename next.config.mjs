/** @type {import('next').NextConfig} */
const nextConfig = {
  // The console has no server code: staff sign in and every call goes to the FastAPI backend from the browser,
  // so a static export on Cloudflare is enough (same as the student website).
  output: "export",
  images: { unoptimized: true },
  reactCompiler: false,
};

export default nextConfig;
