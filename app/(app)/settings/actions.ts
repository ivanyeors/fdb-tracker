"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { z } from "zod"
import { getSessionFromCookies } from "@/lib/auth/session"
import { encryptStringNullable } from "@/lib/crypto/cipher"
import { encodeDependentPiiPatch } from "@/lib/repos/dependents"
import { encodeFamilyPiiPatch } from "@/lib/repos/families"
import { encodeIncomeConfigPiiPatch } from "@/lib/repos/income-config"
import { encodeProfilePiiPatch } from "@/lib/repos/profiles"
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

    const dpsIncludeInProjection = formData.get("dpsIncludeInProjection") !== "false"
    const rawSelfHelpGroup = formData.get("selfHelpGroup") as string | null
    const selfHelpGroup =
      rawSelfHelpGroup && ["cdac", "sinda", "mbmf", "ecf", "none"].includes(rawSelfHelpGroup)
        ? rawSelfHelpGroup
        : "none"
    const rawMaritalStatus = formData.get("maritalStatus") as string | null
    const maritalStatus = rawMaritalStatus && rawMaritalStatus !== "" ? rawMaritalStatus : null
    const numDependents = Math.max(0, Math.min(20, Number(formData.get("numDependents")) || 0))
    const rawGender = formData.get("gender") as string | null
    const gender = rawGender && rawGender !== "" ? rawGender : null
    const rawSpouseProfileId = formData.get("spouseProfileId") as string | null
    const spouseProfileId = rawSpouseProfileId && rawSpouseProfileId !== "" ? rawSpouseProfileId : null

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
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("spouse_profile_id")
      .eq("id", profileId)
      .single()

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        name,
        birth_year: birthYear,
        ...encodeProfilePiiPatch({ name, birth_year: birthYear }),
        dps_include_in_projection: dpsIncludeInProjection,
        self_help_group: selfHelpGroup,
        marital_status: maritalStatus,
        num_dependents: numDependents,
        gender,
        spouse_profile_id: spouseProfileId,
      })
      .eq("id", profileId)

    if (profileError) {
      console.error("Error updating profile:", profileError)
      return { error: "Failed to update profile details." }
    }

    // Bidirectional spouse linking
    const oldSpouseId = currentProfile?.spouse_profile_id
    if (oldSpouseId && oldSpouseId !== spouseProfileId) {
      // Clear old spouse's link
      await supabase
        .from("profiles")
        .update({ spouse_profile_id: null })
        .eq("id", oldSpouseId)
    }
    if (spouseProfileId && spouseProfileId !== oldSpouseId) {
      // Clear new spouse's old link if any, then set new link
      const { data: newSpouse } = await supabase
        .from("profiles")
        .select("spouse_profile_id")
        .eq("id", spouseProfileId)
        .single()
      if (newSpouse?.spouse_profile_id && newSpouse.spouse_profile_id !== profileId) {
        await supabase
          .from("profiles")
          .update({ spouse_profile_id: null })
          .eq("id", newSpouse.spouse_profile_id)
      }
      await supabase
        .from("profiles")
        .update({ spouse_profile_id: profileId })
        .eq("id", spouseProfileId)
    }

    // Update or insert income config
    const { data: existingIncomeConfig } = await supabase
      .from("income_config")
      .select("id")
      .eq("profile_id", profileId)
      .single()

    const incomePii = encodeIncomeConfigPiiPatch({
      annual_salary: annualSalary,
      bonus_estimate: bonusEstimate,
    })
    if (existingIncomeConfig) {
      const { error: incomeError } = await supabase
        .from("income_config")
        .update({
          ...incomePii,
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
          ...incomePii,
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
    revalidatePath("/dashboard", "layout")

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

    const trimmedName = name.trim()
    const { data: newProfile, error: profileError } = await supabase
      .from("profiles")
      .insert({
        family_id: familyId,
        name: trimmedName,
        birth_year: birthYear,
        ...encodeProfilePiiPatch({
          name: trimmedName,
          birth_year: birthYear,
        }),
      })
      .select("id")
      .single()

    if (profileError || !newProfile) {
      console.error("Error creating profile:", profileError)
      return { error: "Failed to create profile." }
    }

    const { error: incomeError } = await supabase.from("income_config").insert({
      profile_id: newProfile.id,
      ...encodeIncomeConfigPiiPatch({ annual_salary: 0, bonus_estimate: 0 }),
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

    const botTokenEnc = encryptStringNullable(parsed.data.telegramBotToken, {
      table: "households",
      column: "telegram_bot_token_enc",
    })

    const { error } = await supabase
      .from("households")
      .update({
        telegram_bot_token: parsed.data.telegramBotToken,
        telegram_bot_token_enc: botTokenEnc,
        telegram_chat_id: parsed.data.telegramChatId,
      })
      .eq("id", householdId)

    if (error) {
      console.error("Error updating notifications:", error)
      return { error: "Failed to update notification settings." }
    }

    revalidatePath("/settings")

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
    redirect("/settings/users?error=reset-failed")
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
      .update({ name, ...encodeFamilyPiiPatch({ name }) })
      .eq("id", familyId)

    if (updateError) {
      console.error("Error updating family name:", updateError)
      return { error: "Failed to update family name." }
    }

    revalidatePath("/settings")
    revalidatePath("/settings/users")

    revalidatePath("/dashboard")

    return { success: true }
  } catch (err) {
    console.error("Error in updateFamilyName:", err)
    return { error: "An unexpected error occurred." }
  }
}

// ── Dependent CRUD ──

export type DependentState = {
  success?: boolean
  error?: string
}

const dependentSchema = z.object({
  familyId: z.string().uuid(),
  name: z.string().min(1).max(50),
  birthYear: z.coerce.number().min(1920).max(2040),
  relationship: z.enum(["child", "parent", "grandparent"]),
  claimedByProfileId: z.string().uuid().optional().nullable(),
  inFullTimeEducation: z.coerce.boolean().default(false),
  annualIncome: z.coerce.number().min(0).default(0),
  livingWithClaimant: z.coerce.boolean().default(true),
  isHandicapped: z.coerce.boolean().default(false),
})

export async function createDependent(
  prevState: DependentState,
  formData: FormData
): Promise<DependentState> {
  try {
    const cookieStore = await cookies()
    const householdId = await getSessionFromCookies(cookieStore)
    if (!householdId) return { error: "Unauthorized" }

    const parsed = dependentSchema.safeParse({
      familyId: formData.get("familyId"),
      name: formData.get("name"),
      birthYear: formData.get("birthYear"),
      relationship: formData.get("relationship"),
      claimedByProfileId: formData.get("claimedByProfileId") || null,
      inFullTimeEducation: formData.get("inFullTimeEducation") === "true",
      annualIncome: formData.get("annualIncome") || 0,
      livingWithClaimant: formData.get("livingWithClaimant") !== "false",
      isHandicapped: formData.get("isHandicapped") === "true",
    })
    if (!parsed.success) return { error: "Invalid form data." }

    const supabase = createSupabaseAdmin()
    const { data: family } = await supabase
      .from("families")
      .select("id")
      .eq("id", parsed.data.familyId)
      .eq("household_id", householdId)
      .single()
    if (!family) return { error: "Family not found or unauthorized." }

    const dependentName = parsed.data.name.trim()
    const { error } = await supabase.from("dependents").insert({
      family_id: parsed.data.familyId,
      name: dependentName,
      birth_year: parsed.data.birthYear,
      relationship: parsed.data.relationship,
      claimed_by_profile_id: parsed.data.claimedByProfileId ?? null,
      in_full_time_education: parsed.data.inFullTimeEducation,
      annual_income: parsed.data.annualIncome,
      living_with_claimant: parsed.data.livingWithClaimant,
      is_handicapped: parsed.data.isHandicapped,
      ...encodeDependentPiiPatch({
        name: dependentName,
        birth_year: parsed.data.birthYear,
        annual_income: parsed.data.annualIncome,
      }),
    })
    if (error) {
      console.error("Error creating dependent:", error)
      return { error: "Failed to create dependent." }
    }

    revalidatePath("/settings/users")
    revalidatePath("/dashboard")
    return { success: true }
  } catch (err) {
    console.error("Error in createDependent:", err)
    return { error: "An unexpected error occurred." }
  }
}

export async function updateDependent(
  prevState: DependentState,
  formData: FormData
): Promise<DependentState> {
  try {
    const cookieStore = await cookies()
    const householdId = await getSessionFromCookies(cookieStore)
    if (!householdId) return { error: "Unauthorized" }

    const dependentId = formData.get("dependentId") as string
    if (!dependentId) return { error: "Invalid dependent." }

    const parsed = dependentSchema.safeParse({
      familyId: formData.get("familyId"),
      name: formData.get("name"),
      birthYear: formData.get("birthYear"),
      relationship: formData.get("relationship"),
      claimedByProfileId: formData.get("claimedByProfileId") || null,
      inFullTimeEducation: formData.get("inFullTimeEducation") === "true",
      annualIncome: formData.get("annualIncome") || 0,
      livingWithClaimant: formData.get("livingWithClaimant") !== "false",
      isHandicapped: formData.get("isHandicapped") === "true",
    })
    if (!parsed.success) return { error: "Invalid form data." }

    const supabase = createSupabaseAdmin()
    const { data: family } = await supabase
      .from("families")
      .select("id")
      .eq("id", parsed.data.familyId)
      .eq("household_id", householdId)
      .single()
    if (!family) return { error: "Family not found or unauthorized." }

    const dependentName = parsed.data.name.trim()
    const { error } = await supabase
      .from("dependents")
      .update({
        name: dependentName,
        birth_year: parsed.data.birthYear,
        relationship: parsed.data.relationship,
        claimed_by_profile_id: parsed.data.claimedByProfileId ?? null,
        in_full_time_education: parsed.data.inFullTimeEducation,
        annual_income: parsed.data.annualIncome,
        living_with_claimant: parsed.data.livingWithClaimant,
        is_handicapped: parsed.data.isHandicapped,
        ...encodeDependentPiiPatch({
          name: dependentName,
          birth_year: parsed.data.birthYear,
          annual_income: parsed.data.annualIncome,
        }),
      })
      .eq("id", dependentId)
      .eq("family_id", parsed.data.familyId)
    if (error) {
      console.error("Error updating dependent:", error)
      return { error: "Failed to update dependent." }
    }

    revalidatePath("/settings/users")
    revalidatePath("/dashboard")
    return { success: true }
  } catch (err) {
    console.error("Error in updateDependent:", err)
    return { error: "An unexpected error occurred." }
  }
}

export async function deleteDependent(
  prevState: DependentState,
  formData: FormData
): Promise<DependentState> {
  try {
    const cookieStore = await cookies()
    const householdId = await getSessionFromCookies(cookieStore)
    if (!householdId) return { error: "Unauthorized" }

    const dependentId = formData.get("dependentId") as string
    const familyId = formData.get("familyId") as string
    if (!dependentId || !familyId) return { error: "Invalid dependent." }

    const supabase = createSupabaseAdmin()
    const { data: family } = await supabase
      .from("families")
      .select("id")
      .eq("id", familyId)
      .eq("household_id", householdId)
      .single()
    if (!family) return { error: "Family not found or unauthorized." }

    const { error } = await supabase
      .from("dependents")
      .delete()
      .eq("id", dependentId)
      .eq("family_id", familyId)
    if (error) {
      console.error("Error deleting dependent:", error)
      return { error: "Failed to delete dependent." }
    }

    revalidatePath("/settings/users")
    revalidatePath("/dashboard")
    return { success: true }
  } catch (err) {
    console.error("Error in deleteDependent:", err)
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

    revalidatePath("/dashboard")

    return { success: true }
  } catch (err) {
    console.error("Error in deleteFamily:", err)
    return { error: "An unexpected error occurred." }
  }
}

const NOTIFICATION_TYPES = [
  "end_of_month",
  "income_monthly",
  "income_yearly",
  "insurance_monthly",
  "insurance_yearly",
  "tax_yearly",
  "seasonality_weekly",
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

const updateNotificationPreferenceSchema = z.object({
  profileId: z.string().uuid(),
  notificationType: z.enum(NOTIFICATION_TYPES),
  enabled: z.boolean(),
  dayOfMonth: z.coerce.number().int().min(1).max(31).nullable().optional(),
  monthOfYear: z.coerce.number().int().min(1).max(12).nullable().optional(),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  timezone: z.string().nullable().optional(),
})

export type NotificationScheduleOverride = {
  day_of_month: number | null
  month_of_year: number | null
  time: string | null
  timezone: string | null
}

export async function updateNotificationPreference(
  profileId: string,
  notificationType: string,
  enabled: boolean,
  schedule?: {
    dayOfMonth?: number | null
    monthOfYear?: number | null
    time?: string | null
    timezone?: string | null
  }
): Promise<{ success?: boolean; error?: string }> {
  try {
    const cookieStore = await cookies()
    const householdId = await getSessionFromCookies(cookieStore)
    if (!householdId) {
      return { error: "Unauthorized" }
    }

    const parsed = updateNotificationPreferenceSchema.safeParse({
      profileId,
      notificationType,
      enabled,
      ...schedule,
    })
    if (!parsed.success) {
      return { error: "Invalid data." }
    }

    const supabase = createSupabaseAdmin()

    // Verify profile belongs to this household
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, family_id, families!inner(household_id)")
      .eq("id", parsed.data.profileId)
      .single()

    if (
      !profile ||
      (profile.families as unknown as { household_id: string }).household_id !==
        householdId
    ) {
      return { error: "Unauthorized" }
    }

    const { error } = await supabase
      .from("notification_preferences")
      .upsert(
        {
          profile_id: parsed.data.profileId,
          notification_type: parsed.data.notificationType,
          enabled: parsed.data.enabled,
          day_of_month: parsed.data.dayOfMonth ?? null,
          month_of_year: parsed.data.monthOfYear ?? null,
          time: parsed.data.time ?? null,
          timezone: parsed.data.timezone ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id,notification_type" }
      )

    if (error) {
      console.error("Error updating notification preference:", error)
      return { error: "Failed to update preference." }
    }

    revalidatePath("/settings/users")
    return { success: true }
  } catch (err) {
    console.error("Error in updateNotificationPreference:", err)
    return { error: "An unexpected error occurred." }
  }
}
