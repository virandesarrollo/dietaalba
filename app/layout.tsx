import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ConfirmDialogProvider } from "@/components/ConfirmDialogProvider";
import { OfflineSupport } from "@/components/OfflineSupport";

export const metadata: Metadata = {
  title: "AGAFIT",
  description: "Mi plan de alimentación y bienestar",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AGAFIT",
  },
  icons: {
    icon: "/icon.png",
    apple: "/apple-touch-icon.png",
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
      <body className="font-sans antialiased"><OfflineSupport /><ThemeProvider><ConfirmDialogProvider>{children}</ConfirmDialogProvider></ThemeProvider></body>
    </html>
  );
}
