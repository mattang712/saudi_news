/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // 뉴스 파일은 항상 최신본을 받도록 캐시 금지
        source: "/data/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
