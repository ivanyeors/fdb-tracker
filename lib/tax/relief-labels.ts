/** Human-readable labels and hover copy for IRAS-style relief_type keys. */

export function formatReliefType(type: string): string {
  return type.replaceAll(/_/g, " ").replaceAll(/\b\w/g, (c) => c.toUpperCase())
}

const RELIEF_HELP: Record<string, string> = {
  earned_income:
    "Flat relief for salary earners based on age. Reduces chargeable income before tax rates apply.",
  cpf: "Relief for employee CPF contributions on your salary — mirrors mandatory contributions.",
  life_insurance:
    "Relief on qualifying life insurance premiums, subject to caps vs your CPF relief.",
  srs: "Supplementary Retirement Scheme: voluntary contributions earn relief; funds are locked for retirement.",
  donations:
    "Approved donations may qualify for 250% tax deduction on the gift amount (relief capped overall).",
  course_fees: "Relief for qualifying course fees, subject to formula limits.",
  cpf_topup_self: "Cash top-up to your own CPF SA/RA — up to $8k relief yearly if eligible.",
  cpf_topup_family:
    "Cash top-up to family members’ CPF SA/RA — up to $8k relief yearly if eligible.",
  parent:
    "Parent/grandparent relief — $9,000 (living with) or $5,500 (not living with) per dependent parent. Auto-calculated from dependents.",
  spouse:
    "Spouse relief — $2,000 when spouse income is below $8,000. Auto-calculated from linked spouse.",
  qcr: "Qualifying Child Relief — $4,000–$12,000 per child based on birth year and order. Auto-calculated from dependents.",
  wmcr: "Working Mother’s Child Relief — percentage or fixed amount per child. Auto-calculated for female profiles with children.",
  nsman: "NSman relief — varies by activity level. Self $1,500–$5,000, Wife $750, Parent $750–$3,500.",
  donations_employer:
    "Employer-channeled donations — already at deduction value from IRAS PIDS (no 250% multiplier).",
  cpf_life_insurance:
    "Combined CPF/Provident Fund and Life Insurance relief as shown on IRAS NOA.",
  other: "Other reliefs you entered manually.",
}

export function getReliefCategoryHelp(reliefType: string): string {
  return RELIEF_HELP[reliefType] ?? "Tax relief included in your year of assessment calculation."
}
