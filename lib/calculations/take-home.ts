import type { CpfContribution } from "./cpf"
import {
  getAge,
  calculateCpfContribution,
  calculateAnnualCpf,
} from "./cpf"
import {
  calculateSelfHelpContribution,
  type SelfHelpGroup,
  type SelfHelpContribution,
} from "./self-help-group"

export type TakeHomeResult = {
  monthlyGross: number
  monthlyEmployeeCpf: number
  monthlySelfHelp: number
  monthlyTakeHome: number
  annualGross: number
  annualEmployeeCpf: number
  annualSelfHelp: number
  annualTakeHome: number
  annualEmployerCpf: number
  cpfContribution: CpfContribution
  selfHelpContribution: SelfHelpContribution
}

export function calculateTakeHome(
  annualSalary: number,
  bonus: number,
  birthYear: number,
  year: number = 2026,
  selfHelpGroup: SelfHelpGroup = "none",
): TakeHomeResult {
  const age = getAge(birthYear, year)
  const monthlyGross = annualSalary / 12

  const cpfContribution = calculateCpfContribution(monthlyGross, age, year)
  const monthlyEmployeeCpf = cpfContribution.employee

  const selfHelpContribution = calculateSelfHelpContribution(
    monthlyGross,
    selfHelpGroup,
  )
  const monthlySelfHelp = selfHelpContribution.monthlyAmount
  const monthlyTakeHome = monthlyGross - monthlyEmployeeCpf - monthlySelfHelp

  const annualCpf = calculateAnnualCpf(annualSalary, bonus, age, year)
  const annualGross = annualSalary + bonus
  const annualEmployeeCpf = annualCpf.totalEmployee
  const annualSelfHelp = selfHelpContribution.annualAmount
  const annualTakeHome = annualGross - annualEmployeeCpf - annualSelfHelp
  const annualEmployerCpf = annualCpf.totalEmployer

  return {
    monthlyGross,
    monthlyEmployeeCpf,
    monthlySelfHelp,
    monthlyTakeHome,
    annualGross,
    annualEmployeeCpf,
    annualSelfHelp,
    annualTakeHome,
    annualEmployerCpf,
    cpfContribution,
    selfHelpContribution,
  }
}
