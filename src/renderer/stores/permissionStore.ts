import { atom } from 'recoil'

export interface AccountInfo {
  periodEnd: string | null
  planType: string | null
  periodStart: string | null
  status: string | null
}

export interface PermissionState {
  hasPermission: boolean | null
  isLoading: boolean
  accountInfo: AccountInfo | null
}

// 권한 상태를 저장하는 atom
export const permissionState = atom<PermissionState>({
  key: 'permissionState',
  default: {
    hasPermission: null,
    isLoading: false,
    accountInfo: null,
  },
})
