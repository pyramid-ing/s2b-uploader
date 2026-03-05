/**
 * SourcingItem 관련 타입 정의
 */

export interface SourcingItem {
  key: string
  name: string
  url: string
  vendor?: string
  price: number
  productCode?: string
  /**
   * 학교장터(S2B) 상세의 물품목록번호(G2B 번호)
   * 예: 43211503-25370757
   */
  g2bItemNo?: string
  listThumbnail?: string
  downloadDir?: string
  additionalInfo?: any
  isCollected?: boolean // 수집완료 상태
  loading?: boolean // 수집 중 상태
  origin?: string // 원산지 정보
  excelMapped?: any[] // 엑셀 매핑 정보
  result?: string // 수집 결과
}

/**
 * Renderer -> Main IPC 전달용 페이로드
 */
export interface SourcingItemPayload {
  key: string
  name: string
  url: string
  vendor?: string
  price: number
  productCode?: string
  g2bItemNo?: string
  listThumbnail?: string
  downloadDir?: string
  additionalInfo?: any
  isCollected?: boolean
  origin?: string
  excelMapped?: any[]
}

export interface SourcingSettings {
  marginRate: number
  detailHtmlTemplate: string
  s2bMinDelaySec?: number // 학교장터 소싱 최소 딜레이 (초)
  s2bMaxDelaySec?: number // 학교장터 소싱 최대 딜레이 (초)
}

export interface SourcingConfigSet {
  id: string
  name: string
  isDefault: boolean
  isActive: boolean
  config: {
    deliveryPeriod: string // 납품가능기간 (코드값)
    quoteValidityPeriod: string // 견적서 유효기간 (코드값)
    shippingFeeType: 'free' | 'fixed' | 'conditional' // 배송비종류
    shippingFee: number // 배송비
    returnShippingFee: number // 반품배송비
    bundleShipping: boolean // 묶음배송여부
    jejuShipping: boolean // 제주배송여부
    jejuAdditionalFee: number // 제주추가배송비
    detailHtmlTemplate: string // 상세설명HTML
    marginRate: number // 마진율
    /**
     * 옵션 처리 방법
     * - 'split': 옵션별로 풀어서 각각 개별 상품으로 생성 (기본값)
     * - 'single': 옵션이 있는 상품을 하나의 상품으로 묶어서 생성
     */
    optionHandling: 'split' | 'single'
  }
  createdAt: string
  updatedAt: string
}
