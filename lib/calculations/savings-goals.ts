/**
 * Returns the number of full calendar months from today to the deadline.
 * Returns 0 if deadline is in the past.
 */
export function getMonthsRemaining(deadline: string): number {
  const end = new Date(deadline)
  const now = new Date()
  if (end <= now) return 0
  const months =
    (end.getFullYear() - now.getFullYear()) * 12 +
    (end.getMonth() - now.getMonth())
  return Math.max(1, months)
}

/**
 * Calculates the suggested monthly contribution to reach the target by the deadline.
 * Returns null when not applicable (no deadline, goal achieved, or deadline past).
 */
export function calculateMonthlyAuto(
  target: number,
  current: number,
  deadline: string | null
): number | null {
  if (!deadline || target <= current) return null
  const months = getMonthsRemaining(deadline)
  if (months <= 0) return null
  return (target - current) / months
}
