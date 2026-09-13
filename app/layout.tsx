import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alba's Lifestyle ✨",
  description: "Mi plan de alimentación y bienestar",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Alba Life",
  },
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#FCE7F3", // Rosa pastel suave
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="bg-[#FAF7F2] text-slate-700 font-sans antialiased">{children}</body>
    </html>
  );
}