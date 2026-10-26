export type Ingredient = {
  id: string;
  name: string;
  name_en?: string | null;
  category: string;
  base_unit: string;
};
export type StockLot = {
  id: string;
  ingredient_id: string;
  current_quantity: number;
  initial_quantity: number;
  unit: string;
  expires_on: string | null;
  purchased_on: string;
  storage_location: string;
  source: string;
  total_cost: number | null;
  created_at: string;
};
export type StockMovement = {
  id: string;
  stock_lot_id: string;
  actor_id: string;
  kind: string;
  quantity_delta: number;
  quantity_after: number;
  note: string;
  created_at: string;
};
