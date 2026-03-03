import { useRecoilState, useRecoilCallback } from 'recoil'
import { message } from 'antd'
import { productDataState, selectedProductKeysState, registerSettingsState, ProductData } from '../stores/registerStore'
import { usePermission } from './usePermission'

const { ipcRenderer } = window.require('electron')

export const useRegister = () => {
  const [products, setProducts] = useRecoilState(productDataState)
  const [selectedKeys, setSelectedKeys] = useRecoilState(selectedProductKeysState)
  const [settings, setSettings] = useRecoilState(registerSettingsState)
  const { permission, checkPermission } = usePermission()

  const syncAccountPresets = useRecoilCallback(
    ({ set, snapshot }) =>
      async (settingsData?: any) => {
        const nextSettings = settingsData || (await ipcRenderer.invoke('get-settings'))
        const rawAccounts = Array.isArray(nextSettings?.accounts) ? nextSettings.accounts : []
        const accounts = rawAccounts
          .filter((account: any) => account?.id && account?.loginId)
          .map((account: any) => ({
            id: String(account.id),
            name: typeof account.name === 'string' ? account.name : '',
            loginId: String(account.loginId),
            loginPw: typeof account.loginPw === 'string' ? account.loginPw : '',
            lastRegisteredIp: typeof account.lastRegisteredIp === 'string' ? account.lastRegisteredIp : '',
            deliveryAreaPresetMode:
              account.deliveryAreaPresetMode === 'custom' &&
              Array.isArray(account.deliveryAreas) &&
              account.deliveryAreas.length > 0
                ? 'custom'
                : 'nationwide',
            deliveryAreas: Array.isArray(account.deliveryAreas) ? account.deliveryAreas : [],
          }))

        const current = await snapshot.getPromise(registerSettingsState)
        const selectedAccountId =
          accounts.find((account: any) => account.id === current.selectedAccountId)?.id ||
          accounts.find((account: any) => account.id === nextSettings?.activeAccountId)?.id ||
          accounts[0]?.id

        set(registerSettingsState, prev => ({
          ...prev,
          accounts,
          selectedAccountId,
        }))

        return { accounts, selectedAccountId }
      },
    [],
  )

  // Excel 데이터 로드
  const loadExcelData = useRecoilCallback(
    ({ set }) =>
      async () => {
        try {
          const settingsData = await ipcRenderer.invoke('get-settings')
          await syncAccountPresets(settingsData)
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
            result: p.result || '',
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
          const { accounts, selectedAccountId } = await syncAccountPresets(settingsData)
          const selectedAccount = accounts.find((account: any) => account.id === selectedAccountId)

          if (!selectedAccount?.loginId || !selectedAccount?.loginPw) {
            message.error('로그인 정보가 설정되지 않았습니다.')
            return
          }

          set(registerSettingsState, prev => ({ ...prev, loading: true }))

          // 전체 데이터 유지, 선택 여부 포함
          const allProducts = currentProducts.map(item => ({
            ...item.originalData,
            selected: currentSelectedKeys.includes(item.key),
          }))

          const result = await ipcRenderer.invoke('start-and-register-products', {
            allProducts,
            accountId: selectedAccount.id,
          })

          if (Array.isArray(result?.productResults)) {
            set(productDataState, prev =>
              prev.map((item, index) => ({
                ...item,
                result: result.productResults[index] || '',
              })),
            )
          }

          await syncAccountPresets()

          if (result?.cancelled) {
            message.warning(
              `상품 등록이 중단되었습니다. (성공 ${result.successCount || 0} / 실패 ${result.failCount || 0})`,
            )
          } else if (result?.failCount > 0) {
            message.warning(`일부 상품 등록 실패 (성공 ${result.successCount || 0} / 실패 ${result.failCount})`)
          } else if (result?.success) {
            message.success(
              `모든 상품이 성공적으로 처리되었습니다. (${result.successCount || currentSelectedKeys.length}개)`,
            )
          } else {
            message.error(result?.error || '상품 등록 과정에서 오류가 발생했습니다.')
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

  const updateSelectedAccountId = useRecoilCallback(
    ({ set, snapshot }) =>
      async (selectedAccountId: string) => {
        set(registerSettingsState, prev => ({ ...prev, selectedAccountId }))
        const current = await snapshot.getPromise(registerSettingsState)
        const targetAccount = current.accounts.find(account => account.id === selectedAccountId)
        await checkPermission(targetAccount?.loginId)
      },
    [checkPermission],
  )

  // 상품 추가 (소싱 페이지 등에서 호출)
  const addProducts = useRecoilCallback(
    ({ set }) =>
      (newProducts: ProductData[]) => {
        set(productDataState, prev => {
          // 중복 체크 (기존에 동일한 key나 데이터가 있는지 확인 가능하지만, 일단 단순 추가)
          return [...prev, ...newProducts]
        })
        // 새로 추가된 상품들 선택 상태로 만들기
        set(selectedProductKeysState, prev => {
          const newKeys = newProducts.map(p => p.key)
          return [...prev, ...newKeys]
        })
        message.success(`${newProducts.length}개의 상품이 등록 목록에 추가되었습니다.`)
      },
    [],
  )

  // 상품 수정
  const updateProduct = useRecoilCallback(
    ({ set }) =>
      (key: string, updatedData: Partial<ProductData>) => {
        set(productDataState, prev => prev.map(p => (p.key === key ? { ...p, ...updatedData } : p)))
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
    updateSelectedAccountId,
    syncAccountPresets,
    addProducts,
    updateProduct,
  }
}
