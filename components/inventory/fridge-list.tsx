"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { categories } from "@/lib/inventory/validation";
import {
  expiryState,
  formatQuantity,
  sumQuantities,
} from "@/lib/inventory/quantities";
import type { Ingredient, StockLot } from "@/lib/inventory/types";
function subscribe(callback: () => void) {
  const timer = setInterval(callback, 60000);
  return () => clearInterval(timer);
}
export function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function FridgeList({
  ingredients,
  lots,
}: {
  ingredients: Ingredient[];
  lots: StockLot[];
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [expiry, setExpiry] = useState("");
  const today = useSyncExternalStore(subscribe, localToday, () => "");
  const filtered = ingredients
    .filter(
      (i) =>
        i.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
        (!category || i.category === category),
    )
    .filter(
      (i) =>
        !expiry ||
        lots.some(
          (l) =>
            l.ingredient_id === i.id &&
            Number(l.current_quantity) > 0 &&
            expiryState(l.expires_on, today) === expiry,
        ),
    );
  return (
    <>
      <div className="panel filter-bar">
        <label>
          搜索食材
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="输入食材名称"
          />
        </label>
        <label>
          分类
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">全部分类</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          保质期
          <select value={expiry} onChange={(e) => setExpiry(e.target.value)}>
            <option value="">全部批次</option>
            <option value="expired">已过期</option>
            <option value="soon">3 天内到期</option>
            <option value="unknown">到期日未知</option>
          </select>
        </label>
      </div>
      <p className="form-hint">
        临期按当前设备日期计算。总库存包含所有批次，过期食材会另行标记，不等于推荐食用量。
      </p>
      <div className="inventory-grid">
        {filtered.map((food) => {
          const batches = lots.filter((l) => l.ingredient_id === food.id);
          const positive = batches.filter(
            (l) => Number(l.current_quantity) > 0,
          );
          const expired = positive.filter(
            (l) => expiryState(l.expires_on, today) === "expired",
          );
          const soon = positive.filter(
            (l) => expiryState(l.expires_on, today) === "soon",
          );
          return (
            <Link
              key={food.id}
              href={`/fridge/${food.id}`}
              className="panel inventory-card"
            >
              <span className="eyebrow">{food.category}</span>
              <h2>{food.name}</h2>
              <p className="inventory-quantity">
                {formatQuantity(sumQuantities(batches))}
                <small> {food.base_unit}</small>
              </p>
              <p>{positive.length} 个有库存批次</p>
              {today && expired.length > 0 && (
                <span className="inventory-badge danger">
                  {expired.length} 批已过期，请检查
                </span>
              )}
              {today && soon.length > 0 && (
                <span className="inventory-badge">
                  {soon.length} 批即将到期
                </span>
              )}
              <span className="text-link">查看批次与流水 →</span>
            </Link>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <section className="panel empty-state">
          <h2>
            {ingredients.length
              ? "没有符合条件的食材"
              : "冰箱准备好了，等你放入第一份新鲜"}
          </h2>
          <p>
            {ingredients.length
              ? "试试其他搜索词或筛选条件。"
              : "录入采购后，这里会显示真实库存。"}
          </p>
          {!ingredients.length && (
            <Link className="button button-primary" href="/shopping/new">
              记一笔采购
            </Link>
          )}
        </section>
      )}
    </>
  );
}
