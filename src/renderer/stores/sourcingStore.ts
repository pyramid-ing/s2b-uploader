import { atom } from 'recoil'
import { AtomEffect } from 'recoil'

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
  result?: string // 수집 결과
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

// 소싱 아이템들을 저장하는 atom
export const sourcingItemsState = atom<SourcingItem[]>({
  key: 'sourcingItemsState',
  default: [],
})

// 선택된 소싱 아이템들의 키를 저장하는 atom
export const selectedSourcingKeysState = atom<React.Key[]>({
  key: 'selectedSourcingKeysState',
  default: [],
})

// 소싱 설정을 저장하는 atom
export const sourcingSettingsState = atom<SourcingSettings>({
  key: 'sourcingSettingsState',
  default: {
    marginRate: 20,
    detailHtmlTemplate: '<p>상세설명을 입력하세요.</p>',
    s2bMinDelaySec: 5, // 기본값: 5초
    s2bMaxDelaySec: 30, // 기본값: 30초
  },
})

// 설정값 세트들을 저장하는 atom
export const sourcingConfigSetsState = atom<SourcingConfigSet[]>({
  key: 'sourcingConfigSetsState',
  default: [],
})

// 현재 활성화된 설정값 세트 ID를 저장하는 atom
export const activeConfigSetIdState = atom<string | null>({
  key: 'activeConfigSetIdState',
  default: null,
})

// localStorage와 동기화하는 effect
const localStorageEffect: <T>(key: string) => AtomEffect<T> =
  key =>
  ({ setSelf, onSet }) => {
    const savedValue = localStorage.getItem(key)
    if (savedValue != null) {
      setSelf(JSON.parse(savedValue))
    }

    onSet((newValue, _, isReset) => {
      isReset ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(newValue))
    })
  }

// 영상 collapse 상태를 저장하는 atom
export const videoCollapsedState = atom<boolean>({
  key: 'videoCollapsedState',
  default: false,
  effects: [localStorageEffect<boolean>('sourcing-video-collapsed')],
})
