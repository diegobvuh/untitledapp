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
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "Money OS — Personal Finance Command Center",
    description: "A private, age-aware command center for accounts, spending, income, savings, and smarter money decisions.",
    applicationName: "Money OS",
    manifest: "/site.webmanifest",
    formatDetection: { telephone: false, email: false, address: false },
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Money OS" },
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/og.png" },
    openGraph: { title: "Money OS", description: "See every account. Understand every dollar. Build your next move.", images: [image] },
    twitter: { card: "summary_large_image", title: "Money OS", description: "Your private personal finance command center.", images: [image] },
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
        <meta name="theme-color" content="#06171e" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
