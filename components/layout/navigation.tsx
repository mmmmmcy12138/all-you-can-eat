"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Refrigerator, Utensils, ShoppingBasket, UserRound, Heart, Sprout } from "lucide-react";
import { navigation, isActivePath } from "@/lib/navigation";
const icons = { home: House, fridge: Refrigerator, menu: Utensils, shopping: ShoppingBasket, profile: UserRound };
export function Navigation() {
 const pathname = usePathname();
 return <><aside className="sidebar"><Link href="/" className="brand" aria-label="AYCE 首页"><span className="brand-mark"><Sprout /></span><span>AYCE<small>ALL YOU CAN EAT</small></span></Link><p className="sidebar-caption">把日子，过成喜欢的味道。</p><nav aria-label="桌面主导航">{navigation.map(item => { const Icon = icons[item.icon]; return <Link key={item.href} href={item.href} aria-current={isActivePath(pathname,item.href) ? "page" : undefined} className="nav-link"><Icon size={21}/><span>{item.label}<small>{item.english}</small></span></Link>; })}</nav><div className="sidebar-note"><Heart size={22}/><p>一屋，两人，三餐。<small>属于你们的厨房小天地</small></p></div><Link className="household-link" href="/profile"><span className="avatar">家</span><span>我们的厨房<small>等待创建家庭</small></span><span>↗</span></Link></aside><nav className="bottom-nav" aria-label="手机主导航">{navigation.map(item => { const Icon=icons[item.icon]; return <Link key={item.href} href={item.href} aria-current={isActivePath(pathname,item.href) ? "page" : undefined}><Icon size={21}/><span>{item.label}</span></Link>; })}</nav></>;
}
