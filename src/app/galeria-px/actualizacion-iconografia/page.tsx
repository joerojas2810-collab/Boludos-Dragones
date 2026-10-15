import { notFound } from "next/navigation";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { IconReview } from "./IconReview";

export default async function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  const files = await readdir(path.join(process.cwd(), "public/art/icons"));
  return <IconReview catalog={files.filter(f => /^icon_.*\.webp$/.test(f)).map(f => f.slice(5, -5)).sort()} />;
}
