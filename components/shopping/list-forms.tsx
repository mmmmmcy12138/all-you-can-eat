"use client";
import { useActionState, useState } from "react";
import { manageShopping } from "@/app/shopping/list/actions";
import { categories, units } from "@/lib/inventory/validation";
import type { Ingredient } from "@/lib/inventory/types";
import type { ShoppingItem } from "@/lib/shopping/types";
import { Button } from "@/components/ui/button";
export function AddShoppingForm({
  ingredients,
  requestId,
}: {
  ingredients: Ingredient[];
  requestId: string;
}) {
  const [state, action, pending] = useActionState(manageShopping, {});
  const [key, setKey] = useState(requestId);
  const [ingredientId, setIngredientId] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("其他");
  const [unit, setUnit] = useState("个");
  const [quantity, setQuantity] = useState("");
  const food = ingredients.find((i) => i.id === ingredientId);
  if (state.resultId && state.requestKey === key)
    return (
      <section className="panel">
        <p className="form-success" role="status">
          {state.message}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setKey(crypto.randomUUID());
            setIngredientId("");
            setName("");
            setCategory("其他");
            setUnit("个");
            setQuantity("");
          }}
        >
          继续添加需求
        </Button>
      </section>
    );
  return (
    <form action={action} className="panel form-stack" key={key}>
      <h2>添加待买商品</h2>
      <input type="hidden" name="request_id" value={key} />
      <input type="hidden" name="operation" value="add" />
      <fieldset disabled={pending}>
        <div className="form-grid">
          <label className="span-full">
            选择食材
            <select
              name="ingredient_id"
              value={ingredientId}
              onChange={(e) => setIngredientId(e.target.value)}
            >
              <option value="">按名称添加新需求</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · {i.base_unit}
                </option>
              ))}
            </select>
          </label>
          {food ? (
            <>
              <input type="hidden" name="name" value={food.name} />
              <input type="hidden" name="category" value={food.category} />
              <input type="hidden" name="unit" value={food.base_unit} />
              <p className="form-hint span-full">
                沿用食材：{food.name} · {food.category} · {food.base_unit}
              </p>
            </>
          ) : (
            <>
              <label>
                商品名称
                <input
                  name="name"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                分类
                <select
                  name="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                基础单位
                <select
                  name="unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                >
                  {units.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label>
            还需要购买的数量
            <input
              name="quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              type="number"
              required
              min="0.001"
              max="1000000000"
              step="0.001"
              inputMode="decimal"
            />
          </label>
        </div>
        <Button>{pending ? "正在加入…" : "加入共享清单"}</Button>
      </fieldset>
      <p className="form-hint">
        同名商品会合并，待买量取两次需求的较大值，不相加。不需要额外购买时请不要重复增加数量。
      </p>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
export function ChangeShoppingForm({
  item,
  requestId,
}: {
  item: ShoppingItem;
  requestId: string;
}) {
  const [state, action, pending] = useActionState(manageShopping, {});
  const [key] = useState(requestId);
  const [remaining, setRemaining] = useState(
    String(
      Math.round(
        (Number(item.quantity) - Number(item.stocked_quantity)) * 1000,
      ) / 1000,
    ),
  );
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="request_id" value={key} />
      <input type="hidden" name="operation" value="change" />
      <input type="hidden" name="item_id" value={item.id} />
      <input type="hidden" name="expected_version" value={item.version} />
      <fieldset disabled={pending}>
        <label>
          还需要购买（{item.unit}）
          <input
            name="remaining_quantity"
            type="number"
            min="0.001"
            max="1000000000"
            step="0.001"
            required
            value={remaining}
            onChange={(e) => setRemaining(e.target.value)}
          />
        </label>
        <div className="form-actions">
          <Button name="item_action" value="quantity" variant="outline">
            保存数量
          </Button>
          <Button
            name="item_action"
            value={item.status === "purchased" ? "open" : "purchased"}
          >
            {item.status === "purchased" ? "改回待买" : "标记已买（未入库）"}
          </Button>
          <Button name="item_action" value="cancel" variant="outline">
            移除此需求
          </Button>
        </div>
      </fieldset>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="form-success" role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
