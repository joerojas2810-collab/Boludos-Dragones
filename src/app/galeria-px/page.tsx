import { notFound } from "next/navigation";
import { Gallery } from "./Gallery";

// Dev-only viewer for the pixel-art line (heroes, enemies, bosses x 5 elements x actions).
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Gallery />;
}
