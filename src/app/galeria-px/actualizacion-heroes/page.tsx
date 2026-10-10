import { notFound } from "next/navigation";
import { Review } from "./Review";

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Review />;
}
