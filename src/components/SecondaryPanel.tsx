"use client";

import type {ComponentProps,CSSProperties} from "react";
import {Panel} from "./Panel";
import {isPixel} from "@/lib/art/pixel";
import {paintedSceneStyle} from "@/lib/art/painted-backgrounds";
import "./secondary-surfaces.css";
import "./painted-scene.css";

/** Contextual art only; actions and game state remain with the caller. */
export function SecondaryPanel({scene="menu",...props}:ComponentProps<typeof Panel>&{scene?:string}){
 if(isPixel())return <Panel {...props}/>;
 return <div className="secondary-surface painted-scene" style={paintedSceneStyle(scene) as CSSProperties}><Panel {...props}/></div>;
}
