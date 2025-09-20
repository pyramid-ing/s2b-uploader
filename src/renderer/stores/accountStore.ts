import { atom } from 'recoil'

export interface AccountState {
  isAccountValid: boolean | null
  isLoading: boolean
}

// 계정 상태를 저장하는 atom
export const accountState = atom<AccountState>({
  key: 'accountState',
  default: {
    isAccountValid: null,
    isLoading: false,
  },
})
