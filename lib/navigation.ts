export const navigation = [
 { href: "/", label: "首页", english: "Home", icon: "home" },
 { href: "/fridge", label: "冰箱", english: "Fridge", icon: "fridge" },
 { href: "/menu", label: "点菜", english: "Menu", icon: "menu" },
 { href: "/shopping", label: "采购", english: "Shopping", icon: "shopping" },
 { href: "/profile", label: "我的", english: "Profile", icon: "profile" },
] as const;
export function isActivePath(pathname: string, href: string) {
 return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
