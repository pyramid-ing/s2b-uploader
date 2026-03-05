import { useRecoilState, useRecoilCallback } from 'recoil'
import { message } from 'antd'
import { productDataState, selectedProductKeysState, registerSettingsState, Product } from '../stores/registerStore'
import { usePermission } from './usePermission'

const { ipcRenderer } = window.require('electron')

export const useRegister = () => {
  const [products, setProducts] = useRecoilState(productDataState)
  const [selectedKeys, setSelectedKeys] = useRecoilState(selectedProductKeysState)
  const [settings, setSettings] = useRecoilState(registerSettingsState)
  const { permission, checkPermission } = usePermission()

  // 서버에서 상품 목록 불러오기
  const loadProducts = useRecoilCallback(
    ({ set }) =>
      async () => {
        try {
          const serverProducts = await ipcRenderer.invoke('get-products')
          set(productDataState, serverProducts || [])
          return serverProducts || []
        } catch (error) {
          console.error('Failed to load products from server:', error)
          return []
        }
      },
    [],
  )

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

  // Excel 데이터 업로드 → 서버에 저장
  const uploadExcelData = useRecoilCallback(
    ({ set }) =>
      async (filePath: string) => {
        try {
          const settingsData = await ipcRenderer.invoke('get-settings')
          if (!settingsData?.fileDir) {
            message.warning('파일 폴더가 설정되지 않았습니다. 설정에서 먼저 지정해주세요.')
            return
          }

          set(registerSettingsState, prev => ({ ...prev, loading: true }))

          // 서버에서 엑셀 로드 → ExcelRegistrationData[] 반환
          const productsData = await ipcRenderer.invoke('load-excel-data', {
            excelPath: filePath,
            fileDir: settingsData.fileDir,
          })

          // ExcelRegistrationData를 Product로 변환하여 서버에 저장
          // 서버 측에서 convert 후 save
          const products: Product[] = productsData.map((p: any, index: number) => ({
            id: `excel-${Date.now()}-${index}`,
            name: p.goodsName || p['물품명'] || '',
            spec: p.spec || p['규격'] || '',
            modelName: p.modelName || p['모델명'] || '',
            manufacturer: p.factory || p['제조사'] || '',
            material: p.material || p['소재/재질'] || '',
            salesUnit: p.salesUnit || p['판매단위'] || '개',
            stockQuantity: parseInt(p.remainQnt || '9999', 10) || 9999,
            price: parseInt(p.estimateAmt || '0', 10) || 0,
            taxType: p.taxType || '과세(세금계산서)',
            saleType: p.saleTypeText || '물품',
            warranty: p.assure || '1년',
            category1: p.category1 || '',
            category2: p.category2 || '',
            category3: p.category3 || '',
            g2bNumber: p.g2bNumber || '',
            deliveryPeriod: p.deliveryLimitText || '7일',
            quoteValidity: p.estimateValidity || '30일',
            deliveryFeeType: p.deliveryFeeKindText || '무료',
            deliveryFee: parseFloat(p.deliveryFee || '0') || 0,
            returnFee: parseFloat(p.returnFee || '3500') || 3500,
            bundleShipping: (p.deliveryGroupYn || 'Y') === 'Y',
            jejuShipping: (p.jejuDeliveryYn || 'N') === 'Y',
            jejuAdditionalFee: parseFloat(p.jejuDeliveryFee || '0') || 0,
            deliveryMethod: p.deliveryMethod || '택배',
            deliveryAreas: p.deliveryAreas || [],
            image1: p.image1 || '',
            image2: p.image2 || '',
            addImage1: p.addImage1 || '',
            addImage2: p.addImage2 || '',
            detailImage: p.detailImage || '',
            detailHtml: p.detailHtml || '',
            originType: p.originType || '국내',
            originLocal: p.originLocal || '',
            originForeign: p.originForeign || '',
            kidsKcType: p.kidsKcType || 'N',
            kidsKcCertId: p.kidsKcCertId || '',
            kidsKcFile: p.kidsKcFile || '',
            elecKcType: p.elecKcType || 'N',
            elecKcCertId: p.elecKcCertId || '',
            elecKcFile: p.elecKcFile || '',
            dailyKcType: p.dailyKcType || 'N',
            dailyKcCertId: p.dailyKcCertId || '',
            dailyKcFile: p.dailyKcFile || '',
            broadcastingKcType: p.broadcastingKcType || 'N',
            broadcastingKcCertId: p.broadcastingKcCertId || '',
            broadcastingKcFile: p.broadcastingKcFile || '',
            childExitCheckerKcType: p.childExitCheckerKcType || 'N',
            childExitCheckerKcCertId: '',
            childExitCheckerKcFile: '',
            safetyCheckKcType: p.safetyCheckKcType || 'N',
            safetyCheckKcCertId: '',
            safetyCheckKcFile: '',
            consumptionPeriodType: '',
            consumptionPeriodValue: '',
            ratedPower: '',
            sizeAndWeight: '',
            sameModelDate: '',
            coolingHeatingArea: '',
            productComposition: '',
            safetyMark: '',
            capacity: '',
            mainSpec: '',
            certWoman: false,
            certDisabledCompany: false,
            certFoundation: false,
            certDisabled: false,
            certSevereDisabled: false,
            certCooperation: false,
            certSociety: false,
            certRecycle: false,
            certEnvironment: false,
            certLowCarbon: false,
            certSwQuality: false,
            certNep: false,
            certNet: false,
            certGreenProduct: false,
            certEpc: false,
            certProcure: false,
            certTown: false,
            certSelf: false,
            certCollaboration: false,
            certReserve: false,
            ppsContractYn: false,
            ppsContractStartDate: '',
            ppsContractEndDate: '',
            phone: p.asTelephone1 || '',
            asPhone: p.asTelephone2 || '',
            naraRegistered: false,
            naraPrice: '',
            otherSiteName: '',
            otherSiteUrl: '',
            otherSiteRegistered: false,
            otherSitePrice: '',
            addressCode: '',
            address: '',
            addressDetail: '',
            approvalRequest: '',
            sourceUrl: '',
            listThumbnail: '',
            result: '',
          }))

          const savedProducts = await ipcRenderer.invoke('save-products', { products })
          set(productDataState, savedProducts)
          set(
            selectedProductKeysState,
            products.map((item: Product) => item.id),
          )

          message.success(`${products.length}개의 상품 정보를 저장했습니다.`)
        } catch (error) {
          console.error('Failed to upload Excel data:', error)
          message.error('데이터 업로드에 실패했습니다.')
        } finally {
          set(registerSettingsState, prev => ({ ...prev, loading: false }))
        }
      },
    [],
  )

  // 모든 상품 삭제
  const clearProducts = useRecoilCallback(
    ({ set }) =>
      async () => {
        await ipcRenderer.invoke('clear-products')
        set(productDataState, [])
        set(selectedProductKeysState, [])
        message.success('등록 목록이 초기화되었습니다.')
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

          // 서버에 productIds를 전달 (Product → ExcelRegistrationData 변환은 서버에서)
          const result = await ipcRenderer.invoke('start-and-register-products', {
            productIds: currentSelectedKeys,
            accountId: selectedAccount.id,
          })

          // 서버에서 업데이트된 상품 목록 다시 불러오기
          const updatedProducts = await ipcRenderer.invoke('get-products')
          set(productDataState, updatedProducts)

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

  // 상품 추가 (소싱 페이지 등에서 호출) → 서버에 저장
  const addProducts = useRecoilCallback(
    ({ set }) =>
      async (newProducts: Product[]) => {
        const savedProducts = await ipcRenderer.invoke('save-products', { products: newProducts })
        set(productDataState, savedProducts)
        set(selectedProductKeysState, prev => {
          const newKeys = newProducts.map(p => p.id)
          return [...prev, ...newKeys]
        })
        message.success(`${newProducts.length}개의 상품이 등록 목록에 추가되었습니다.`)
      },
    [],
  )

  // 상품 삭제 → 서버에서 삭제
  const removeProducts = useRecoilCallback(
    ({ set }) =>
      async (ids: string[]) => {
        const updatedProducts = await ipcRenderer.invoke('delete-products', { ids })
        set(productDataState, updatedProducts)
        set(selectedProductKeysState, prev => prev.filter(k => !ids.includes(k)))
        message.success(`${ids.length}개의 상품이 삭제되었습니다.`)
      },
    [],
  )

  // 상품 수정 → 서버에 저장
  const updateProduct = useRecoilCallback(
    ({ set }) =>
      async (id: string, updatedData: Partial<Product>) => {
        const currentProducts = await ipcRenderer.invoke('get-products')
        const target = currentProducts.find((p: Product) => p.id === id)
        if (!target) return
        const updated = { ...target, ...updatedData }
        const savedProducts = await ipcRenderer.invoke('update-product', { product: updated })
        set(productDataState, savedProducts)
      },
    [],
  )

  return {
    products,
    selectedKeys,
    setSelectedKeys,
    settings,
    permission,
    checkPermission,
    loadProducts,
    uploadExcelData,
    clearProducts,
    openResultFolder,
    registerProducts,
    extendManagementDate,
    cancelRegistration,
    updateDateRange,
    updateRegistrationStatus,
    updateSelectedAccountId,
    syncAccountPresets,
    addProducts,
    removeProducts,
    updateProduct,
  }
}
