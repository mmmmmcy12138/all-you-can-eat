import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  exchange: vi.fn(),
  verify: vi.fn(),
  user: vi.fn(),
}));
vi.mock("../../lib/supabase/server", () => ({
  supabaseServer: async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchange,
      verifyOtp: mocks.verify,
      getUser: mocks.user,
    },
  }),
}));
import { GET } from "../../app/auth/callback/route";
function request(query: string) {
  return GET(new NextRequest("https://ayce.example/auth/callback" + query));
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ data: { user: null } });
});
describe("email confirmation recovery", () => {
  it("handles cross-device missing verifier without claiming email is invalid", async () => {
    mocks.exchange.mockResolvedValue({
      error: { name: "AuthPKCECodeVerifierMissingError" },
    });
    const response = await request("?code=private-code");
    expect(response.headers.get("location")).toBe(
      "/login?notice=confirmation-signin",
    );
    expect(response.headers.get("location")).not.toContain("private-code");
  });
  it("handles a missing flow state as a recoverable login", async () => {
    mocks.exchange.mockResolvedValue({
      error: { code: "flow_state_not_found" },
    });
    expect((await request("?code=private")).headers.get("location")).toBe(
      "/login?notice=confirmation-signin",
    );
  });
  it("continues to exchange normal PKCE codes", async () => {
    mocks.exchange.mockResolvedValue({ error: null });
    expect(
      (await request("?code=private&next=//evil.test")).headers.get("location"),
    ).toBe("/profile");
    expect(mocks.exchange).toHaveBeenCalledWith("private");
  });
  it("verifies email token hashes without the original-browser verifier", async () => {
    mocks.verify.mockResolvedValue({ error: null });
    const token = "pkce_" + "a".repeat(56);
    const response = await request("?token_hash=" + token + "&type=email");
    expect(mocks.verify).toHaveBeenCalledWith({
      token_hash: token,
      type: "email",
    });
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("/profile");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("never accepts recovery tokens as email confirmation", async () => {
    const response = await request(
      "?token_hash=" + "a".repeat(64) + "&type=recovery",
    );
    expect(response.headers.get("location")).toBe("/login?error=confirmation");
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("rejects malformed tokens before sending them to Supabase", async () => {
    await request("?token_hash=bad%0Atoken&type=email");
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("does not pretend an expired token was verified", async () => {
    mocks.verify.mockResolvedValue({ error: { code: "otp_expired" } });
    expect(
      (
        await request("?token_hash=" + "a".repeat(64) + "&type=email")
      ).headers.get("location"),
    ).toBe("/login?error=confirmation");
  });
  it("preserves an already verified session when a link is reused", async () => {
    mocks.exchange.mockResolvedValue({
      error: { code: "flow_state_not_found" },
    });
    mocks.user.mockResolvedValue({ data: { user: { id: "verified-user" } } });
    expect((await request("?code=old")).headers.get("location")).toBe(
      "/profile",
    );
  });
  it("does not expose provider errors or credentials in redirects", async () => {
    const response = await request(
      "?error=access_denied&error_description=private-details",
    );
    expect(response.headers.get("location")).toBe("/login?error=confirmation");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it("distinguishes service failures from expired links", async () => {
    mocks.exchange.mockRejectedValue(new Error("private-details"));
    expect((await request("?code=private")).headers.get("location")).toBe(
      "/login?error=auth-service",
    );
  });
});
