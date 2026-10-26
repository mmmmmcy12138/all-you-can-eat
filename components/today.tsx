"use client";
import { useSyncExternalStore } from "react";
function subscribe(callback: () => void) { const timer=window.setInterval(callback,60000);return ()=>window.clearInterval(timer); }
function snapshot(){return new Intl.DateTimeFormat("zh-CN",{month:"long",day:"numeric",weekday:"long"}).format(new Date());}
export function Today(){const date=useSyncExternalStore(subscribe,snapshot,()=>"今天，也要好好吃饭");return <span>{date}</span>;}
