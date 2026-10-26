import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  client: {
    auth: {
      getUser: vi.fn(),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
    rpc: vi.fn(),
  },
  revalidate: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error("redirect:" + path);
  }),
}));
vi.mock("../../lib/supabase/server", () => ({
  supabaseServer: async () => mocks.client,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "https://ayce.example" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { authenticate, manageHousehold, signOut } from "../../app/auth/actions";
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.auth.getUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
  });
});
describe("server actions fail honestly", () => {
  it("rejects invalid registration before accessing auth", async () => {
    const result = await authenticate(
      {},
      form({ email: "bad", password: "x" }),
    );
    expect(result.error).toBeTruthy();
    expect(mocks.client.auth.signUp).not.toHaveBeenCalled();
  });
  it("asks for email confirmation without pretending to log in", async () => {
    mocks.client.auth.signUp.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    const result = await authenticate(
      {},
      form({
        mode: "signup",
        email: "a@example.com",
        password: "long-password",
        display_name: "小厨师",
      }),
    );
    expect(result.message).toContain("确认链接");
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.client.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: "https://ayce.example/auth/callback",
        }),
      }),
    );
  });
  it("reports credential rejection without echoing private details", async () => {
    mocks.client.auth.signInWithPassword.mockResolvedValue({
      error: { message: "sensitive backend details" },
    });
    const result = await authenticate(
      {},
      form({ email: "a@example.com", password: "long-password" }),
    );
    expect(result.error).toContain("登录失败");
    expect(result.error).not.toContain("sensitive");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("redirects only after successful authentication", async () => {
    mocks.client.auth.signInWithPassword.mockResolvedValue({ error: null });
    await expect(
      authenticate(
        {},
        form({ email: "a@example.com", password: "long-password" }),
      ),
    ).rejects.toThrow("redirect:/profile");
  });
  it("does not report sign-out success on network failure", async () => {
    mocks.client.auth.signOut.mockRejectedValue(new Error("network"));
    expect((await signOut()).error).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated household mutation", async () => {
    mocks.client.auth.getUser.mockResolvedValue({ data: { user: null } });
    expect(
      (await manageHousehold({}, form({ operation: "create", name: "家" })))
        .error,
    ).toContain("登录");
    expect(mocks.client.rpc).not.toHaveBeenCalled();
  });
  it("does not send a client household id to the create RPC", async () => {
    mocks.client.rpc.mockResolvedValue({ error: null });
    const result = await manageHousehold(
      {},
      form({ operation: "create", name: " 我们的家 ", household_id: "forged" }),
    );
    expect(result.message).toBeTruthy();
    expect(mocks.client.rpc).toHaveBeenCalledWith("create_household", {
      household_name: "我们的家",
    });
  });
  it("requires explicit member removal confirmation", async () => {
    expect(
      (
        await manageHousehold(
          {},
          form({
            operation: "remove",
            id: "00000000-0000-4000-8000-000000000001",
          }),
        )
      ).error,
    ).toContain("确认");
    expect(mocks.client.rpc).not.toHaveBeenCalled();
  });
  it("handles expired or reused invitation as failure", async () => {
    mocks.client.rpc.mockResolvedValue({ error: { message: "expired" } });
    expect(
      (
        await manageHousehold(
          {},
          form({
            operation: "join",
            token:
              "00000000-0000-4000-8000-00000000000100000000-0000-4000-8000-000000000002",
          }),
        )
      ).error,
    ).toBeTruthy();
  });
});
