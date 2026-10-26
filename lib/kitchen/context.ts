import { cache } from "react";
import { supabaseConfig } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";
export type KitchenContext =
  | {
      status: "unconfigured" | "signed-out" | "no-household" | "error";
      message: string;
    }
  | {
      status: "ready";
      householdId: string;
      householdName: string;
      displayName: string;
      members: number;
      userId: string;
    };
export const kitchenContext = cache(async (): Promise<KitchenContext> => {
  if (!supabaseConfig())
    return {
      status: "unconfigured",
      message: "尚未配置厨房连接，请先完成 Supabase 配置。",
    };
  try {
    const client = await supabaseServer();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError")
      return { status: "error", message: "暂时无法验证登录状态，请稍后重试。" };
    if (!user)
      return {
        status: "signed-out",
        message: "登录自己的账号，与另一半共享厨房。",
      };
    const [profile, member] = await Promise.all([
      client.from("profiles").select("display_name").eq("id", user.id).single(),
      client
        .from("household_members")
        .select("household_id")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    if (profile.error || member.error)
      return {
        status: "error",
        message: "个人或家庭资料读取失败，请稍后重试。",
      };
    if (!member.data)
      return {
        status: "no-household",
        message: "创建一个家庭，或用邀请代码加入另一半的厨房。",
      };
    const [house, members] = await Promise.all([
      client
        .from("households")
        .select("name")
        .eq("id", member.data.household_id)
        .single(),
      client
        .from("household_members")
        .select("id", { count: "exact", head: true })
        .eq("household_id", member.data.household_id),
    ]);
    if (house.error || members.error)
      return { status: "error", message: "家庭资料读取失败，请稍后重试。" };
    return {
      status: "ready",
      householdId: member.data.household_id,
      householdName: house.data.name,
      displayName: profile.data.display_name || "小厨师",
      members: members.count ?? 0,
      userId: user.id,
    };
  } catch {
    return {
      status: "error",
      message: "厨房服务暂时无法连接，请检查网络后重试。",
    };
  }
});
