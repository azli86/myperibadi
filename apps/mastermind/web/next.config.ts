import type { NextConfig } from "next";

const api = process.env.MASTERMIND_API_INTERNAL_ORIGIN || "http://127.0.0.1:8031";
const config: NextConfig = {
  async rewrites() { return [{ source: "/api/:path*", destination: `${api}/:path*` }]; },
};
export default config;
