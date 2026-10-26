"use client";
import { useActionState, useState } from "react";
import { adjustStock } from "@/app/shopping/actions";
import { Button } from "@/components/ui/button";
export function AdjustForm({
  lotId,
  quantity,
  unit,
  requestId,
}: {
  lotId: string;
  quantity: number;
  unit: string;
  requestId: string;
}) {
  const [state, action, pending] = useActionState(adjustStock, {});
  const [key, setKey] = useState(requestId);
  if (state.resultId && state.requestKey === key)
    return (
      <div>
        <p className="form-success" role="status">
          库存已调整，并记录了流水。
        </p>
        <Button variant="outline" onClick={() => setKey(crypto.randomUUID())}>
          再次调整此批次
        </Button>
      </div>
    );
  return (
    <form
      action={action}
      className="form-stack"
      onSubmit={(e) => {
        if (!navigator.onLine) e.preventDefault();
      }}
    >
      <input type="hidden" name="request_id" value={key} />
      <input type="hidden" name="lot_id" value={lotId} />
      <input type="hidden" name="expected_quantity" value={quantity} />
      <fieldset disabled={pending}>
        <div className="form-grid">
          <label>
            调整后数量（{unit}）
            <input
              type="number"
              name="new_quantity"
              required
              min="0"
              max="1000000000"
              step="0.001"
              defaultValue={quantity}
            />
          </label>
          <label>
            类型
            <select name="movement_kind">
              <option value="ADJUSTMENT">盘点调整</option>
              <option value="WASTE">报损（只能减少）</option>
            </select>
          </label>
          <label className="span-full">
            原因
            <input
              name="movement_note"
              required
              maxLength={500}
              placeholder="例如：盘点校正 / 食材变质"
            />
          </label>
        </div>
        <Button>确认调整并记录流水</Button>
      </fieldset>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <p className="form-hint">
        调整的是这个批次的剩余数量，不是增加或减少的数量。
      </p>
    </form>
  );
}
