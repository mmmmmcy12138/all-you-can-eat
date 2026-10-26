import { describe, it, expect, afterEach } from "vitest";
import {
  credentials,
  displayName,
  householdName,
  invitationToken,
  safeNext,
} from "../../lib/validations";
import { supabaseConfig } from "../../lib/supabase/config";
describe("auth inputs", () => {
  it("rejects malformed email and weak passwords", () => {
    expect(
      credentials.safeParse({ email: "x", password: "short" }).success,
    ).toBe(false);
    expect(
      credentials.safeParse({
        email: "a@example.com",
        password: "long-password",
      }).success,
    ).toBe(true);
  });
  it("trims names and rejects empty or overlong values", () => {
    expect(displayName.parse("  小厨师  ")).toBe("小厨师");
    expect(householdName.safeParse(" ").success).toBe(false);
    expect(displayName.safeParse("a".repeat(61)).success).toBe(false);
  });
  it("requires the entire invitation code", () => {
    expect(invitationToken.safeParse("x").success).toBe(false);
    expect(
      invitationToken.safeParse(
        "00000000-0000-4000-8000-00000000000100000000-0000-4000-8000-000000000002",
      ).success,
    ).toBe(true);
  });
  it("never allows an arbitrary redirect URL", () => {
    for (const next of [
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      null,
      "/profile?next=evil",
    ])
      expect(safeNext(next)).toBe("/profile");
    expect(safeNext("/join")).toBe("/join");
  });
});
describe("Supabase configuration", () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
    previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  afterEach(() => {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined)
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
  });
  it("returns unconfigured without both fields", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(supabaseConfig()).toBeNull();
  });
  it("rejects insecure remote auth endpoints", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://example.com";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "public-key";
    expect(supabaseConfig()).toBeNull();
  });
});
