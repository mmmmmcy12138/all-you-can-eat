import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest { return { id: "/", name: "All You Can Eat", short_name: "AYCE", description: "两个人的共享厨房", start_url: "/", scope: "/", display: "standalone", background_color: "#FAF9F6", theme_color: "#8FAF8F", lang: "zh-CN", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }] }; }
