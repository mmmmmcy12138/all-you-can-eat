"use client";
import { useActionState, useState } from "react";
import { clearInventory } from "@/app/shopping/actions";
import { Button } from "@/components/ui/button";
export function ClearStock({
  fingerprint,
  lotCount,
  requestId,
}: {
  fingerprint: string;
  lotCount: number;
  requestId: string;
}) {
  const [state, action, pending] = useActionState(clearInventory, {});
  const [key] = useState(requestId);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("盘点清空当前库存");
  const [offline, setOffline] = useState(false);
  if (state.resultId && state.requestKey === key)
    return (
      <section className="panel clear-stock-panel">
        <p role="status" className="form-success">
          {state.message}
        </p>
        <p className="form-hint">采购历史、批次和操作流水仍然保留。</p>
      </section>
    );
  return (
    <section className="panel clear-stock-panel">
      <details>
        <summary>清空当前库存</summary>
        <p>
          会将整个家庭的 {lotCount}{" "}
          个有库存批次归零，两位成员都会受影响。采购历史和食材目录保留，每个批次会记录清空流水。此操作不能一键撤销。
        </p>
        {!lotCount ? (
          <p className="form-hint">当前没有需要清空的库存。</p>
        ) : (
          <form
            action={action}
            className="form-stack"
            onSubmit={(event) => {
              if (!navigator.onLine) {
                event.preventDefault();
                setOffline(true);
                return;
              }
              setOffline(false);
            }}
          >
            <input type="hidden" name="request_id" value={key} />
            <input
              type="hidden"
              name="expected_fingerprint"
              value={fingerprint}
            />
            <fieldset disabled={pending}>
              <label>
                清空原因
                <input
                  name="clear_reason"
                  required
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <label>
                输入“清空库存”确认
                <input
                  name="confirmation"
                  autoComplete="off"
                  required
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </label>
              <Button
                className="button-danger"
                disabled={confirmation !== "清空库存" || !reason.trim()}
              >
                {pending ? "正在清空…" : "确认清空当前库存"}
              </Button>
            </fieldset>
            {offline && (
              <p role="alert" className="form-error">
                当前离线，未提交清空。请恢复网络后重试。
              </p>
            )}
            {state.error && (
              <p role="alert" className="form-error">
                {state.error}
              </p>
            )}
            <p className="form-hint">
              若库存被另一位成员更新，会阻止清空并要求刷新重确认。网络结果不确定时，请勿新建操作，保留此页重试。
            </p>
          </form>
        )}
      </details>
    </section>
  );
}
