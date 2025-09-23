import axios from 'axios'

export interface CreditsResponse {
  balance: number
  recent_transactions: Array<{
    id: string
    type: string
    amount: number
    description: string
    reference_id: string | null
    created_at: string
  }>
  recent_ai_usages: Array<{
    id: string
    product_name: string | null
    credits_used: number
    status: string
    created_at: string
  }>
}

export const fetchCredits = async (s2bId: string): Promise<number | null> => {
  try {
    const response = await axios.post<CreditsResponse>(
      'https://n8n.pyramid-ing.com/webhook/s2b-sourcing-credits',
      { s2b_id: s2bId },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10초 타임아웃
      },
    )

    const data = response.data
    return typeof data.balance === 'number' ? data.balance : null
  } catch (error) {
    console.error('크레딧 조회 실패:', error)
    return null
  }
}
