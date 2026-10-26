"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { PurchasePayload } from "@/lib/inventory/validation";
import { appendPurchaseDraft, type PurchaseDraft } from "@/lib/shopping/draft";
export function DraftLauncher({
  draftKey,
  payload,
  title = "加入采购核对单",
  disabled = false,
}: {
  draftKey: string;
  payload: PurchasePayload;
  title?: string;
  disabled?: boolean;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const locked = useRef(false);
  return (
    <>
      <Button
        disabled={disabled || busy}
        onClick={() => {
          if (locked.current) return;
          locked.current = true;
          try {
            const raw = sessionStorage.getItem(draftKey);
            let current: PurchaseDraft | null = null;
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                if (!parsed.requestId || !Array.isArray(parsed.payload?.items))
                  throw Error();
                current = parsed;
              } catch {
                throw new Error(
                  "当前采购草稿无法读取，请先打开采购核对单检查，不会覆盖原内容。",
                );
              }
            }
            const next = appendPurchaseDraft(
              current,
              payload,
              crypto.randomUUID(),
            );
            sessionStorage.setItem(draftKey, JSON.stringify(next));
            window.dispatchEvent(new Event("ayce-purchase-draft"));
            setBusy(true);
            router.push("/shopping/new");
          } catch (e) {
            locked.current = false;
            setError(
              e instanceof Error ? e.message : "浏览器无法保存采购草稿，请重试",
            );
          }
        }}
      >
        {busy ? "正在打开核对单…" : title}
      </Button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
