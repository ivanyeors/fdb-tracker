export type ProfileWithIncome = {
  id: string
  name: string
  birth_year: number
  income_config: {
    annual_salary: number
    bonus_estimate: number
    pay_frequency: string
    employee_cpf_rate: number | null
  } | null
}
