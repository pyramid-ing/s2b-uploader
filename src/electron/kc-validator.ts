import axios from 'axios'

// ========= Interfaces =========
export interface KcApiBaseResponse<T = unknown> {
  resultMsg: string
  resultCode: number
  resultData?: T
}

export interface KcCertificationListItem {
  certUid: number
  certOrganName: string
  certNum: string
  certState: string
  certDiv: string
  certDate: string | null
  certChgDate?: string | null
  certChgReason?: string | null
  firstCertNum?: string | null
  productName?: string | null
  brandName?: string | null
  modelName?: string | null
  categoryName?: string | null
  importDiv?: string | null
  makerName?: string | null
  makerCntryName?: string | null
  importerName?: string | null
  remark?: string | null
  signDate?: string | null
}

export interface KcCertificationDetailData {
  certUid: number
  certOrganName: string
  certNum: string
  certState: string
  certDiv: string
  certDate: string | null
  certChgDate?: string | null
  certChgReason?: string | null
  firstCertNum?: string | null
  productName?: string | null
  brandName?: string | null
  modelName?: string | null
  categoryName?: string | null
  importDiv?: string | null
  makerName?: string | null
  makerCntryName?: string | null
  importerName?: string | null
  remark?: string | null
  signDate?: string | null
  derivationModels?: string[]
  certificationImageUrls?: string[]
  factories?: { makerName?: string; makerCntryName?: string }[]
  similarCertifications?: KcCertificationListItem[]
}

export type KcApiCertificationDetailResponse = KcApiBaseResponse<KcCertificationDetailData>

// ========= Result Codes =========
export enum KcResultCode {
  Success = 2000,
  NoData = 2004,
  InvalidAuthKey = 4000,
  InvalidIP = 4001,
  InvalidParameter = 4005,
  InternalServerError = 5000,
}

export const KC_RESULT_MESSAGES: Record<KcResultCode, string> = {
  [KcResultCode.Success]: 'Success',
  [KcResultCode.NoData]: 'No Data',
  [KcResultCode.InvalidAuthKey]: 'Invalid Auth Key',
  [KcResultCode.InvalidIP]: 'Invalid IP',
  [KcResultCode.InvalidParameter]: 'Invalid Parameter',
  [KcResultCode.InternalServerError]: 'Internal Server Error',
}

export function getKcResultMessage(code: number | string | undefined): string {
  if (code === undefined || code === null) return 'Unknown'
  const num = typeof code === 'string' ? parseInt(code, 10) : code
  const mapped = KC_RESULT_MESSAGES[num as KcResultCode]
  return mapped || 'Unknown'
}

export class KcValidationError extends Error {
  code?: KcResultCode | number
  statusText?: string
  certNum?: string
  constructor(message: string, options?: { code?: number; statusText?: string; certNum?: string }) {
    super(message)
    this.name = 'KcValidationError'
    this.code = options?.code
    this.statusText = options?.statusText
    this.certNum = options?.certNum
  }
}

// 인증번호 단건 상세 조회 유효성 검사 (성공 시 상세 데이터 반환, 실패 시 예외 발생)
export async function validateKcByCertNum(authKey: string, certNum: string): Promise<KcCertificationDetailData> {
  if (!certNum) throw new KcValidationError('인증번호가 비어있습니다.', { statusText: '인증번호가 비어있습니다.' })
  const client = axios.create({
    baseURL: 'http://www.safetykorea.kr',
    timeout: 15000,
    headers: { AuthKey: authKey },
  })
  try {
    const url = `/openapi/api/cert/certificationDetail.json`
    const { data } = await client.get<KcApiCertificationDetailResponse>(url, { params: { certNum } })

    const code = data?.resultCode
    const codeStr = String(code ?? '')
    const codeNum = typeof code === 'number' ? code : parseInt(codeStr, 10)
    if (codeNum !== KcResultCode.Success) {
      throw new KcValidationError(getKcResultMessage(codeNum), {
        code: codeNum,
        statusText: data?.resultMsg || getKcResultMessage(codeNum),
        certNum,
      })
    }

    const detail = data?.resultData
    const state: string = String(detail?.certState ?? '').trim()
    const invalidStates = [
      '안전인증취소',
      '개선명령',
      '안전인증표시 사용금지 2개월',
      '안전인증표시 사용금지 4개월',
      '안전확인신고 효력상실',
      '안전확인신고표시 사용금지 2개월',
      '반납',
      '청문실시',
      '기간만료',
    ]
    const isValid = state !== '' && !invalidStates.some(s => state.includes(s))
    if (!isValid) {
      throw new KcValidationError(state || '유효하지 않은 인증상태', {
        code: KcResultCode.Success,
        statusText: state || '상태 미표시',
        certNum,
      })
    }
    return detail as KcCertificationDetailData
  } catch (error: any) {
    if (error instanceof KcValidationError) throw error
    throw new KcValidationError(error?.message || '요청 실패', { statusText: error?.message, certNum })
  }
}
