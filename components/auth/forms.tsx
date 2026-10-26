"use client";
import { useActionState, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  authenticate,
  manageHousehold,
  signOut,
  type ActionState,
} from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
function Feedback({ state }: { state: ActionState }) {
  return (
    <>
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="form-success">
          {state.message}
        </p>
      )}
    </>
  );
}
export function AuthForm() {
  const [mode, setMode] = useState("login");
  const [state, action, pending] = useActionState(authenticate, {});
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="mode" value={mode} />
      {mode === "signup" && (
        <label>
          昵称
          <input
            name="display_name"
            required
            maxLength={60}
            autoComplete="nickname"
          />
        </label>
      )}
      <label>
        邮箱
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        密码
        <input
          name="password"
          type="password"
          required
          minLength={10}
          maxLength={128}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </label>
      <p className="form-hint">密码至少 10 位；注册后可能需要邮箱确认。</p>
      <Feedback state={state} />
      <Button disabled={pending}>
        {pending ? "正在处理…" : mode === "login" ? "登录" : "注册账号"}
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => setMode(mode === "login" ? "signup" : "login")}
      >
        {mode === "login" ? "还没有账号？注册" : "已有账号？登录"}
      </Button>
    </form>
  );
}
export function HouseholdForm({
  operation,
  title,
  defaultValue,
  id,
}: {
  operation: string;
  title: string;
  defaultValue?: string;
  id?: string;
}) {
  const [state, action, pending] = useActionState(manageHousehold, {});
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="operation" value={operation} />
      {id && <input type="hidden" name="id" value={id} />}
      {["create", "rename", "profile"].includes(operation) && (
        <label>
          {operation === "profile" ? "昵称" : "家庭名称"}
          <input
            name="name"
            required
            maxLength={60}
            defaultValue={defaultValue}
          />
        </label>
      )}
      {operation === "remove" && (
        <label className="checkbox-label">
          <input type="checkbox" name="confirm" value="yes" required />
          确认移除此成员，其将失去家庭访问权限
        </label>
      )}
      <Feedback state={state} />
      {state.token && (
        <div className="invitation-result">
          <label>
            邀请代码
            <textarea readOnly value={state.token} aria-label="邀请代码" />
          </label>
          <p>
            请让另一位成员登录后在「加入家庭」页面粘贴代码。代码仅在此显示，请妥善保存。
          </p>
          <Link href={`/join#invite=${state.token}`} className="text-link">
            邀请链接（复制链接地址私下分享）
          </Link>
        </div>
      )}
      <Button
        disabled={pending}
        variant={
          operation === "remove" || operation === "revoke"
            ? "outline"
            : "default"
        }
      >
        {pending ? "正在提交…" : title}
      </Button>
    </form>
  );
}
function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
function hashToken() {
  return new URLSearchParams(window.location.hash.slice(1)).get("invite") ?? "";
}
export function JoinForm() {
  const [state, action, pending] = useActionState(manageHousehold, {});
  const hash = useSyncExternalStore(subscribeHash, hashToken, () => "");
  const [typed, setTyped] = useState<string | null>(null);
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="operation" value="join" />
      <label>
        邀请代码
        <textarea
          name="token"
          required
          minLength={72}
          maxLength={72}
          autoComplete="off"
          spellCheck={false}
          value={typed ?? hash}
          onChange={(event) => setTyped(event.target.value)}
        />
      </label>
      <p className="form-hint">
        邀请 48 小时内有效，仅可使用一次。V1
        每个账号只能加入一个家庭，每个家庭最多两人。
      </p>
      <Feedback state={state} />
      <Button disabled={pending}>
        {pending ? "正在加入…" : "加入共享厨房"}
      </Button>
      <Link href="/profile" className="text-link">
        返回我的厨房
      </Link>
    </form>
  );
}
export function SignOutForm() {
  const [state, action, pending] = useActionState(signOut, {});
  return (
    <form action={action}>
      <Feedback state={state} />
      <Button variant="outline" disabled={pending}>
        退出登录
      </Button>
    </form>
  );
}
