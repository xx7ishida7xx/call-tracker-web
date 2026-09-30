import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // CSVインポート（数千〜1万件規模）や、添付ファイル（最大25MB）を
      // 1回のアクションで送れるように上限を引き上げる
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
