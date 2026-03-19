"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { z } from "zod"
import { getSessionFromCookies } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const updateUserSchema = z.object({
  profileId: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  birthYear: z.coerce.number().min(1900).max(new Date().getFullYear()),
  annualSalary: z.coerce.number().min(0),
  bonusEstimate: z.coerce.number().min(0).default(0),
  payFrequency: z.enum(["monthly", "bi-monthly", "weekly"]),
  employeeCpfRate: z.coerce.number().min(0).max(100).optional().nullable(),
})

export type UpdateUserState = {
  success?: boolean
  error?: string
}

export async function updateUserProfile(
  prevState: UpdateUserState,
  formData: FormData
): Promise<UpdateUserState> {
  try {
    const cookieStore = await cookies()
    const householdId = await getSessionFromCookies(cookieStore)
    if (!householdId) {
      return { error: "Unauthorized" }
    }

    const data = {
      profileId: formData.get("profileId"),
      name: formData.get("name"),
      birthYear: formData.get("birthYear"),
      annualSalary: formData.get("annualSalary"),
      bonusEstimate: formData.get("bonusEstimate"),
      payFrequency: formData.get("payFrequency"),
      employeeCpfRate: formData.get("employeeCpfRate") ? formData.get("employeeCpfRate") : null,
    }

    const parsed = updateUserSchema.safeParse(data)
    if (!parsed.success) {
      return { error: "Invalid form data. Please check your inputs." }
    }

    const {
      profileId,
      name,
      birthYear,
      annualSalary,
      bonusEstimate,
      payFrequency,
      employeeCpfRate,
    } = parsed.data

    const supabase = createSupabaseAdmin()

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, family_id")
      .eq("id", profileId)
      .single()

    if (!profile) {
      return { error: "Profile not found or unauthorized." }
    }

    const { data: family } = await supabase
      .from("families")
      .select("id")
      .eq("id", profile.family_id)
      .eq("household_id", householdId)
      .single()

    if (!family) {
      return { error: "Profile not found or unauthorized." }
    }

    // Update profile
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ name, birth_year: birthYear })
      .eq("id", profileId)

    if (profileError) {
      console.error("Error updating profile:", profileError)
      return { error: "Failed to update profile details." }
    }

    // Update or insert income config
    const { data: existingIncomeConfig } = await supabase
      .from("income_config")
      .select("id")
      .eq("profile_id", profileId)
      .single()

    if (existingIncomeConfig) {
      const { error: incomeError } = await supabase
        .from("income_config")
        .update({
          annual_salary: annualSalary,
          bonus_estimate: bonusEstimate,
          pay_frequency: payFrequency,
          employee_cpf_rate: employeeCpfRate,
        })
        .eq("profile_id", profileId)

      if (incomeError) {
        console.error("Error updating income config:", incomeError)
        return { error: "Failed to update income configuration." }
      }
    } else {
      const { error: incomeInsertError } = await supabase
        .from("income_config")
        .insert({
          profile_id: profileId,
          annual_salary: annualSalary,
          bonus_estimate: bonusEstimate,
          pay_frequency: payFrequency,
          employee_cpf_rate: employeeCpfRate,
        })
        
      if (incomeInsertError) {
        console.error("Error inserting income config:", incomeInsertError)
        return { error: "Failed to update income configuration." }
      }
    }

    revalidatePath("/settings")
    revalidatePath("/settings/users")
    revalidatePath("/dashboard")
    revalidatePath("/dashboard/tax")

    return { success: true }
  } catch (err) {
    console.error("Error in updateUserProfile:", err)
    return { error: "An unexpected error occurred." }
  }
}

export type CreateProfileState = {
  success?: boolean
  error?: string
}

const createProfileSchema = z.object({
  familyId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(50),
  birthYear: z.coerce.number().min(1900).max(new Date().getFullYear()),
})

