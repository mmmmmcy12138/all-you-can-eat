import { type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { safeNext } from "@/lib/validations";
function localRedirect(path: string) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: path,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const destination = safeNext(params.get("next"));
  // Provider errors and one-time credentials never appear in our redirect URLs.
  if (params.has("error")) return localRedirect("/login?error=confirmation");
  if (!code && !tokenHash) return localRedirect("/login?error=confirmation");
  try {
    const client = await supabaseServer();
    if (tokenHash) {
      // Only email confirmation is supported here; never accept recovery or invite types.
      if (
        params.get("type") !== "email" ||
        tokenHash.length > 2048 ||
        /\s/.test(tokenHash)
      )
        return localRedirect("/login?error=confirmation");
      const { error } = await client.auth.verifyOtp({
        token_hash: tokenHash,
        type: "email",
      });
      if (!error) return localRedirect(destination);
      const {
        data: { user },
      } = await client.auth.getUser();
      return localRedirect(user ? destination : "/login?error=confirmation");
    }
    const { error } = await client.auth.exchangeCodeForSession(code!);
    if (!error) return localRedirect(destination);
    // A link opened again should preserve an already verified session.
    const {
      data: { user },
    } = await client.auth.getUser();
    if (user) return localRedirect(destination);
    if (
      error.name === "AuthPKCECodeVerifierMissingError" ||
      [
        "bad_code_verifier",
        "flow_state_not_found",
        "flow_state_expired",
      ].includes(error.code ?? "")
    )
      return localRedirect("/login?notice=confirmation-signin");
    return localRedirect("/login?error=confirmation");
  } catch {
    return localRedirect("/login?error=auth-service");
  }
}
