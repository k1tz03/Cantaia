"use server";

import { createClient } from "@/lib/supabase/server";
import type { UpdateUserInput } from "@cantaia/core/models";

export async function updateProfileAction(data: UpdateUserInput) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Update Supabase Auth user metadata
  const { error: authError } = await supabase.auth.updateUser({
    data: {
      first_name: data.first_name,
      last_name: data.last_name,
      phone: data.phone,
      preferred_language: data.preferred_language,
    },
  });

  if (authError) {
    return { error: authError.message };
  }

  // Update user row in database
  // Note: type assertion needed due to @supabase/ssr v0.5.2 / supabase-js v2.95.3 generic mismatch
  const { error: dbError } = await (supabase as any)
    .from("users")
    .update({
      first_name: data.first_name,
      last_name: data.last_name,
      phone: data.phone,
      preferred_language: data.preferred_language,
    })
    .eq("id", user.id);

  if (dbError) {
    return { error: dbError.message };
  }

  return { success: true };
}
