import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    root
  }
};

export default nextConfig;
