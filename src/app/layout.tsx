import type { Metadata } from "next";
import { Chakra_Petch } from "next/font/google";
import "./globals.css";

const pixel = Chakra_Petch({
  variable: "--font-pixel",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "Boludos & Dragones",
  description: "RPG por turnos para noches de juegos",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${pixel.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
