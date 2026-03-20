/** Human-readable labels and hover copy for IRAS-style relief_type keys. */

export function formatReliefType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
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
  parent: "Dependent / parent relief where applicable (manual entry).",
  spouse: "Spouse relief where applicable (manual entry).",
  wmcr: "Working mother’s child relief where applicable (manual entry).",
  other: "Other reliefs you entered manually.",
}

export function getReliefCategoryHelp(reliefType: string): string {
  return RELIEF_HELP[reliefType] ?? "Tax relief included in your year of assessment calculation."
}
