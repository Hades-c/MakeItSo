import { describe, expect, it } from "vitest";
import nextConfig, { contentSecurityPolicy } from "@/next.config";

describe("next.config", () => {
  it("disables the image optimizer and the X-Powered-By header", () => {
    expect(nextConfig.images?.unoptimized).toBe(true);
    expect(nextConfig.images?.remotePatterns).toBeUndefined();
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("sends security headers on every route", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.source).toBe("/:path*");
    const headers = Object.fromEntries(rules[0]!.headers.map((h) => [h.key, h.value]));
    expect(headers).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
    expect(headers["Content-Security-Policy"]).toBe(contentSecurityPolicy);
  });

  it("uses a CSP that forbids framing and foreign scripts", () => {
    const directives = Object.fromEntries(
      contentSecurityPolicy.split("; ").map((d) => {
        const [name, ...values] = d.split(" ");
        return [name, values.join(" ")];
      }),
    );
    expect(directives["default-src"]).toBe("'self'");
    expect(directives["script-src"]).toBe("'self' 'unsafe-inline'");
    expect(directives["connect-src"]).toBe("'self'");
    expect(directives["frame-ancestors"]).toBe("'none'");
    expect(directives["base-uri"]).toBe("'self'");
    expect(directives["form-action"]).toBe("'self'");
  });

  it("permanently redirects the old routes to the new IA (but not /courses)", async () => {
    const redirects = await nextConfig.redirects!();
    const map = Object.fromEntries(redirects.map((r) => [r.source, r.destination]));
    expect(map).toEqual({
      "/dashboard": "/today",
      "/explore": "/courses",
      "/roadmap": "/plan",
      "/career": "/careers",
      "/career/:id": "/careers/:id",
    });
    expect(redirects.every((r) => r.permanent)).toBe(true);
  });
});
