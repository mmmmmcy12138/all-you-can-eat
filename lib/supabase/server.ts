import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "./config";
export async function supabaseServer() {
  const config = supabaseConfig();
  if (!config) throw new Error("请先配置 Supabase 环境变量");
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => {
        try {
          for (const { name, value, options } of items)
            store.set(name, value, options);
        } catch {
          /* Server Components cannot write; proxy refreshes cookies. */
        }
      },
    },
  });
}