export async function createProfile(
  prevState: CreateProfileState,
  formData: FormData
): Promise<CreateProfileState> {
  try {
    const cookieStore = await cookies()
    const householdId = await getSessionFromCookies(cookieStore)
    if (!householdId) {
      return { error: "Unauthorized" }
    }

    const data = {
      familyId: formData.get("familyId"),
      name: formData.get("name"),
      birthYear: formData.get("birthYear"),
    }

    const parsed = createProfileSchema.safeParse(data)
    if (!parsed.success) {
      return { error: "Invalid form data. Please check your inputs." }
    }

    const { familyId, name, birthYear } = parsed.data
    const supabase = createSupabaseAdmin()

    const { data: family } = await supabase
      .from("families")
      .select("id")
      .eq("id", familyId)
      .eq("household_id", householdId)
      .single()

    if (!family) {
      return { error: "Family not found or unauthorized." }
    }

    const { data: newProfile, error: profileError } = await supabase
      .from("profiles")
      .insert({
        family_id: familyId,
        name: name.trim(),
        birth_year: birthYear,
      })
      .select("id")
      .single()

    if (profileError || !newProfile) {
      console.error("Error creating profile:", profileError)
      return { error: "Failed to create profile." }
    }

    const { error: incomeError } = await supabase.from("income_config").insert({
      profile_id: newProfile.id,
      annual_salary: 0,
      bonus_estimate: 0,
      pay_frequency: "monthly",
      employee_cpf_rate: null,
    })

    if (incomeError) {
      console.error("Error creating income config:", incomeError)
      return { error: "Profile created but income config failed." }
    }

    revalidatePath("/settings")
    revalidatePath("/settings/users")
    revalidatePath("/dashboard")

    return { success: true }
  } catch (err) {
    console.error("Error in createProfile:", err)
    return { error: "An unexpected error occurred." }
  }
}

export type DeleteUserState = {
  success?: boolean
  error?: string
}

