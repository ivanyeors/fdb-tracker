/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
    optimizePackageImports: [
      "@visx/group",
      "@visx/shape",
      "@visx/scale",
      "@visx/axis",
      "@visx/grid",
      "@visx/tooltip",
      "@visx/responsive",
      "@visx/text",
      "@visx/pattern",
      "@visx/gradient",
      "lucide-react",
      "date-fns",
    ],
  },
}

export default nextConfig
