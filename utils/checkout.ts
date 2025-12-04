import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "@/lib/supabase";

export type CheckoutOptions = {
  successUrl?: string;
};

export function edgeErrorMessage(err: any): string {
  if (!err) return "Request failed";
  if (typeof err === "string") return err;
  if (err?.message) return String(err.message);
  try {
    return JSON.stringify(err);
  } catch {
    return "Request failed";
  }
}

export async function startCheckout(entryId: number, opts?: CheckoutOptions) {
  const body: any = { entry_id: entryId };
  if (opts?.successUrl) body.success_url = opts.successUrl;
  const { data, error } = await supabase.functions.invoke("stripe-checkout", { body });
  if (error) throw new Error(edgeErrorMessage(error));
  const url = (data as any)?.url as string | undefined;
  if (!url) throw new Error("No checkout URL returned");
  if (Platform.OS === "web") {
    window.location.href = url;
  } else {
    await WebBrowser.openBrowserAsync(url);
  }
}

export async function ensureEntry(userId: string, categoryId: number): Promise<number> {
  const { data: existing } = await supabase
    .from("entries")
    .select("id, payment_status")
    .eq("category_id", categoryId)
    .eq("created_by", userId)
    .limit(1)
    .maybeSingle();
  if (existing) return (existing as any).id as number;

  const { data: ins, error: insErr } = await supabase
    .from("entries")
    .insert({ category_id: categoryId, created_by: userId, payment_currency: "myr", status: "pending" })
    .select("id")
    .single();
  if (insErr) {
    const { data: after } = await supabase
      .from("entries")
      .select("id")
      .eq("category_id", categoryId)
      .eq("created_by", userId)
      .limit(1)
      .maybeSingle();
    if (after?.id) return (after as any).id as number;
    throw insErr;
  }
  const entryId = (ins as any).id as number;
  await supabase.from("entry_members").insert({ entry_id: entryId, profile_id: userId });
  return entryId;
}

export async function registerThenCheckout(userId: string, categoryId: number, opts?: CheckoutOptions) {
  const entryId = await ensureEntry(userId, categoryId);
  await startCheckout(entryId, opts);
}
