import { z } from "zod";
export const credentials = z.object({
  email: z.email("请输入有效邮箱"),
  password: z.string().min(10, "密码至少 10 位").max(128, "密码最多 128 位"),
});
export const displayName = z
  .string()
  .trim()
  .min(1, "请输入昵称")
  .max(60, "昵称最多 60 字");
export const householdName = z
  .string()
  .trim()
  .min(1, "请输入家庭名称")
  .max(60, "家庭名称最多 60 字");
export const invitationToken = z
  .string()
  .regex(/^[a-f0-9-]{72}$/i, "请输入完整的邀请代码");
export function safeNext(value: string | null) {
  return value === "/join" ? "/join" : "/profile";
}
