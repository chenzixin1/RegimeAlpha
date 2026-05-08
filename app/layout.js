import "./globals.css";

export const metadata = {
  title: "RegimeAlpha",
  description: "Five-year weekly U.S. equity market regime map."
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
