import type { Metadata, Viewport } from "next";
import { Navigation } from "@/components/layout/navigation";
import { Preferences } from "@/components/layout/preferences";
import "./globals.css";
export const metadata: Metadata = { title: { default: "AYCE · 好好吃饭，好好生活", template: "%s · AYCE" }, description: "两个人的共享厨房，让每一餐都有期待。", applicationName: "All You Can Eat", appleWebApp: { capable: true, title: "AYCE", statusBarStyle: "default" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: [{ media: "(prefers-color-scheme: light)", color: "#FAF9F6" }, { media: "(prefers-color-scheme: dark)", color: "#18231C" }] };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
 return <html lang="zh-CN" suppressHydrationWarning><body><a className="skip-link" href="#main">跳到主要内容</a><Navigation/><Preferences/><main id="main" className="main-content">{children}<footer className="footer">用心吃饭，认真相爱。<span>MADE FOR TWO · AYCE</span></footer></main></body></html>;
}
