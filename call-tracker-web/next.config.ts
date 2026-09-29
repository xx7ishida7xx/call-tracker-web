import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // CSVインポート（数千〜1万件規模）を1回のアクションで送れるように上限を引き上げる
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