export async function deleteUserProfile(
  prevState: DeleteUserState,
  formData: FormData
): Promise<DeleteUserState> {
  try {
    const cookieStore = await cookies()
    const householdId = await getSessionFromCookies(cookieStore)
    if (!householdId) {
      return { error: "Unauthorized" }
    }

    const profileId = formData.get("profileId")
    if (typeof profileId !== "string" || !profileId) {
      return { error: "Invalid profile." }
    }

    const supabase = createSupabaseAdmin()

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, family_id")
      .eq("id", profileId)
      .single()

    if (!profile) {
      return { error: "Profile not found or unauthorized." }
    }

    const { data: family } = await supabase
      .from("families")
      .select("id")
      .eq("id", profile.family_id)
      .eq("household_id", householdId)
      .single()

    if (!family) {
      return { error: "Profile not found or unauthorized." }
    }

    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("family_id", profile.family_id)

    if (count !== null && count <= 1) {
      return { error: "Cannot delete the last profile. A household must have at least one profile." }
    }

    const { error: deleteError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", profileId)

    if (deleteError) {
      console.error("Error deleting profile:", deleteError)
      return { error: "Failed to delete profile." }
    }

    revalidatePath("/settings")
    revalidatePath("/settings/users")
    revalidatePath("/settings/setup")
    revalidatePath("/dashboard")

    return { success: true }
  } catch (err) {
    console.error("Error in deleteUserProfile:", err)
    return { error: "An unexpected error occurred." }
  }
}

const updateNotificationsSchema = z.object({
  telegramBotToken: z.string().optional().nullable(),
  telegramChatId: z.string().optional().nullable(),
})

export type UpdateNotificationsState = {
  success?: boolean
  error?: string
}

export async function updateHouseholdNotifications(
  prevState: UpdateNotificationsState,
  formData: FormData
): Promise<UpdateNotificationsState> {
  try {
    const cookieStore = await cookies()
    const householdId = await getSessionFromCookies(cookieStore)
    if (!householdId) {
      return { error: "Unauthorized" }
    }

    const data = {
      telegramBotToken: formData.get("telegramBotToken") || null,
      telegramChatId: formData.get("telegramChatId") || null,
    }

    const parsed = updateNotificationsSchema.safeParse(data)
    if (!parsed.success) {
      return { error: "Invalid form data." }
    }

    const supabase = createSupabaseAdmin()
    
    const { error } = await supabase
      .from("households")
      .update({
        telegram_bot_token: parsed.data.telegramBotToken,
        telegram_chat_id: parsed.data.telegramChatId,
      })
      .eq("id", householdId)

    if (error) {
      console.error("Error updating notifications:", error)
      return { error: "Failed to update notification settings." }
    }

    revalidatePath("/settings")
    revalidatePath("/settings/notifications")

    return { success: true }
  } catch (err) {
    console.error("Error in updateHouseholdNotifications:", err)
    return { error: "An unexpected error occurred." }
  }
}

export async function resetOnboardingAction(): Promise<void> {
  const cookieStore = await cookies()
  const householdId = await getSessionFromCookies(cookieStore)
  if (!householdId) {
    redirect("/login")
  }

  const supabase = createSupabaseAdmin()
  const { error } = await supabase
    .from("households")
    .update({ onboarding_completed_at: null })
    .eq("id", householdId)

  if (error) {
    console.error("Error resetting onboarding:", error)
    redirect("/settings/setup?error=reset-failed")
  }

  revalidatePath("/settings/setup")
  redirect("/onboarding")
}

export async function addNewFamilyAction(): Promise<void> {
  const cookieStore = await cookies()
  const householdId = await getSessionFromCookies(cookieStore)
  if (!householdId) {
    redirect("/login")
  }

  revalidatePath("/settings/setup")
  redirect("/onboarding?mode=new-family")
}

const updateFamilyNameSchema = z.object({
  familyId: z.string().uuid(),
  name: z.string().transform((s) => s.trim()).pipe(z.string().min(1, "Name is required").max(50)),
})

export type UpdateFamilyNameState = {
  success?: boolean
  error?: string
}

export async function updateFamilyName(
  prevState: UpdateFamilyNameState,
  formData: FormData
): Promise<UpdateFamilyNameState> {
  try {
    const cookieStore = await cookies()
    const householdId = await getSessionFromCookies(cookieStore)
    if (!householdId) {
      return { error: "Unauthorized" }
    }

    const data = {
      familyId: formData.get("familyId"),
      name: formData.get("name"),
    }

    const parsed = updateFamilyNameSchema.safeParse(data)
    if (!parsed.success) {
      return { error: "Invalid form data. Please check your inputs." }
    }

    const { familyId, name } = parsed.data
    const supabase = createSupabaseAdmin()

    const { data: family } = await supabase
      .from("families")
      .select("id")
      .eq("id", familyId)
      .eq("household_id", householdId)
      .single()

    if (!family) {
      return { error: "Family not found or unauthorized." }
    }

    const { error: updateError } = await supabase
      .from("families")
      .update({ name })
      .eq("id", familyId)

    if (updateError) {
      console.error("Error updating family name:", updateError)
      return { error: "Failed to update family name." }
    }

    revalidatePath("/settings")
    revalidatePath("/settings/users")
    revalidatePath("/settings/setup")
    revalidatePath("/dashboard")

    return { success: true }
  } catch (err) {
    console.error("Error in updateFamilyName:", err)
    return { error: "An unexpected error occurred." }
  }
}

export type DeleteFamilyState = {
  success?: boolean
  error?: string
}

export async function deleteFamily(
  prevState: DeleteFamilyState,
  formData: FormData
): Promise<DeleteFamilyState> {
  try {
    const cookieStore = await cookies()
    const householdId = await getSessionFromCookies(cookieStore)
    if (!householdId) {
      return { error: "Unauthorized" }
    }

    const familyId = formData.get("familyId")
    if (typeof familyId !== "string" || !familyId) {
      return { error: "Invalid family." }
    }

    const supabase = createSupabaseAdmin()

    const { data: family } = await supabase
      .from("families")
      .select("id")
      .eq("id", familyId)
      .eq("household_id", householdId)
      .single()

    if (!family) {
      return { error: "Family not found or unauthorized." }
    }

    const { count } = await supabase
      .from("families")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId)

    if (count !== null && count <= 1) {
      return { error: "Cannot delete the last family. Your account must have at least one family." }
    }

    const { error: deleteError } = await supabase
      .from("families")
      .delete()
      .eq("id", familyId)

    if (deleteError) {
      console.error("Error deleting family:", deleteError)
      return { error: "Failed to delete family." }
    }

    revalidatePath("/settings")
    revalidatePath("/settings/users")
    revalidatePath("/settings/setup")
    revalidatePath("/dashboard")

    return { success: true }
  } catch (err) {
    console.error("Error in deleteFamily:", err)
    return { error: "An unexpected error occurred." }
  }
}
