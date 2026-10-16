import { notFound } from "next/navigation";
import { CompleteReview } from "./CompleteReview";

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CompleteReview/>;
}
