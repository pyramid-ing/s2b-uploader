import { useRecoilState, useRecoilCallback } from 'recoil'
import { message } from 'antd'
import { pricingSettingsState } from '../stores/pricingStore'
import { usePermission } from './usePermission'

const { ipcRenderer } = window.require('electron')

export const usePricing = () => {
  const [settings, setSettings] = useRecoilState(pricingSettingsState)
  const { permission, checkPermission } = usePermission()

  const updatePricing = useRecoilCallback(
    ({ snapshot, set }) =>
      async () => {
        try {
          const currentSettings = await snapshot.getPromise(pricingSettingsState)
          const settingsData = await ipcRenderer.invoke('get-settings')

          if (!settingsData?.loginId || !settingsData?.loginPw) {
            message.error('로그인 정보가 설정되지 않았습니다.')
            return
          }
          if (!Number.isFinite(currentSettings.priceChangePercent) || currentSettings.priceChangePercent === 0) {
            message.error('금액변경 % 값을 입력해주세요.')
            return
          }

          set(pricingSettingsState, prev => ({ ...prev, loading: true }))

          const [start, end] = currentSettings.dateRange
          await ipcRenderer.invoke('update-pricing', {
            startDate: start.format('YYYYMMDD'),
            endDate: end.format('YYYYMMDD'),
            registrationStatus: currentSettings.registrationStatus,
            searchQuery: currentSettings.searchQuery,
            priceChangePercent: currentSettings.priceChangePercent,
          })
          message.success('가격이 성공적으로 변경되었습니다.')
        } catch (error) {
          console.error('가격 변경 실패:', error)
          message.error('가격 변경 중 오류가 발생했습니다.')
        } finally {
          set(pricingSettingsState, prev => ({ ...prev, loading: false }))
        }
      },
    [],
  )

  const updateDateRange = useRecoilCallback(
    ({ set }) =>
      (dateRange: [any, any]) => {
        set(pricingSettingsState, prev => ({ ...prev, dateRange }))
      },
    [],
  )

  const updateRegistrationStatus = useRecoilCallback(
    ({ set }) =>
      (registrationStatus: string) => {
        set(pricingSettingsState, prev => ({ ...prev, registrationStatus }))
      },
    [],
  )

  const updateSearchQuery = useRecoilCallback(
    ({ set }) =>
      (searchQuery: string) => {
        set(pricingSettingsState, prev => ({ ...prev, searchQuery }))
      },
    [],
  )

  const updatePriceChangePercent = useRecoilCallback(
    ({ set }) =>
      (priceChangePercent: number) => {
        set(pricingSettingsState, prev => ({ ...prev, priceChangePercent }))
      },
    [],
  )

  return {
    settings,
    permission,
    checkPermission,
    updatePricing,
    updateDateRange,
    updateRegistrationStatus,
    updateSearchQuery,
    updatePriceChangePercent,
  }
}
