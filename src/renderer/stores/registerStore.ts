import { atom } from 'recoil'
import dayjs, { type Dayjs } from 'dayjs'

export interface ProductData {
  key: string
  goodsName: string
  spec: string
  modelName: string
  result?: string
  originalData?: any
}

export interface RegisterSettings {
  dateRange: [Dayjs, Dayjs]
  registrationStatus: string
  loading: boolean
  excelPath?: string
  accounts: RegisterAccountPreset[]
  selectedAccountId?: string
}

export interface RegisterAccountPreset {
  id: string
  name?: string
  loginId: string
  loginPw?: string
  lastRegisteredIp?: string
  deliveryAreaPresetMode?: 'nationwide' | 'custom'
  deliveryAreas?: string[]
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

// 상품 데이터를 저장하는 atom (LocalStorage 연동)
export const productDataState = atom<ProductData[]>({
  key: 'productDataState',
  default: [],
  effects: [
    ({ setSelf, onSet }) => {
      const PRODUCT_STORAGE_KEY = 's2b_products_db'
      const savedValue = localStorage.getItem(PRODUCT_STORAGE_KEY)
      if (savedValue != null) {
        try {
          setSelf(JSON.parse(savedValue))
        } catch (e) {
          console.error('Failed to parse saved products:', e)
        }
      }

      onSet((newValue, _, isReset) => {
        if (isReset) {
          localStorage.removeItem(PRODUCT_STORAGE_KEY)
        } else {
          localStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(newValue))
        }
      })
    },
  ],
})

// 선택된 상품 키들을 저장하는 atom
export const selectedProductKeysState = atom<React.Key[]>({
  key: 'selectedProductKeysState',
  default: [],
})

// 등록 설정을 저장하는 atom
export const registerSettingsState = atom<RegisterSettings>({
  key: 'registerSettingsState',
  default: {
    dateRange: [dayjs(), dayjs().add(3, 'month')],
    registrationStatus: REGISTRATION_STATUS.ALL,
    loading: false,
    excelPath: undefined,
    accounts: [],
    selectedAccountId: undefined,
  },
})
