"use client";

import { createClient } from "@supabase/supabase-js";

type RuntimeConfig = { url?: string; anonKey?: string };

declare global {
  interface Window {
    __NAVIWORK_SUPABASE__?: RuntimeConfig;
  }
}

function getConfig() {
  const runtime = typeof window === "undefined" ? undefined : window.__NAVIWORK_SUPABASE__;
  return {
    url: runtime?.url ?? import.meta.env.VITE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: runtime?.anonKey ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  };
}

let client: ReturnType<typeof createClient> | null = null;

export function isSupabaseConfigured() {
  const { url, anonKey } = getConfig();
  return Boolean(url && anonKey);
}

export function getSupabaseBrowser() {
  const { url, anonKey } = getConfig();
  if (!url || !anonKey) return null;
  client ??= createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
  });
  return client;
}
