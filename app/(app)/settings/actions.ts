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

    // Ensure the profile belongs to the current household
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", profileId)
      .eq("household_id", householdId)
      .single()

    if (!profile) {
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
    
    return { success: true }
  } catch (err) {
    console.error("Error in updateUserProfile:", err)
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
