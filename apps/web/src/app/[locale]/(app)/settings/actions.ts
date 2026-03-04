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
      job_title: data.job_title,
      age_range: data.age_range,
      gender: data.gender,
    },
  });

  if (authError) {
    return { error: authError.message };
  }

  // Update user row in database
  // Note: type assertion needed due to @supabase/ssr v0.5.2 / supabase-js v2.95.3 generic mismatch
  const updateData: Record<string, unknown> = {
    first_name: data.first_name,
    last_name: data.last_name,
    phone: data.phone,
    preferred_language: data.preferred_language,
  };
  // Only include extra fields if they are present (migration 041 may not be applied yet)
  if (data.job_title !== undefined) updateData.job_title = data.job_title;
  if (data.age_range !== undefined) updateData.age_range = data.age_range;
  if (data.gender !== undefined) updateData.gender = data.gender;

  const { error: dbError } = await (supabase as any)
    .from("users")
    .update(updateData)
    .eq("id", user.id);

  if (dbError) {
    return { error: dbError.message };
  }

  return { success: true };
}
