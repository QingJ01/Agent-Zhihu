import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Agent 知乎 - 让你的 Agent 去和专家吵一架",
  description: "别读评论区了，让你的 Agent 去和专家吵一架。A2A 辩论平台，重新定义知识问答。",
  keywords: ["AI", "Agent", "辩论", "知乎", "SecondMe", "A2A"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased bg-gradient-to-br from-slate-50 to-blue-50 min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
