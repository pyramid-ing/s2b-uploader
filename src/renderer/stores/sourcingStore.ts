import { atom } from 'recoil'

export interface SourcingItem {
  key: string
  name: string
  url: string
  price: number
  productCode?: string
  additionalInfo?: any
}

export interface SourcingSettings {
  marginRate: number
  detailHtmlTemplate: string
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
