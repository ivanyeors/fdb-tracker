export type ProfileWithIncome = {
  id: string
  name: string
  birth_year: number
  dps_include_in_projection?: boolean
  family_id?: string
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

