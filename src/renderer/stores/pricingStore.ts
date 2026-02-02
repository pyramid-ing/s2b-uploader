import { atom } from 'recoil'
import dayjs, { type Dayjs } from 'dayjs'
import { REGISTRATION_STATUS } from './managementStore'

export interface PricingSettings {
  dateRange: [Dayjs, Dayjs]
  registrationStatus: string
  searchQuery: string
  priceChangePercent: number
  loading: boolean
}

// 가격 수정 설정을 저장하는 atom
export const pricingSettingsState = atom<PricingSettings>({
  key: 'pricingSettingsState',
  default: {
    dateRange: [dayjs(), dayjs().add(3, 'month')],
    registrationStatus: REGISTRATION_STATUS.ALL,
    searchQuery: '',
    priceChangePercent: 0,
    loading: false,
  },
})
