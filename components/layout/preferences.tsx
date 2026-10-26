"use client";
import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun, WifiOff } from "lucide-react";
function readTheme() { return localStorage.getItem("ayce-theme") ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); }
function subscribeTheme(callback: () => void) {
 const media=window.matchMedia("(prefers-color-scheme: dark)");
 window.addEventListener("storage",callback); window.addEventListener("ayce-theme",callback);media.addEventListener("change",callback);
 return ()=>{window.removeEventListener("storage",callback);window.removeEventListener("ayce-theme",callback);media.removeEventListener("change",callback);};
}
function subscribeNetwork(callback: () => void) { window.addEventListener("online",callback);window.addEventListener("offline",callback);return ()=>{window.removeEventListener("online",callback);window.removeEventListener("offline",callback);}; }
export function Preferences() {
 const theme=useSyncExternalStore(subscribeTheme,readTheme,()=>"light");
 const online=useSyncExternalStore(subscribeNetwork,()=>navigator.onLine,()=>true);
 useEffect(()=>{document.documentElement.dataset.theme=theme;},[theme]);
 return <>{!online && <div role="status" className="offline-banner"><WifiOff size={16}/>网络已断开，云端操作暂不可用。</div>}<button className="theme-toggle" aria-label={theme==="dark" ? "切换浅色模式" : "切换深色模式"} onClick={()=>{localStorage.setItem("ayce-theme",theme==="dark" ? "light":"dark");window.dispatchEvent(new Event("ayce-theme"));}}>{theme==="dark" ? <Sun size={19}/> : <Moon size={19}/>}</button></>;
}
