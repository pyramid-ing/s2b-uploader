import { useRecoilState, useRecoilCallback } from 'recoil'
import { message } from 'antd'
import { accountState } from '../stores/accountStore'

const { ipcRenderer } = window.require('electron')

export const useAccount = () => {
  const [account, setAccount] = useRecoilState(accountState)

  // 계정 유효성 확인
  const checkAccountValidity = useRecoilCallback(
    ({ set }) =>
      async () => {
        try {
          set(accountState, prev => ({ ...prev, isLoading: true }))

          const settingsData = await ipcRenderer.invoke('get-settings')
          if (!settingsData?.loginId) {
            message.error('로그인 정보가 설정되지 않았습니다.')
            set(accountState, prev => ({ ...prev, isAccountValid: false, isLoading: false }))
            return
          }

          const result = await ipcRenderer.invoke('check-account-validity', {
            accountId: settingsData.loginId,
          })

          set(accountState, prev => ({ ...prev, isAccountValid: result, isLoading: false }))
        } catch (error) {
          console.error('계정 유효성 확인 실패:', error)
          set(accountState, prev => ({ ...prev, isAccountValid: false, isLoading: false }))
          message.error('계정 유효성 확인 중 오류가 발생했습니다.')
        }
      },
    [],
  )

  // 계정 상태 초기화
  const resetAccountState = useRecoilCallback(
    ({ set }) =>
      () => {
        set(accountState, {
          isAccountValid: null,
          isLoading: false,
        })
      },
    [],
  )

  return {
    account,
    checkAccountValidity,
    resetAccountState,
  }
}
