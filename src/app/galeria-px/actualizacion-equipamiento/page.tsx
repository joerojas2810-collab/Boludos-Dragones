import { notFound } from "next/navigation";
import { EquipmentReview } from "./EquipmentReview";

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <EquipmentReview />;
}
