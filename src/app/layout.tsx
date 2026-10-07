import type { Metadata } from "next";
import { Chakra_Petch, MedievalSharp } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const pixel = Chakra_Petch({
  variable: "--font-pixel",
  subsets: ["latin"],
  weight: ["400", "600"],
});

const title = MedievalSharp({
  variable: "--font-title",
  subsets: ["latin"],
  weight: "400",
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
  icons: { icon: "/art/ui/favicon_64.webp", apple: "/art/ui/favicon_180.webp" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${pixel.variable} ${title.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
