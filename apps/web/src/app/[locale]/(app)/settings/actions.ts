"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UpdateUserInput } from "@cantaia/core/models";

export async function updateProfileAction(data: UpdateUserInput) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Use admin client to bypass RLS — the users table RLS policy references
  // itself (SELECT organization_id FROM users WHERE id = auth.uid()), which
  // causes "infinite recursion detected in policy" on UPDATE via regular client.
  const admin = createAdminClient();

  // Fetch current DB values so we never wipe fields with empty strings.
  // This handles the case where LanguageSection only passes preferred_language
  // but first_name/last_name come from user_metadata which may be empty.
  const { data: currentProfile } = await (admin as any)
    .from("users")
    .select("first_name, last_name, phone, preferred_language, job_title, age_range, gender")
    .eq("id", user.id)
    .maybeSingle();

  // Merge: use provided value if non-empty, otherwise keep DB value
  const merged = {
    first_name: data.first_name || currentProfile?.first_name || "",
    last_name: data.last_name || currentProfile?.last_name || "",
    phone: data.phone || currentProfile?.phone || "",
    preferred_language: data.preferred_language || currentProfile?.preferred_language || "fr",
    job_title: data.job_title !== undefined ? (data.job_title || currentProfile?.job_title || "") : currentProfile?.job_title,
    age_range: data.age_range !== undefined ? (data.age_range || currentProfile?.age_range || null) : currentProfile?.age_range,
    gender: data.gender !== undefined ? (data.gender || currentProfile?.gender || null) : currentProfile?.gender,
  };

  // Update Supabase Auth user metadata
  const { error: authError } = await supabase.auth.updateUser({
    data: {
      first_name: merged.first_name,
      last_name: merged.last_name,
      phone: merged.phone,
      preferred_language: merged.preferred_language,
      job_title: merged.job_title,
      age_range: merged.age_range,
      gender: merged.gender,
    },
  });

  if (authError) {
    return { error: authError.message };
  }

  // Update user row in database
  const updateData: Record<string, unknown> = {
    first_name: merged.first_name,
    last_name: merged.last_name,
    phone: merged.phone,
    preferred_language: merged.preferred_language,
  };
  if (merged.job_title !== undefined) updateData.job_title = merged.job_title;
  if (merged.age_range !== undefined) updateData.age_range = merged.age_range;
  if (merged.gender !== undefined) updateData.gender = merged.gender;

  const { error: dbError } = await (admin as any)
    .from("users")
    .update(updateData)
    .eq("id", user.id);

  if (dbError) {
    return { error: dbError.message };
  }

  return { success: true };
}
