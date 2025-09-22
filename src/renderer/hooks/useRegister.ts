import { useRecoilState, useRecoilCallback } from 'recoil'
import { message } from 'antd'
import { productDataState, selectedProductKeysState, registerSettingsState } from '../stores/registerStore'
import { usePermission } from './usePermission'

const { ipcRenderer } = window.require('electron')

export const useRegister = () => {
  const [products, setProducts] = useRecoilState(productDataState)
  const [selectedKeys, setSelectedKeys] = useRecoilState(selectedProductKeysState)
  const [settings, setSettings] = useRecoilState(registerSettingsState)
  const { permission, checkPermission } = usePermission()

  // Excel 데이터 로드
  const loadExcelData = useRecoilCallback(
    ({ set }) =>
      async () => {
        try {
          const settingsData = await ipcRenderer.invoke('get-settings')
          if (!settingsData?.excelPath) {
            message.warning('Excel 파일 경로가 설정되지 않았습니다.')
            return
          }
          if (!settingsData?.fileDir) {
            message.warning('파일 폴더가 설정되지 않았습니다.')
            return
          }

          set(registerSettingsState, prev => ({ ...prev, loading: true }))

          const productsData = await ipcRenderer.invoke('load-excel-data', {
            excelPath: settingsData.excelPath,
            fileDir: settingsData.fileDir,
          })

          const loadedData = productsData.map((p: any, index: number) => ({
            key: index.toString(),
            goodsName: p.goodsName,
            spec: p.spec,
            modelName: p.modelName,
            originalData: p,
          }))

          set(productDataState, loadedData)
          set(
            selectedProductKeysState,
            loadedData.map(item => item.key),
          )

          message.success('Excel 데이터를 성공적으로 불러왔습니다.')
          // 현재 선택된 엑셀 경로를 상태에 보관 (UI 표시용)
          set(registerSettingsState, prev => ({ ...prev, excelPath: settingsData.excelPath }))
        } catch (error) {
          console.error('Failed to load Excel data:', error)
          message.error('데이터 로드에 실패했습니다.')
        } finally {
          set(registerSettingsState, prev => ({ ...prev, loading: false }))
        }
      },
    [],
  )

  // 결과 폴더 열기
  const openResultFolder = useRecoilCallback(
    () => async () => {
      try {
        const settingsData = await ipcRenderer.invoke('get-settings')
        if (!settingsData?.excelPath) {
          message.warning('결과 폴더 경로가 설정되지 않았습니다.')
          return
        }

        await ipcRenderer.invoke('open-folder', settingsData.excelPath)
      } catch (error) {
        console.error('Failed to open folder:', error)
        message.error('폴더를 여는 중 오류가 발생했습니다.')
      }
    },
    [],
  )

  // 상품 등록
  const registerProducts = useRecoilCallback(
    ({ snapshot, set }) =>
      async () => {
        try {
          const currentSelectedKeys = await snapshot.getPromise(selectedProductKeysState)
          const currentProducts = await snapshot.getPromise(productDataState)

          if (currentSelectedKeys.length === 0) {
            message.warning('등록할 상품을 선택해주세요.')
            return
          }

          const settingsData = await ipcRenderer.invoke('get-settings')
          if (!settingsData?.loginId || !settingsData?.loginPw) {
            message.error('로그인 정보가 설정되지 않았습니다.')
            return
          }

          set(registerSettingsState, prev => ({ ...prev, loading: true }))

          // 전체 데이터 유지, 선택 여부 포함
          const allProducts = currentProducts.map(item => ({
            ...item.originalData,
            selected: currentSelectedKeys.includes(item.key),
          }))

          const result = await ipcRenderer.invoke('start-and-register-products', { allProducts })

          if (result.success) {
            message.success('모든 상품이 성공적으로 처리했습니다')
          } else {
            message.error(`일부 상품 등록 실패: ${result.error}`)
          }
        } catch (error) {
          console.error('Register process failed:', error)
          message.error('상품 등록 과정에서 오류가 발생했습니다.')
        } finally {
          set(registerSettingsState, prev => ({ ...prev, loading: false }))
        }
      },
    [],
  )

  // 관리일 연장
  const extendManagementDate = useRecoilCallback(
    ({ snapshot, set }) =>
      async () => {
        try {
          const currentSettings = await snapshot.getPromise(registerSettingsState)
          const settingsData = await ipcRenderer.invoke('get-settings')

          if (!settingsData?.loginId || !settingsData?.loginPw) {
            message.error('로그인 정보가 설정되지 않았습니다.')
            return
          }
          if (!currentSettings.dateRange) {
            message.error('기간을 선택해주세요.')
            return
          }

          const [start, end] = currentSettings.dateRange
          await ipcRenderer.invoke('extend-management-date', {
            startDate: start.format('YYYYMMDD'),
            endDate: end.format('YYYYMMDD'),
            registrationStatus: currentSettings.registrationStatus,
          })
          message.success('관리일이 성공적으로 변경되었습니다.')
        } catch (error) {
          console.error('관리일 연장 실패:', error)
          message.error('관리일 연장 중 오류가 발생했습니다.')
        }
      },
    [],
  )

  // 등록 취소
  const cancelRegistration = useRecoilCallback(
    () => async () => {
      await ipcRenderer.invoke('cancel-registration')
    },
    [],
  )

  // 설정 업데이트 함수들
  const updateDateRange = useRecoilCallback(
    ({ set }) =>
      (dateRange: [any, any]) => {
        set(registerSettingsState, prev => ({ ...prev, dateRange }))
      },
    [],
  )

  const updateRegistrationStatus = useRecoilCallback(
    ({ set }) =>
      (registrationStatus: string) => {
        set(registerSettingsState, prev => ({ ...prev, registrationStatus }))
      },
    [],
  )

  return {
    products,
    selectedKeys,
    settings,
    permission,
    setSelectedKeys,
    checkPermission,
    loadExcelData,
    openResultFolder,
    registerProducts,
    extendManagementDate,
    cancelRegistration,
    updateDateRange,
    updateRegistrationStatus,
  }
}
