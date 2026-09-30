/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["pg", "pdfjs-dist", "@napi-rs/canvas"],
  },
};

export default nextConfig;