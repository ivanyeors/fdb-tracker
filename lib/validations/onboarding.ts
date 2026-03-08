import { z } from "zod"

export const userCountSchema = z.object({
  user_count: z.number().int().min(1).max(6),
})

export const profileSchema = z.object({
  name: z.string().min(1).max(50),
  birth_year: z.number().int().min(1940).max(2010),
})

export const profilesSchema = z.object({
  profiles: z.array(profileSchema).min(1).max(6),
})

export const incomeSchema = z.object({
  annual_salary: z.number().positive(),
  bonus_estimate: z.number().min(0).default(0),
  pay_frequency: z.enum(["monthly", "bi-monthly", "weekly"]),
})

export const bankAccountSchema = z.object({
  bank_name: z.string().min(1),
  account_type: z.enum(["ocbc_360", "basic", "savings", "fixed_deposit"]),
  profile_id: z.string().uuid().nullable(),
})

export const savingsGoalSchema = z.object({
  name: z.string().min(1),
  target_amount: z.number().positive(),
  current_amount: z.number().min(0).default(0),
})

export const telegramSetupSchema = z.object({
  chat_id: z.string().min(1),
  bot_token: z.string().optional(),
})

export const promptScheduleSchema = z.object({
  prompt_type: z.enum(["end_of_month", "income", "insurance", "tax"]),
  frequency: z.enum(["monthly", "yearly"]),
  day_of_month: z.number().int().min(1).max(28),
  month_of_year: z.number().int().min(1).max(12).nullable(),
  time: z.string(),
  timezone: z.string(),
})
