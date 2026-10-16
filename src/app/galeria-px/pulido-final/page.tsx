import {notFound} from "next/navigation";
import {PolishReview} from "./PolishReview";

export default function Page(){
  if(process.env.NODE_ENV==="production")notFound();
  return <PolishReview/>;
}
