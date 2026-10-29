import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tamales & More | Made for sharing",
  description: "Choose your favorite tamales, by the dozen or individually. Save your order and let our kitchen take care of the rest.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
