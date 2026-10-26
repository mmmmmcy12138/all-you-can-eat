"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  Refrigerator,
  Clock3,
  Utensils,
  ShoppingBasket,
  ArrowRight,
} from "lucide-react";
import { expiryState } from "@/lib/inventory/quantities";
import type { StockLot } from "@/lib/inventory/types";
import { localToday } from "./fridge-list";
function subscribe(callback: () => void) {
  const id = setInterval(callback, 60000);
  return () => clearInterval(id);
}
export function HomeStats({
  lots,
  available,
}: {
  lots: StockLot[];
  available: boolean;
}) {
  const today = useSyncExternalStore(subscribe, localToday, () => "");
  const positive = lots.filter((l) => Number(l.current_quantity) > 0);
  const count = new Set(positive.map((l) => l.ingredient_id)).size;
  const soon = positive.filter(
    (l) => expiryState(l.expires_on, today) === "soon",
  ).length;
  const stats = [
    {
      icon: Refrigerator,
      title: "冰箱库存",
      value: available ? `${count} 种` : "—",
      note: available ? "来自真实批次记录" : "登录并加入家庭后查看",
      href: "/fridge",
      tone: "sage",
    },
    {
      icon: Clock3,
      title: "临期批次",
      value: available && today ? `${soon} 批` : "—",
      note: "未来 3 天内到期（含今天）",
      href: "/fridge",
      tone: "orange",
    },
    {
      icon: Utensils,
      title: "今日菜单",
      value: "待开放",
      note: "菜谱与用餐计划即将到来",
      href: "/menu",
      tone: "sage",
    },
    {
      icon: ShoppingBasket,
      title: "采购记录",
      value: available ? "去记录" : "—",
      note: "采购清单功能尚未开放",
      href: "/shopping",
      tone: "rose",
    },
  ];
  return (
    <section className="stats" aria-label="厨房概览">
      {stats.map(({ icon: Icon, title, value, note, href, tone }) => (
        <Link key={title} href={href} className="stat-card">
          <span className={`stat-icon ${tone}`}>
            <Icon size={21} />
          </span>
          <div>
            <h2>{title}</h2>
            <p className="stat-value">{value}</p>
            <p className="stat-note">{note}</p>
          </div>
          <ArrowRight size={16} className="stat-arrow" />
        </Link>
      ))}
    </section>
  );
}
