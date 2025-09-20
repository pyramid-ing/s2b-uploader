import { atom } from 'recoil'

export interface PermissionState {
  hasPermission: boolean | null
  isLoading: boolean
}

// 권한 상태를 저장하는 atom
export const permissionState = atom<PermissionState>({
  key: 'permissionState',
  default: {
    hasPermission: null,
    isLoading: false,
  },
})
