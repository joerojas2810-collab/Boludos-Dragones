import { notFound } from "next/navigation";
import { HdSample } from "./HdSample";

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <HdSample />;
}
