"use client";
import { useRef, useState } from "react";
import type { Ingredient } from "@/lib/inventory/types";
import {
  parsePurchaseText,
  type ImportResult,
  type ImportRow,
} from "@/lib/purchase-parser";
import { Button } from "@/components/ui/button";
export function PurchaseImport({
  ingredients,
  onImport,
  disabled = false,
}: {
  ingredients: Ingredient[];
  onImport: (rows: ImportRow[]) => string | null;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);
  const locked = useRef(false);
  return (
    <section className="panel import-panel">
      <fieldset disabled={disabled}>
        <h2>粘贴小票文字</h2>
        <p className="form-hint">
          每行四列：食材名称 | 数量 | 单位 |
          商品行总价（USD）。没有价格时保留最后一个竖线，第四列留空。
        </p>
        <label className="import-label">
          采购文字
          <textarea
            maxLength={20000}
            rows={6}
            placeholder={
              "鸡蛋 | 12 | 个 | 4.99\n牛肉 | 0.68 | kg | 11.49\n番茄 | 4 | 个 | 2.99"
            }
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setResult(null);
              setError("");
              setApplied(false);
              locked.current = false;
            }}
          />
        </label>
        <p className="form-hint">
          支持中文/英文名称、kg → g 和 L → ml
          的精确换算。不会识别图片或猜测保质期，空白行不作商品。
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setResult(parsePurchaseText(text, ingredients));
            setError("");
          }}
        >
          解析并检查
        </Button>
        {result && (
          <div className="import-results">
            <p role="status">
              识别 {result.sourceCount} 个商品行，{result.rows.length}{" "}
              行通过校验；{result.issues.length} 个问题。
              {result.blankCount > 0
                ? ` 空白行 ${result.blankCount} 行未作为商品。`
                : ""}
            </p>
            {result.issues.length > 0 && (
              <div className="form-error" role="alert">
                <strong>
                  请修正以下内容后重新解析，当前不会导入任何一行。
                </strong>
                <ul>
                  {result.issues.map((issue, index) => (
                    <li key={index}>
                      {issue.line ? `第 ${issue.line} 行：` : ""}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.issues.length === 0 && (
              <>
                <ul className="import-preview">
                  {result.rows.map((row) => (
                    <li key={row.line}>
                      <div>
                        <strong>
                          第 {row.line} 行 · {row.item.name}
                        </strong>
                        <span className="inventory-badge">
                          {row.matched ? "已匹配现有食材" : "待新建食材"}
                        </span>
                      </div>
                      <p>
                        {row.item.quantity} {row.item.unit} ·{" "}
                        {row.item.total_cost === ""
                          ? "价格未知"
                          : `商品行总价 $${Number(row.item.total_cost).toFixed(2)}`}
                        {row.originalUnit !== row.item.unit
                          ? `（原单位 ${row.originalUnit}）`
                          : ""}
                      </p>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  disabled={applied}
                  onClick={() => {
                    if (locked.current) return;
                    locked.current = true;
                    const issue = onImport(result.rows);
                    if (issue) {
                      locked.current = false;
                      setError(issue);
                    } else {
                      setApplied(true);
                      setError("");
                    }
                  }}
                >
                  {applied
                    ? "已加入核对单"
                    : `将 ${result.rows.length} 项加入核对单`}
                </Button>
                <p className="form-hint">
                  这一步仅填入下方核对单，不会写入数据库。已有商品会保留，除初始空白行外采用追加方式。
                </p>
              </>
            )}
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {applied && (
          <p role="status" className="form-success">
            已加入下方核对单。请检查分类、日期、存放位置并勾选要入库的商品，再确认整单入库。
          </p>
        )}
      </fieldset>
    </section>
  );
}
