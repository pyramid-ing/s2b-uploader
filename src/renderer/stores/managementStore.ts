import { atom } from 'recoil'
import { AtomEffect } from 'recoil'
import dayjs, { type Dayjs } from 'dayjs'

export interface ManagementSettings {
  dateRange: [Dayjs, Dayjs]
  registrationStatus: string
  searchQuery: string
  priceChangePercent: number
  useManagementDateRange: boolean
  usePriceChange: boolean
  loading: boolean
}

export const REGISTRATION_STATUS = {
  ALL: '',
  WAITING: '1',
  REQUESTED: '2',
  COMPLETED: '3',
  STOPPED: '4',
  REJECTED: '5',
} as const

export const REGISTRATION_STATUS_LABELS = {
  [REGISTRATION_STATUS.ALL]: '전체',
  [REGISTRATION_STATUS.COMPLETED]: '등록완료',
  [REGISTRATION_STATUS.STOPPED]: '등록중지',
} as const

// 관리일 설정을 저장하는 atom
export const managementSettingsState = atom<ManagementSettings>({
  key: 'managementSettingsState',
  default: {
    dateRange: [dayjs(), dayjs().add(3, 'month')],
    registrationStatus: REGISTRATION_STATUS.ALL,
    searchQuery: '',
    priceChangePercent: 0,
    useManagementDateRange: true,
    usePriceChange: false,
    loading: false,
  },
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
export const managementVideoCollapsedState = atom<boolean>({
  key: 'managementVideoCollapsedState',
  default: false,
  effects: [localStorageEffect<boolean>('management-video-collapsed')],
})
