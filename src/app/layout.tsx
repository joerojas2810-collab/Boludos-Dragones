import type { Metadata } from "next";
import { Alegreya, Nunito } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { uiAsset } from "@/lib/art";
import { ArtScope } from "@/components/ArtScope";
import { isPixel } from "@/lib/art/pixel";
import "./globals.css";

// Shared typography: Nunito for text and controls, Alegreya for titles.
const pixel = Nunito({
  variable: "--font-pixel",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const title = Alegreya({
  variable: "--font-title",
  subsets: ["latin"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Boludos & Dragones",
  description: "RPG por turnos para noches de juegos",
  openGraph: {
    title: "Boludos & Dragones",
    description: "RPG por turnos para noches de juegos",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    locale: "es_AR",
    type: "website",
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
  icons: { icon: uiAsset("favicon_64"), apple: uiAsset("favicon_180") },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${pixel.variable} ${title.variable} h-full antialiased`}
    >
      <body data-art={isPixel() ? "pixel" : "painted"} className="min-h-full flex flex-col">
        <ArtScope>
          <AppShell>{children}</AppShell>
        </ArtScope>
      </body>
    </html>
  );
}
