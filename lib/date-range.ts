/** Returns the calendar year range: Jan through Dec of the current year. */
export function getCalendarYearRange(): {
  startMonth: string
  endMonth: string
} {
  const year = new Date().getFullYear()
  return {
    startMonth: `${year}-01-01`,
    endMonth: `${year}-12-01`,
  }
}
