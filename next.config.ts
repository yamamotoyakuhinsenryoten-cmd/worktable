import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  turbopack: {},
  outputFileTracingIncludes: {
    "/api/chat": ["./project-context/website-development/docs/*.md"],
  },
};

export default withPWA({
  dest: "public",
  register: true,
})(nextConfig);
