/**
 * Bidirectional sync between deduction_bank_account_id on insurance/loans/ILP
 * and linked GIRO rules.
 *
 * When a deduction account is set on a policy/loan/ILP that differs from the
 * profile's primary account, a GIRO rule is auto-created to model the transfer.
 * The GIRO rule is tagged with linked_entity_type + linked_entity_id so:
 * - It can be excluded from discretionary outflow (deduplication)
 * - Editing the GIRO rule syncs back to the entity
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export type LinkedEntityType = "insurance_policy" | "loan" | "ilp_product"

/**
 * Sync a GIRO rule when deduction_bank_account_id changes on an entity.
 *
 * If deductionAccountId is null or equals the primary account, any existing
 * linked GIRO rule is deleted.
 *
 * If deductionAccountId differs from primary, a GIRO rule is upserted:
 *   source = primary account → destination = deduction account.
 */
export async function syncGiroForDeductionAccount(
  supabase: SupabaseClient,
  params: {
    entityType: LinkedEntityType
    entityId: string
    profileId: string
    familyId: string
    deductionAccountId: string | null
    monthlyAmount: number
  },
): Promise<void> {
  const {
    entityType,
    entityId,
    profileId,
    familyId,
    deductionAccountId,
    monthlyAmount,
  } = params

  // Look up the profile's primary account
  const { data: profile } = await supabase
    .from("profiles")
    .select("primary_bank_account_id")
    .eq("id", profileId)
    .single()

  const primaryAccountId = profile?.primary_bank_account_id

  // Should we have a linked GIRO rule?
  const needsGiro =
    deductionAccountId != null &&
    primaryAccountId != null &&
    deductionAccountId !== primaryAccountId

  // Find existing linked GIRO rule
  const { data: existing } = await supabase
    .from("giro_rules")
    .select("id")
    .eq("linked_entity_type", entityType)
    .eq("linked_entity_id", entityId)
    .limit(1)

  const existingId = existing?.[0]?.id

  if (needsGiro) {
    if (existingId) {
      // Update existing
      await supabase
        .from("giro_rules")
        .update({
          source_bank_account_id: primaryAccountId,
          destination_bank_account_id: deductionAccountId,
          amount: monthlyAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingId)
    } else {
      // Create new
      await supabase.from("giro_rules").insert({
        family_id: familyId,
        profile_id: profileId,
        source_bank_account_id: primaryAccountId,
        destination_bank_account_id: deductionAccountId,
        destination_type: "bank_account",
        amount: monthlyAmount,
        is_active: true,
        linked_entity_type: entityType,
        linked_entity_id: entityId,
      })
    }
  } else if (existingId) {
    // No longer needed — remove linked GIRO rule
    await supabase.from("giro_rules").delete().eq("id", existingId)
  }
}

/**
 * When a linked GIRO rule is edited (destination changed), sync back to the entity.
 */
export async function syncEntityFromGiroRule(
  supabase: SupabaseClient,
  giroRuleId: string,
): Promise<void> {
  const { data: rule } = await supabase
    .from("giro_rules")
    .select("linked_entity_type, linked_entity_id, destination_bank_account_id")
    .eq("id", giroRuleId)
    .single()

  if (!rule?.linked_entity_type || !rule?.linked_entity_id) return

  const table = entityTypeToTable(rule.linked_entity_type)
  if (!table) return

  await supabase
    .from(table)
    .update({ deduction_bank_account_id: rule.destination_bank_account_id })
    .eq("id", rule.linked_entity_id)
}

/**
 * When a linked GIRO rule is deleted, reset the entity's deduction account to null.
 */
export async function clearEntityDeductionOnGiroDelete(
  supabase: SupabaseClient,
  linkedEntityType: string,
  linkedEntityId: string,
): Promise<void> {
  const table = entityTypeToTable(linkedEntityType)
  if (!table) return

  await supabase
    .from(table)
    .update({ deduction_bank_account_id: null })
    .eq("id", linkedEntityId)
}

function entityTypeToTable(
  entityType: string,
): "insurance_policies" | "loans" | "ilp_products" | null {
  switch (entityType) {
    case "insurance_policy":
      return "insurance_policies"
    case "loan":
      return "loans"
    case "ilp_product":
      return "ilp_products"
    default:
      return null
  }
}
