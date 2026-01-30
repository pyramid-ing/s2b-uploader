import { atom } from 'recoil'
import { REGISTRATION_STATUS } from './managementStore'

export interface PricingSettings {
  registrationStatus: string
  searchQuery: string
  priceChangePercent: number
  loading: boolean
}

// 가격 수정 설정을 저장하는 atom
export const pricingSettingsState = atom<PricingSettings>({
  key: 'pricingSettingsState',
  default: {
    registrationStatus: REGISTRATION_STATUS.ALL,
    searchQuery: '',
    priceChangePercent: 0,
    loading: false,
  },
})
