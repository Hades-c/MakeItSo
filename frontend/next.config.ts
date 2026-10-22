import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy without nonces (keeps pages statically renderable). Next.js injects inline bootstrap
 * scripts, hence 'unsafe-inline' for scripts; the dev server additionally needs 'unsafe-eval' for React Refresh.
 */
export const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

export const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** Old route names → new information architecture (PLAN §3). Old /courses was the plan page; new /courses is the
 * catalog, so it is intentionally not redirected. */
export const legacyRedirects = [
  { source: "/dashboard", destination: "/today", permanent: true },
  { source: "/explore", destination: "/courses", permanent: true },
  { source: "/roadmap", destination: "/plan", permanent: true },
  { source: "/career", destination: "/careers", permanent: true },
  { source: "/career/:id", destination: "/careers/:id", permanent: true },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // No component needs the image optimizer; leaving it on made /_next/image a public proxy
  // (audit devex/next-config-dead-and-image-proxy, security/vulnerable-dependencies).
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return legacyRedirects;
  },
};

export default nextConfig;
