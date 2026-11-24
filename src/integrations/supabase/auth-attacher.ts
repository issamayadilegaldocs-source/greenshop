// Client middleware that attaches the current Supabase access token to server
// function calls. Must stay registered as a global `functionMiddleware` in
// src/start.ts, otherwise requireSupabaseAuth server functions never see a token.
import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
