import { useRecoilState, useRecoilCallback } from 'recoil'
import { message } from 'antd'
import { permissionState } from '../stores/permissionStore'

const { ipcRenderer } = window.require('electron')

export const usePermission = () => {
  const [permission, setPermission] = useRecoilState(permissionState)

  // 권한 체크
  const checkPermission = useRecoilCallback(
    ({ set }) =>
      async () => {
        try {
          set(permissionState, prev => ({ ...prev, isLoading: true }))

          const settingsData = await ipcRenderer.invoke('get-settings')
          if (!settingsData?.loginId) {
            message.error('로그인 정보가 설정되지 않았습니다.')
            set(permissionState, prev => ({ ...prev, hasPermission: false, isLoading: false }))
            return
          }

          const result = await ipcRenderer.invoke('check-account-validity', {
            accountId: settingsData.loginId,
          })

          set(permissionState, prev => ({ ...prev, hasPermission: result, isLoading: false }))
        } catch (error) {
          console.error('권한 체크 실패:', error)
          set(permissionState, prev => ({ ...prev, hasPermission: false, isLoading: false }))
          message.error('권한 체크 중 오류가 발생했습니다.')
        }
      },
    [],
  )

  // 권한 상태 초기화
  const resetPermissionState = useRecoilCallback(
    ({ set }) =>
      () => {
        set(permissionState, {
          hasPermission: null,
          isLoading: false,
        })
      },
    [],
  )

  return {
    permission,
    checkPermission,
    resetPermissionState,
  }
}
