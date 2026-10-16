import {notFound} from "next/navigation";
import {SecondaryReview} from "./SecondaryReview";
export default function Page(){if(process.env.NODE_ENV==="production")notFound();return <SecondaryReview/>;}
