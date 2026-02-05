import { useRecoilState, useRecoilCallback } from 'recoil'
import { message } from 'antd'
import { pricingSettingsState, type RoundingBase, type RoundingMode } from '../stores/pricingStore'
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
          const pct = currentSettings.priceChangePercent
          if (pct < -10 || pct > 10) {
            message.error('금액변경 %는 -10% ~ 10% 범위만 가능합니다.')
            return
          }

          set(pricingSettingsState, prev => ({ ...prev, loading: true }))

          const dateRange = currentSettings.dateRange
          const start = dateRange?.[0]
          const end = dateRange?.[1]
          const statusDateRange = currentSettings.statusDateRange
          await ipcRenderer.invoke('update-pricing', {
            startDate: start ? start.format('YYYYMMDD') : '',
            endDate: end ? end.format('YYYYMMDD') : '',
            statusDateRange: statusDateRange
              ? {
                  start: statusDateRange[0].format('YYYYMMDD'),
                  end: statusDateRange[1].format('YYYYMMDD'),
                }
              : undefined,
            registrationStatus: currentSettings.registrationStatus,
            searchQuery: currentSettings.searchQuery,
            priceChangePercent: currentSettings.priceChangePercent,
            roundingBase: currentSettings.roundingBase,
            roundingMode: currentSettings.roundingMode,
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
      (dateRange: [any, any] | null) => {
        set(pricingSettingsState, prev => ({ ...prev, dateRange }))
      },
    [],
  )

  const updateStatusDateRange = useRecoilCallback(
    ({ set }) =>
      (statusDateRange: [any, any] | null) => {
        set(pricingSettingsState, prev => ({ ...prev, statusDateRange }))
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

  const updateRoundingBase = useRecoilCallback(
    ({ set }) =>
      (roundingBase: RoundingBase) => {
        set(pricingSettingsState, prev => ({ ...prev, roundingBase }))
      },
    [],
  )

  const updateRoundingMode = useRecoilCallback(
    ({ set }) =>
      (roundingMode: RoundingMode) => {
        set(pricingSettingsState, prev => ({ ...prev, roundingMode }))
      },
    [],
  )

  return {
    settings,
    permission,
    checkPermission,
    updatePricing,
    updateDateRange,
    updateStatusDateRange,
    updateRegistrationStatus,
    updateSearchQuery,
    updatePriceChangePercent,
    updateRoundingBase,
    updateRoundingMode,
  }
}
