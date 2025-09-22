import { useRecoilState, useRecoilCallback } from 'recoil'
import { message } from 'antd'
import {
  sourcingItemsState,
  selectedSourcingKeysState,
  sourcingSettingsState,
  SourcingItem,
} from '../stores/sourcingStore'

const { ipcRenderer } = window.require('electron')

export const useSourcing = () => {
  const [items, setItems] = useRecoilState(sourcingItemsState)
  const [selectedRowKeys, setSelectedRowKeys] = useRecoilState(selectedSourcingKeysState)
  const [settings, setSettings] = useRecoilState(sourcingSettingsState)

  // 설정 불러오기
  const loadSettings = useRecoilCallback(
    ({ set }) =>
      async () => {
        try {
          const savedSettings = await ipcRenderer.invoke('get-settings')
          if (savedSettings) {
            set(sourcingSettingsState, {
              marginRate: savedSettings.marginRate || 20,
              detailHtmlTemplate: savedSettings.detailHtmlTemplate || '<p>상세설명을 입력하세요.</p>',
            })
          }
        } catch (error) {
          console.error('설정 불러오기 실패:', error)
        }
      },
    [],
  )

  // 설정 저장하기
  const saveSettings = useRecoilCallback(
    ({ snapshot }) =>
      async () => {
        try {
          const currentSettings = await snapshot.getPromise(sourcingSettingsState)
          const existingSettings = await ipcRenderer.invoke('get-settings')
          const updatedSettings = {
            ...existingSettings,
            ...currentSettings,
          }
          await ipcRenderer.invoke('save-settings', updatedSettings)
          message.success('설정이 저장되었습니다.')
        } catch (error) {
          console.error('설정 저장 실패:', error)
          message.error('설정 저장에 실패했습니다.')
        }
      },
    [],
  )

  // 현재 페이지 제품 가져오기
  const fetchCurrentPage = useRecoilCallback(
    ({ set }) =>
      async () => {
        try {
          const res = await ipcRenderer.invoke('sourcing-collect-list-current')
          if (!res?.success) throw new Error(res?.error || '수집 실패')

          const mapped: SourcingItem[] = (res.items || []).map((it: any, idx: number) => ({
            key: `${Date.now()}-${idx}`,
            name: it.name,
            url: it.url,
            price: it.price || 0,
            listThumbnail: it.listThumbnail,
          }))

          // URL 기준으로 중복 제거하여 추가
          set(sourcingItemsState, prev => {
            const existingUrls = new Set(prev.map(item => item.url))
            const newItems = mapped.filter(item => !existingUrls.has(item.url))

            if (newItems.length === 0) {
              message.info('새로운 제품이 없습니다. (모든 제품이 이미 목록에 있습니다)')
              return prev
            } else if (newItems.length < mapped.length) {
              message.info(`${newItems.length}개 새 제품 추가 (${mapped.length - newItems.length}개 중복 제품 제외)`)
            } else {
              message.success(`${newItems.length}개 제품을 가져왔습니다.`)
            }

            return [...newItems, ...prev]
          })
        } catch (e) {
          message.error('제품 수집 중 오류가 발생했습니다.')
        }
      },
    [],
  )

  // URL로 1개 제품 가져오기
  const fetchOneByUrl = useRecoilCallback(
    ({ set, snapshot }) =>
      async (urlInput: string) => {
        if (!urlInput) {
          message.warning('URL을 입력하세요.')
          return
        }

        try {
          const currentItems = await snapshot.getPromise(sourcingItemsState)

          // 중복 URL 체크
          const isDuplicate = currentItems.some(item => item.url === urlInput)
          if (isDuplicate) {
            message.warning('이미 목록에 있는 URL입니다. 중복된 제품은 추가되지 않습니다.')
            return
          }

          const res = await ipcRenderer.invoke('sourcing-collect-details', { urls: [urlInput] })
          if (!res?.success) throw new Error(res?.error || '상세 수집 실패')

          const found = (res.items || []).find((d: any) => d.url === urlInput)
          if (found) {
            const item: SourcingItem = {
              ...found,
              key: `${Date.now()}`,
              listThumbnail: found.listThumbnail,
              downloadDir: found.downloadDir,
            }
            set(sourcingItemsState, prev => [item, ...prev])
            message.success('URL 기준으로 1개 항목을 가져왔습니다.')
          } else {
            message.error('해당 URL에서 제품 정보를 찾을 수 없습니다.')
          }
        } catch (e) {
          message.error('제품 수집 중 오류가 발생했습니다.')
        }
      },
    [],
  )

  // 제품 삭제
  const deleteItem = useRecoilCallback(
    ({ set }) =>
      (key: React.Key) => {
        set(sourcingItemsState, prev => prev.filter(i => i.key !== key))
        set(selectedSourcingKeysState, prev => prev.filter(k => k !== key))
      },
    [],
  )

  // 등록 요청 (상세 수집)
  const requestRegister = useRecoilCallback(
    ({ set, snapshot }) =>
      async (keys?: React.Key[]) => {
        const currentSelectedKeys = await snapshot.getPromise(selectedSourcingKeysState)
        const currentItems = await snapshot.getPromise(sourcingItemsState)

        const targetKeys = keys ?? currentSelectedKeys
        if (targetKeys.length === 0) {
          message.warning('등록 요청할 품목을 선택하세요.')
          return
        }

        try {
          const targetItems = currentItems.filter(i => targetKeys.includes(i.key))
          const urls = targetItems.map(i => i.url)
          const res = await ipcRenderer.invoke('sourcing-collect-details', { urls })
          if (!res?.success) throw new Error(res?.error || '상세 수집 실패')

          // 상세 수집 결과를 테이블에 반영 (가격/이름/품목코드/추가정보 업데이트)
          set(sourcingItemsState, prev => {
            return prev.map(it => {
              const found = (res.items || []).find((d: any) => d.url === it.url)
              if (!found) return it
              return {
                ...it,
                ...found,
                downloadDir: found.downloadDir ?? it.downloadDir,
              }
            })
          })
          message.success(`${urls.length}건 상세 수집 완료`)
        } catch (e) {
          message.error('상세 수집 중 오류가 발생했습니다.')
        }
      },
    [],
  )

  // 엑셀 다운로드
  const downloadExcel = useRecoilCallback(
    ({ snapshot }) =>
      async () => {
        try {
          const currentSelectedKeys = await snapshot.getPromise(selectedSourcingKeysState)
          const currentItems = await snapshot.getPromise(sourcingItemsState)

          if (currentSelectedKeys.length === 0) {
            message.warning('다운로드할 소싱 데이터를 선택해주세요.')
            return
          }

          // 선택된 항목만 필터링
          const selectedItems = currentItems.filter(item => currentSelectedKeys.includes(item.key))

          const result = await ipcRenderer.invoke('download-sourcing-excel', { sourcingItems: selectedItems })

          if (result.success) {
            message.success(`선택된 소싱 데이터 엑셀 파일이 성공적으로 저장되었습니다: ${result.fileName}`)
          } else {
            message.error(`엑셀 다운로드 실패: ${result.error}`)
          }
        } catch (error) {
          console.error('Sourcing Excel download failed:', error)
          message.error('엑셀 다운로드 중 오류가 발생했습니다.')
        }
      },
    [],
  )

  // 사이트 열기
  const openVendorSite = useRecoilCallback(
    () => async (vendor: string) => {
      try {
        const res = await ipcRenderer.invoke('sourcing-open-site', { vendor })
        if (!res?.success) throw new Error(res?.error || '사이트 열기 실패')
        message.success('사이트를 열었습니다.')
      } catch (e) {
        message.error('사이트 열기에 실패했습니다.')
      }
    },
    [],
  )

  return {
    // 상태
    items,
    selectedRowKeys,
    settings,

    // 액션
    setItems,
    setSelectedRowKeys,
    setSettings,
    loadSettings,
    saveSettings,
    fetchCurrentPage,
    fetchOneByUrl,
    deleteItem,
    requestRegister,
    downloadExcel,
    openVendorSite,
  }
}
