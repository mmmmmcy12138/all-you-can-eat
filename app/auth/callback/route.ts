import { type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { safeNext } from "@/lib/validations";
function localRedirect(path: string) {
  // Relative redirects retain the browser's public origin behind reverse proxies.
  return new Response(null, {
    status: 303,
    headers: { Location: path, "Cache-Control": "no-store" },
  });
}
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    try {
      const client = await supabaseServer();
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error)
        return localRedirect(
          safeNext(request.nextUrl.searchParams.get("next")),
        );
    } catch {}
  }
  return localRedirect("/login?error=confirmation");
}
