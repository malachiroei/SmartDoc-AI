import type { Metadata, Viewport } from "next";
import { Heebo, Fraunces, JetBrains_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast";
import { ServiceWorkerGuard } from "@/components/layout/ServiceWorkerGuard";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-sans",
  subsets: ["hebrew", "latin"],
});

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SmartDoc AI",
  description: "סריקת מסמכים חכמה עם תיוק אוטומטי ולמידת 3 אישורים",
  applicationName: "SmartDoc AI",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SmartDoc",
  },
};

export const viewport: Viewport = {
  themeColor: "#070b14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} ${fraunces.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" dir="rtl">
        <ServiceWorkerGuard />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
