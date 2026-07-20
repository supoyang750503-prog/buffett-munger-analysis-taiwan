import "./globals.css";

export const metadata = {
  title: "巴菲特蒙格投資分析系統",
  description: "AI 驅動的台股投資分析工具",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
