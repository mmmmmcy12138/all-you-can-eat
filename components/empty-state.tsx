import Link from "next/link";
import { Sprout, ArrowUpRight } from "lucide-react";
export function EmptyState({ title, description, action = "了解下一步", href = "/profile" }: { title: string; description: string; action?: string; href?: string }) {
 return <div className="empty-state"><span className="empty-icon"><Sprout size={28}/></span><h3>{title}</h3><p>{description}</p><Link href={href} className="text-link">{action}<ArrowUpRight size={16}/></Link></div>;
}
