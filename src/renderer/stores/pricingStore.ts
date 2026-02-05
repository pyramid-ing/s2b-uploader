import { atom } from 'recoil'
import dayjs, { type Dayjs } from 'dayjs'
import { REGISTRATION_STATUS } from './managementStore'

export type RoundingBase = 1 | 10 | 100 | 1000 | 10000
export type RoundingMode = 'ceil' | 'floor' | 'round' | 'halfDown'

export interface PricingSettings {
  dateRange: [Dayjs, Dayjs] | null
  statusDateRange: [Dayjs, Dayjs] | null
  registrationStatus: string
  searchQuery: string
  priceChangePercent: number
  roundingBase: RoundingBase
  roundingMode: RoundingMode
  loading: boolean
}

export const ROUNDING_BASE_OPTIONS: { value: RoundingBase; label: string }[] = [
  { value: 1, label: '1원' },
  { value: 10, label: '10원' },
  { value: 100, label: '100원' },
  { value: 1000, label: '1,000원' },
  { value: 10000, label: '10,000원' },
]

export const ROUNDING_MODE_OPTIONS: { value: RoundingMode; label: string }[] = [
  { value: 'ceil', label: '올림' },
  { value: 'floor', label: '내림' },
  { value: 'round', label: '반올림' },
  { value: 'halfDown', label: '반내림' },
]

// 가격 수정 설정을 저장하는 atom
export const pricingSettingsState = atom<PricingSettings>({
  key: 'pricingSettingsState',
  default: {
    dateRange: [dayjs(), dayjs().add(3, 'month')],
    statusDateRange: [dayjs().subtract(3, 'month'), dayjs()],
    registrationStatus: REGISTRATION_STATUS.COMPLETED,
    searchQuery: '',
    priceChangePercent: 10,
    roundingBase: 10,
    roundingMode: 'floor',
    loading: false,
  },
})
