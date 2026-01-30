import { useRecoilState, useRecoilCallback } from 'recoil'
import { message } from 'antd'
import { managementSettingsState } from '../stores/managementStore'
import { usePermission } from './usePermission'

const { ipcRenderer } = window.require('electron')

export const useManagement = () => {
  const [settings, setSettings] = useRecoilState(managementSettingsState)
  const { permission, checkPermission } = usePermission()

  // 관리일 연장 + 가격 변경
  const updateManagementDateAndPrice = useRecoilCallback(
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
          if (!currentSettings.useManagementDateRange && !currentSettings.usePriceChange) {
            message.error('관리일 연장 또는 가격 변경 중 하나를 선택해주세요.')
            return
          }
          if (!Number.isFinite(currentSettings.priceChangePercent)) {
            message.error('금액변경 % 값을 확인해주세요.')
            return
          }
          if (currentSettings.usePriceChange && currentSettings.priceChangePercent === 0) {
            message.error('가격 변경을 선택한 경우 금액변경 % 값을 입력해주세요.')
            return
          }

          set(managementSettingsState, prev => ({ ...prev, loading: true }))

          const [start, end] = currentSettings.dateRange
          await ipcRenderer.invoke('update-management-date-price', {
            startDate: currentSettings.useManagementDateRange ? start.format('YYYYMMDD') : null,
            endDate: currentSettings.useManagementDateRange ? end.format('YYYYMMDD') : null,
            registrationStatus: currentSettings.registrationStatus,
            searchQuery: currentSettings.searchQuery,
            priceChangePercent: currentSettings.usePriceChange ? currentSettings.priceChangePercent : 0,
            useManagementDateRange: currentSettings.useManagementDateRange,
            usePriceChange: currentSettings.usePriceChange,
          })
          message.success('관리일/가격이 성공적으로 변경되었습니다.')
        } catch (error) {
          console.error('관리일/가격 변경 실패:', error)
          message.error('관리일/가격 변경 중 오류가 발생했습니다.')
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

  const updatePriceChangePercent = useRecoilCallback(
    ({ set }) =>
      (priceChangePercent: number) => {
        set(managementSettingsState, prev => ({ ...prev, priceChangePercent }))
      },
    [],
  )

  const updateUseManagementDateRange = useRecoilCallback(
    ({ set }) =>
      (useManagementDateRange: boolean) => {
        set(managementSettingsState, prev => ({ ...prev, useManagementDateRange }))
      },
    [],
  )

  const updateUsePriceChange = useRecoilCallback(
    ({ set }) =>
      (usePriceChange: boolean) => {
        set(managementSettingsState, prev => ({ ...prev, usePriceChange }))
      },
    [],
  )

  return {
    settings,
    permission,
    checkPermission,
    updateManagementDateAndPrice,
    updateDateRange,
    updateRegistrationStatus,
    updateSearchQuery,
    updatePriceChangePercent,
    updateUseManagementDateRange,
    updateUsePriceChange,
  }
}
