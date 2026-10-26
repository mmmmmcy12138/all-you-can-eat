import type { StockLot } from "./types";
export function sumQuantities(lots: Pick<StockLot, "current_quantity">[]) {
  return (
    lots.reduce(
      (sum, lot) => sum + Math.round(Number(lot.current_quantity) * 1000),
      0,
    ) / 1000
  );
}
export function formatQuantity(value: number) {
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 3 });
}
export function expiryState(expiresOn: string | null, today: string) {
  if (!expiresOn) return "unknown";
  if (expiresOn < today) return "expired";
  const difference =
    (Date.parse(expiresOn + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) /
    86400000;
  return difference <= 3 ? "soon" : "fresh";
}
