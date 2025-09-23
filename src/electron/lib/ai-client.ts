import axios from 'axios'

export interface AiOptionItem {
  name: string
  price: number
  qty: number
}

export interface AiRefinedPayload {
  물품명: string
  모델명: string
  '소재/재질': string
  원산지구분: '국내' | '국외'
  국내원산지: string
  해외원산지: string
  certificationNumbers: string[]
  이미지사용여부: '허용' | '불가' | '모름'
  options: AiOptionItem[]
  특성: string[]
}

export interface AiWebhookResponse {
  output?: AiRefinedPayload
}

export class InsufficientCreditsError extends Error {
  public readonly balance?: number
  public readonly status: number

  constructor(message: string, balance?: number) {
    super(message)
    this.name = 'InsufficientCreditsError'
    this.balance = balance
    this.status = 403
  }
}

export async function fetchAiRefined(data: any): Promise<AiRefinedPayload> {
  try {
    const response = await axios.post<AiWebhookResponse>('https://n8n.pyramid-ing.com/webhook/s2b-sourcing', data, {
      headers: { 'Content-Type': 'application/json' },
    })
    if (!response?.data?.output) {
      throw new Error('AI 결과가 비어 있습니다.')
    }
    return response.data.output
  } catch (err: any) {
    if (err?.response?.status === 403) {
      throw new InsufficientCreditsError(err?.response?.data?.message)
    }
    throw err
  }
}
