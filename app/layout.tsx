import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og-camcorder.png`;
  return {
    title: "Naviwork — Field Operations Command Center",
    description: "A customizable field operations console for crews, route gaps, revenue, and customer outreach—demoed in Hayward, California.",
    applicationName: "Naviwork",
    manifest: "/site.webmanifest",
    formatDetection: { telephone: false, email: false, address: false },
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Naviwork" },
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/og.png" },
    openGraph: { title: "Naviwork — Field Command", description: "Crews, route gaps, revenue, and customer outreach in one tactile command console.", images: [image] },
    twitter: { card: "summary_large_image", title: "Naviwork — Field Command", description: "Crews, route gaps, revenue, and customer outreach in one tactile command console.", images: [image] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#e5e4df" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
