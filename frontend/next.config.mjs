/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["mongoose"],
  },
  images: {
    // No component uses next/image. Keep the image optimizer off so
    // /_next/image cannot be used as an open proxy.
    unoptimized: true,
  },
};

export default nextConfig;
