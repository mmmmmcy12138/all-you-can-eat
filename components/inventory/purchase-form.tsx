"use client";
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { recordPurchase } from "@/app/shopping/actions";
import {
  categories,
  locations,
  units,
  type PurchasePayload,
} from "@/lib/inventory/validation";
import type { Ingredient } from "@/lib/inventory/types";
import { Button } from "@/components/ui/button";
import { PurchaseImport } from "./purchase-import";
import type { ImportRow } from "@/lib/purchase-parser";
type Draft = {
  requestId: string;
  payload: PurchasePayload;
  resultId?: string;
  selected?: boolean[];
  sourceLines?: number[];
};
const blank = () => ({
  ingredient_id: "",
  name: "",
  category: "其他" as const,
  quantity: "",
  unit: "g" as const,
  total_cost: "",
  expires_on: "",
  storage_location: "冷藏" as const,
});
function subscribe(callback: () => void) {
  window.addEventListener("ayce-purchase-draft", callback);
  return () => window.removeEventListener("ayce-purchase-draft", callback);
}
export function PurchaseForm({
  ingredients,
  draftKey,
  initialRequestId,
}: {
  ingredients: Ingredient[];
  draftKey: string;
  initialRequestId: string;
}) {
  const initial = JSON.stringify({
    requestId: initialRequestId,
    payload: { purchased_on: "", store_name: "", note: "", items: [blank()] },
  } satisfies Draft);
  const [storageError, setStorageError] = useState(false);
  const serialized = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return sessionStorage.getItem(draftKey) ?? initial;
      } catch {
        return initial;
      }
    },
    () => initial,
  );
  let draft: Draft;
  try {
    const value = JSON.parse(serialized);
    if (
      !value.requestId ||
      !value.payload ||
      !Array.isArray(value.payload.items)
    )
      throw Error();
    draft = value;
  } catch {
    draft = JSON.parse(initial);
  }
  const [state, action, pending] = useActionState(recordPurchase, {});
  function save(value: Draft) {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(value));
      window.dispatchEvent(new Event("ayce-purchase-draft"));
      setStorageError(false);
      return true;
    } catch {
      setStorageError(true);
      return false;
    }
  }
  useEffect(() => {
    if (state.resultId && state.requestKey) {
      try {
        const raw = sessionStorage.getItem(draftKey);
        if (raw) {
          const current = JSON.parse(raw) as Draft;
          if (current.requestId === state.requestKey) {
            sessionStorage.setItem(
              draftKey,
              JSON.stringify({ ...current, resultId: state.resultId }),
            );
            window.dispatchEvent(new Event("ayce-purchase-draft"));
          }
        }
      } catch {
        /* The confirmed result remains visible in action state. */
      }
    }
  }, [state.resultId, state.requestKey, draftKey]);
  function updateItem(
    index: number,
    patch: Partial<PurchasePayload["items"][number]>,
  ) {
    save({
      ...draft,
      payload: {
        ...draft.payload,
        items: draft.payload.items.map((row, i) =>
          i === index ? { ...row, ...patch } : row,
        ),
      },
    });
  }
  const included = (index: number) => draft.selected?.[index] ?? true;
  const selectedItems = draft.payload.items.filter((_, index) =>
    included(index),
  );
  function importRows(rows: ImportRow[]): string | null {
    const first = draft.payload.items[0];
    const initialEmpty =
      draft.payload.items.length === 1 &&
      !first.ingredient_id &&
      !first.name &&
      !first.quantity &&
      !first.total_cost &&
      !first.expires_on &&
      first.category === "其他" &&
      first.unit === "g" &&
      first.storage_location === "冷藏" &&
      included(0);
    const kept = initialEmpty ? [] : draft.payload.items;
    if (kept.length + rows.length > 50)
      return `当前核对单已有 ${kept.length} 项，追加后超过 50 项。请移除部分商品或分成下一笔采购。`;
    const saved = save({
      ...draft,
      payload: {
        ...draft.payload,
        items: [...kept, ...rows.map((row) => row.item)],
      },
      selected: [
        ...kept.map((_, index) => included(index)),
        ...rows.map(() => true),
      ],
      sourceLines: [
        ...kept.map((_, index) => draft.sourceLines?.[index] ?? 0),
        ...rows.map((row) => row.line),
      ],
    });
    return saved
      ? null
      : "浏览器无法暂存核对单，未导入。请允许会话存储后重试。";
  }
  const completed =
    draft.resultId ??
    (state.requestKey === draft.requestId ? state.resultId : undefined);
  if (completed)
    return (
      <section className="panel empty-state">
        <h2>这笔采购，已经放进冰箱</h2>
        <p role="status">
          采购、库存批次和入库流水已保存。刷新此页不会再次提交。
        </p>
        <div className="form-actions">
          <Link
            className="button button-primary"
            href={`/shopping/history/${completed}`}
          >
            查看采购单
          </Link>
          <Link className="button button-outline" href="/fridge">
            查看库存
          </Link>
          {draft.payload.items.some((_, index) => !included(index)) && (
            <Button
              variant="outline"
              onClick={() =>
                save({
                  requestId: crypto.randomUUID(),
                  payload: {
                    ...draft.payload,
                    items: draft.payload.items.filter(
                      (_, index) => !included(index),
                    ),
                  },
                  sourceLines: draft.payload.items
                    .map((_, index) => draft.sourceLines?.[index] ?? 0)
                    .filter((_, index) => !included(index)),
                })
              }
            >
              继续处理未勾选商品
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() =>
              save({
                requestId: crypto.randomUUID(),
                payload: { ...draft.payload, note: "", items: [blank()] },
              })
            }
          >
            再记一笔采购
          </Button>
        </div>
      </section>
    );
  return (
    <>
      <PurchaseImport
        ingredients={ingredients}
        onImport={importRows}
        disabled={pending}
      />
      <h2 className="review-title">采购核对单</h2>
      <p className="form-hint" role="status">
        已勾选 {selectedItems.length} / {draft.payload.items.length}{" "}
        项入库。未勾选的商品会保留在核对单中，不提交到数据库。
      </p>
      <form
        action={action}
        className="purchase-form"
        onSubmit={(event) => {
          if (!navigator.onLine) {
            event.preventDefault();
            setStorageError(true);
            return;
          }
          try {
            sessionStorage.setItem(draftKey, JSON.stringify(draft));
          } catch {
            event.preventDefault();
            setStorageError(true);
          }
        }}
      >
        <input type="hidden" name="request_id" value={draft.requestId} />
        <input
          type="hidden"
          name="payload"
          value={JSON.stringify({ ...draft.payload, items: selectedItems })}
        />
        <fieldset disabled={pending}>
          <section className="panel form-grid">
            <label>
              采购日期
              <input
                type="date"
                required
                value={draft.payload.purchased_on}
                onChange={(e) =>
                  save({
                    ...draft,
                    payload: { ...draft.payload, purchased_on: e.target.value },
                  })
                }
              />
            </label>
            <label>
              商店（可空）
              <input
                maxLength={80}
                placeholder="例如 Costco、H Mart"
                value={draft.payload.store_name}
                onChange={(e) =>
                  save({
                    ...draft,
                    payload: { ...draft.payload, store_name: e.target.value },
                  })
                }
              />
            </label>
            <label className="span-full">
              采购备注（可空）
              <input
                maxLength={500}
                value={draft.payload.note}
                onChange={(e) =>
                  save({
                    ...draft,
                    payload: { ...draft.payload, note: e.target.value },
                  })
                }
              />
            </label>
          </section>
          {draft.payload.items.map((row, index) => (
            <section className="panel purchase-row" key={index}>
              <div className="section-heading">
                <h2>
                  商品 {index + 1}
                  {draft.sourceLines?.[index]
                    ? ` · 文本第 ${draft.sourceLines[index]} 行`
                    : ""}
                </h2>
                {draft.payload.items.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      save({
                        ...draft,
                        selected: draft.payload.items
                          .map((_, i) => included(i))
                          .filter((_, i) => i !== index),
                        sourceLines: draft.payload.items
                          .map((_, i) => draft.sourceLines?.[i] ?? 0)
                          .filter((_, i) => i !== index),
                        payload: {
                          ...draft.payload,
                          items: draft.payload.items.filter(
                            (_, i) => i !== index,
                          ),
                        },
                      })
                    }
                  >
                    移除此行
                  </Button>
                )}
              </div>
              <label className="checkbox-label import-selection">
                <input
                  type="checkbox"
                  checked={included(index)}
                  onChange={(event) =>
                    save({
                      ...draft,
                      selected: draft.payload.items.map((_, i) =>
                        i === index ? event.target.checked : included(i),
                      ),
                    })
                  }
                />
                将商品 {index + 1} 入库
              </label>
              <fieldset disabled={!included(index)}>
                <div className="form-grid">
                  <label className="span-full">
                    食材
                    <select
                      value={row.ingredient_id}
                      onChange={(e) => {
                        const food = ingredients.find(
                          (v) => v.id === e.target.value,
                        );
                        updateItem(
                          index,
                          food
                            ? {
                                ingredient_id: food.id,
                                name: food.name,
                                category: food.category as typeof row.category,
                                unit: food.base_unit as typeof row.unit,
                              }
                            : {
                                ingredient_id: "",
                                name: "",
                                category: "其他",
                                unit: "g",
                              },
                        );
                      }}
                    >
                      <option value="">新建食材 / 按名称匹配</option>
                      {ingredients.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} · {i.base_unit}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!row.ingredient_id && (
                    <>
                      <label>
                        食材名称
                        <input
                          required
                          maxLength={80}
                          value={row.name}
                          onChange={(e) =>
                            updateItem(index, { name: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        分类
                        <select
                          value={row.category}
                          onChange={(e) =>
                            updateItem(index, {
                              category: e.target.value as typeof row.category,
                            })
                          }
                        >
                          {categories.map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  <label>
                    入库数量
                    <input
                      type="number"
                      required
                      min="0.001"
                      max="1000000000"
                      step="0.001"
                      inputMode="decimal"
                      value={row.quantity}
                      onChange={(e) =>
                        updateItem(index, { quantity: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    基础单位
                    <select
                      value={row.unit}
                      disabled={!!row.ingredient_id}
                      onChange={(e) =>
                        updateItem(index, {
                          unit: e.target.value as typeof row.unit,
                        })
                      }
                    >
                      {units.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    商品行总价（USD，可空）
                    <input
                      type="number"
                      min="0"
                      max="100000000"
                      step="0.01"
                      inputMode="decimal"
                      value={row.total_cost}
                      onChange={(e) =>
                        updateItem(index, { total_cost: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    到期日期（未知留空）
                    <input
                      type="date"
                      min={draft.payload.purchased_on || undefined}
                      value={row.expires_on}
                      onChange={(e) =>
                        updateItem(index, { expires_on: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    存放位置
                    <select
                      value={row.storage_location}
                      onChange={(e) =>
                        updateItem(index, {
                          storage_location: e.target
                            .value as typeof row.storage_location,
                        })
                      }
                    >
                      {locations.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </fieldset>
            </section>
          ))}
          <div className="form-actions">
            <Button
              type="button"
              variant="outline"
              disabled={draft.payload.items.length >= 50}
              onClick={() =>
                save({
                  ...draft,
                  selected: [
                    ...draft.payload.items.map((_, i) => included(i)),
                    true,
                  ],
                  sourceLines: [
                    ...draft.payload.items.map(
                      (_, i) => draft.sourceLines?.[i] ?? 0,
                    ),
                    0,
                  ],
                  payload: {
                    ...draft.payload,
                    items: [...draft.payload.items, blank()],
                  },
                })
              }
            >
              ＋ 再加一项
            </Button>
            <Button type="submit" disabled={selectedItems.length === 0}>
              {pending ? "正在确认入库…" : "确认整单入库"}
            </Button>
          </div>
        </fieldset>
        <p className="form-hint">
          数量请使用基础单位（例如 1kg 填
          1000g）。总价是该商品整行价格，不是单价；未知价格和保质期可留空。同名食材沿用已有基础单位。
        </p>
        <p className="form-hint">
          草稿只暂存在当前浏览器标签页，不会自动提交。连接中断后请保留原内容重试，避免另建相同采购。
        </p>
        {storageError && (
          <p role="alert" className="form-error">
            当前离线或浏览器无法暂存草稿，已阻止提交。请恢复网络并允许会话存储后重试。
          </p>
        )}
        {state.error && (
          <p role="alert" className="form-error">
            {state.error}
          </p>
        )}
      </form>
    </>
  );
}
