export type ShoppingItem = {
  id: string;
  ingredient_id: string | null;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  stocked_quantity: number;
  status: "open" | "purchased" | "stocked" | "cancelled";
  version: number;
  created_at: string;
  updated_at: string;
};
