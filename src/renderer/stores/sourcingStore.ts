import { atom } from 'recoil'

export interface SourcingItem {
  key: string
  name: string
  url: string
  vendor?: string
  price: number
  productCode?: string
  listThumbnail?: string
  downloadDir?: string
  additionalInfo?: any
}

export interface SourcingSettings {
  marginRate: number
  detailHtmlTemplate: string
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
