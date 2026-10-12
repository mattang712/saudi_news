// 뉴스 데이터는 사이트를 다시 만들지 않고 GitHub 공개 저장소에서 바로 받아온다.
// (Vercel이 자동으로 넣어 주는 저장소 정보로 주소를 만든다)
const owner = process.env.VERCEL_GIT_REPO_OWNER;
const slug = process.env.VERCEL_GIT_REPO_SLUG;
const ref = process.env.VERCEL_GIT_COMMIT_REF || "main";
const liveUrl =
  process.env.NEXT_PUBLIC_DATA_URL ||
  (owner && slug ? `https://raw.githubusercontent.com/${owner}/${slug}/${ref}/public/data/news.json` : "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_DATA_URL: liveUrl },
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
