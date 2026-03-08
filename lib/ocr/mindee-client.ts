type ParsedStatement = {
  totalCredits: number
  totalDebits: number
  transactions: Array<{
    date: string
    description: string
    amount: number
    type: "credit" | "debit"
  }>
}

export async function parseBankStatement(
  fileBuffer: Buffer,
): Promise<ParsedStatement | null> {
  const apiKey = process.env.MINDEE_API_KEY
  if (!apiKey) {
    return null
  }

  try {
    const formData = new FormData()
    formData.append(
      "document",
      new Blob([fileBuffer as unknown as BlobPart], { type: "application/pdf" }),
      "statement.pdf",
    )

    const response = await fetch(
      "https://api.mindee.net/v1/products/mindee/bank_statement/v1/predict",
      {
        method: "POST",
        headers: { Authorization: `Token ${apiKey}` },
        body: formData,
      },
    )

    if (!response.ok) {
      console.error(
        `Mindee API error: ${response.status} ${response.statusText}`,
      )
      return null
    }

    const data = await response.json()
    const prediction = data?.document?.inference?.prediction

    if (!prediction) {
      return null
    }

    const transactions: ParsedStatement["transactions"] = []
    let totalCredits = 0
    let totalDebits = 0

    const rawTransactions = prediction.transactions ?? []
    for (const tx of rawTransactions) {
      const amount = Math.abs(tx.amount ?? 0)
      const isCredit = (tx.amount ?? 0) > 0

      transactions.push({
        date: tx.date ?? "",
        description: tx.description ?? "",
        amount,
        type: isCredit ? "credit" : "debit",
      })

      if (isCredit) {
        totalCredits += amount
      } else {
        totalDebits += amount
      }
    }

    return { totalCredits, totalDebits, transactions }
  } catch (error) {
    console.error("Mindee parsing error:", error)
    return null
  }
}
