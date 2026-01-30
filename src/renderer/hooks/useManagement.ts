import { useRecoilState, useRecoilCallback } from 'recoil'
import { message } from 'antd'
import { managementSettingsState } from '../stores/managementStore'
import { usePermission } from './usePermission'

const { ipcRenderer } = window.require('electron')

export const useManagement = () => {
  const [settings, setSettings] = useRecoilState(managementSettingsState)
  const { permission, checkPermission } = usePermission()

  // 관리일 연장
  const extendManagementDate = useRecoilCallback(
    ({ snapshot, set }) =>
      async () => {
        try {
          const currentSettings = await snapshot.getPromise(managementSettingsState)
          const settingsData = await ipcRenderer.invoke('get-settings')

          if (!settingsData?.loginId || !settingsData?.loginPw) {
            message.error('로그인 정보가 설정되지 않았습니다.')
            return
          }
          if (!currentSettings.dateRange) {
            message.error('기간을 선택해주세요.')
            return
          }

          set(managementSettingsState, prev => ({ ...prev, loading: true }))

          const [start, end] = currentSettings.dateRange
          await ipcRenderer.invoke('extend-management-date', {
            startDate: start.format('YYYYMMDD'),
            endDate: end.format('YYYYMMDD'),
            registrationStatus: currentSettings.registrationStatus,
            searchQuery: currentSettings.searchQuery,
          })
          message.success('관리일이 성공적으로 변경되었습니다.')
        } catch (error) {
          console.error('관리일 연장 실패:', error)
          message.error('관리일 연장 중 오류가 발생했습니다.')
        } finally {
          set(managementSettingsState, prev => ({ ...prev, loading: false }))
        }
      },
    [],
  )

  // 설정 업데이트 함수들
  const updateDateRange = useRecoilCallback(
    ({ set }) =>
      (dateRange: [any, any]) => {
        set(managementSettingsState, prev => ({ ...prev, dateRange }))
      },
    [],
  )

  const updateRegistrationStatus = useRecoilCallback(
    ({ set }) =>
      (registrationStatus: string) => {
        set(managementSettingsState, prev => ({ ...prev, registrationStatus }))
      },
    [],
  )

  const updateSearchQuery = useRecoilCallback(
    ({ set }) =>
      (searchQuery: string) => {
        set(managementSettingsState, prev => ({ ...prev, searchQuery }))
      },
    [],
  )

  return {
    settings,
    permission,
    checkPermission,
    extendManagementDate,
    updateDateRange,
    updateRegistrationStatus,
    updateSearchQuery,
  }
}
