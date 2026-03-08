import type { CpfContribution } from "./cpf";
import {
  getAge,
  calculateCpfContribution,
  calculateAnnualCpf,
} from "./cpf";

export type TakeHomeResult = {
  monthlyGross: number;
  monthlyEmployeeCpf: number;
  monthlyTakeHome: number;
  annualGross: number;
  annualEmployeeCpf: number;
  annualTakeHome: number;
  annualEmployerCpf: number;
  cpfContribution: CpfContribution;
};

export function calculateTakeHome(
  annualSalary: number,
  bonus: number,
  birthYear: number,
  year: number = 2026,
): TakeHomeResult {
  const age = getAge(birthYear, year);
  const monthlyGross = annualSalary / 12;

  const cpfContribution = calculateCpfContribution(monthlyGross, age, year);
  const monthlyEmployeeCpf = cpfContribution.employee;
  const monthlyTakeHome = monthlyGross - monthlyEmployeeCpf;

  const annualCpf = calculateAnnualCpf(annualSalary, bonus, age, year);
  const annualGross = annualSalary + bonus;
  const annualEmployeeCpf = annualCpf.totalEmployee;
  const annualTakeHome = annualGross - annualEmployeeCpf;
  const annualEmployerCpf = annualCpf.totalEmployer;

  return {
    monthlyGross,
    monthlyEmployeeCpf,
    monthlyTakeHome,
    annualGross,
    annualEmployeeCpf,
    annualTakeHome,
    annualEmployerCpf,
    cpfContribution,
  };
}
