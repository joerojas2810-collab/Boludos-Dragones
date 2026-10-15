import { notFound } from "next/navigation";
import { CombatAlignmentReview } from "./CombatAlignmentReview";

export default function Page(){
  if(process.env.NODE_ENV==="production")notFound();
  return <CombatAlignmentReview />;
}
