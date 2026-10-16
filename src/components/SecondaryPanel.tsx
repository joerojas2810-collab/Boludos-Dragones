"use client";

import type {ComponentProps,CSSProperties} from "react";
import {Panel} from "./Panel";
import {isPixel} from "@/lib/art/pixel";
import {paintedBackground} from "@/lib/art/painted-backgrounds";
import "./secondary-surfaces.css";

/** Contextual art only; actions and game state remain with the caller. */
export function SecondaryPanel({scene="menu",...props}:ComponentProps<typeof Panel>&{scene?:string}){
 if(isPixel())return <Panel {...props}/>;
 return <div className="secondary-surface" style={{"--secondary-scene":"url("+paintedBackground(scene)?.src+")"} as CSSProperties}><Panel {...props}/></div>;
}
