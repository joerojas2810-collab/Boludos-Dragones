import {notFound} from "next/navigation";
import {RewardReview} from "./RewardReview";

export default function Page(){
  if(process.env.NODE_ENV==="production")notFound();
  return <RewardReview/>;
}
