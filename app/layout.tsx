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
  const image = `${protocol}://${host}/og-dispatch.png`;
  return {
    title: "Naviwork — Owner & Dispatch Command Center",
    description: "A role-aware field command center for owners and dispatchers, with priority queues, dispatch control, and team communication.",
    applicationName: "Naviwork",
    manifest: "/site.webmanifest",
    formatDetection: { telephone: false, email: false, address: false },
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Naviwork" },
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/og.png" },
    openGraph: { title: "Naviwork — Owner & Dispatch Command Center", description: "A role-aware command cockpit for service and logistics operations.", images: [image] },
    twitter: { card: "summary_large_image", title: "Naviwork — Owner & Dispatch Command Center", description: "A role-aware command cockpit for service and logistics operations.", images: [image] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabaseConfig = JSON.stringify({
    url: process.env.VITE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.VITE_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  }).replace(/</g, "\\u003c");

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#e5e4df" />
        <script dangerouslySetInnerHTML={{ __html: `window.__NAVIWORK_SUPABASE__=${supabaseConfig};` }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
