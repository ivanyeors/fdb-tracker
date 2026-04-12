export type ProfileWithIncome = {
  id: string
  name: string
  birth_year: number
  marital_status: string | null
  num_dependents: number
  gender: string | null
  spouse_profile_id: string | null
  dps_include_in_projection?: boolean
  self_help_group?: string
  family_id?: string
  primary_bank_account_id?: string | null
  telegram_user_id?: string | null
  telegram_chat_id?: string | null
  telegram_link_token?: string | null
  telegram_last_used?: string | null
  income_config: {
    annual_salary: number
    bonus_estimate: number
    pay_frequency: string
    employee_cpf_rate: number | null
  } | null
}

