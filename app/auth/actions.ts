"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import {
  credentials,
  displayName,
  householdName,
  invitationToken,
} from "@/lib/validations";
export type ActionState = { error?: string; message?: string; token?: string };
export async function authenticate(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = credentials.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const client = await supabaseServer();
    if (form.get("mode") === "signup") {
      const name = displayName.safeParse(form.get("display_name"));
      if (!name.success) return { error: name.error.issues[0].message };
      const origin = (await headers()).get("origin");
      if (!origin) return { error: "无法确定站点地址，请重新打开登录页" };
      const { data, error } = await client.auth.signUp({
        ...parsed.data,
        options: {
          data: { display_name: name.data },
          emailRedirectTo: `${origin}/auth/callback`,
        },
      });
      if (error)
        return { error: "注册未完成，请检查邮箱格式、密码要求或稍后重试。" };
      if (!data.session)
        return {
          message:
            "请检查邮箱中的确认链接。若在其他设备确认后未自动登录，可回到此处直接登录，无需重新注册。如账号已存在，请直接登录。",
        };
    } else {
      const { error } = await client.auth.signInWithPassword(parsed.data);
      if (error) return { error: "登录失败，请检查邮箱、密码和邮箱确认状态。" };
    }
  } catch {
    return { error: "认证服务暂不可用，请检查网络或 Supabase 配置。" };
  }
  redirect("/profile");
}
export async function signOut(): Promise<ActionState> {
  try {
    const client = await supabaseServer();
    const { error } = await client.auth.signOut();
    if (error) return { error: "退出失败，请重试" };
  } catch {
    return { error: "退出失败，请检查网络" };
  }
  redirect("/login");
}
export async function manageHousehold(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const client = await supabaseServer();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return { error: "请先登录" };
    const op = form.get("operation");
    let result;
    if (op === "create" || op === "rename") {
      const name = householdName.safeParse(form.get("name"));
      if (!name.success) return { error: name.error.issues[0].message };
      result = await client.rpc(
        op === "create" ? "create_household" : "rename_household",
        { household_name: name.data },
      );
    } else if (op === "invite") {
      result = await client.rpc("create_household_invitation");
      if (!result.error) {
        revalidatePath("/profile");
        return {
          token: result.data,
          message:
            "邀请有效期 48 小时，仅可使用一次。请私下分享，新邀请会使旧邀请失效。",
        };
      }
    } else if (op === "join") {
      const token = invitationToken.safeParse(form.get("token"));
      if (!token.success) return { error: token.error.issues[0].message };
      result = await client.rpc("accept_household_invitation", {
        invitation_token: token.data,
      });
    } else if (op === "profile") {
      const name = displayName.safeParse(form.get("name"));
      if (!name.success) return { error: name.error.issues[0].message };
      result = await client
        .from("profiles")
        .update({ display_name: name.data })
        .eq("id", user.id);
    } else if (op === "remove" || op === "revoke") {
      const id = String(form.get("id"));
      if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "无效记录" };
      if (op === "remove" && form.get("confirm") !== "yes")
        return { error: "请勾选确认移除成员" };
      result = await client.rpc(
        op === "remove"
          ? "remove_household_member"
          : "revoke_household_invitation",
        op === "remove" ? { member_id: id } : { invitation_id: id },
      );
    } else return { error: "无效操作" };
    if (result?.error)
      return {
        error:
          "操作未完成。请检查权限、家庭人数、邀请有效期或数据库迁移是否已应用。",
      };
    revalidatePath("/profile");
    revalidatePath("/join");
    return { message: "操作成功，家庭信息已更新。" };
  } catch {
    return { error: "服务暂不可用，没有确认保存成功。请检查网络后重试。" };
  }
}
