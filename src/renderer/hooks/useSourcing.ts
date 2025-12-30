import { useRecoilState, useRecoilCallback } from 'recoil'
import { message } from 'antd'
import { random } from 'lodash'
import {
  sourcingItemsState,
  selectedSourcingKeysState,
  sourcingSettingsState,
  sourcingConfigSetsState,
  activeConfigSetIdState,
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
              s2bMinDelaySec: savedSettings.s2bMinDelaySec ?? 5,
              s2bMaxDelaySec: savedSettings.s2bMaxDelaySec ?? 30,
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

          // 상세설명 HTML 길이 검증
          if (currentSettings.detailHtmlTemplate.length < 10) {
            message.error('상세설명 HTML은 10자 이상 입력해야 합니다.')
            return
          }

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
            vendor: it.vendor,
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

  // 학교장터: 키워드 + 금액범위 + 최대갯수로 자동 페이지네이션 수집
  const fetchS2BFilteredSearch = useRecoilCallback(
    ({ set, snapshot }) =>
      async (params: {
        keyword: string
        minPrice?: number
        maxPrice?: number
        maxCount?: number
        sortCode?: 'RANK' | 'PCAC' | 'CERT' | 'TRUST' | 'DATE' | 'PCDC' | 'REVIEW_COUNT'
        viewCount?: 10 | 20 | 30 | 40 | 50
        pageDelayMs?: number
      }) => {
        try {
          const currentItems = await snapshot.getPromise(sourcingItemsState)
          const res = await ipcRenderer.invoke('sourcing-s2b-filter-search', params)
          if (!res?.success) throw new Error(res?.error || '필터검색 실패')

          const mapped: SourcingItem[] = (res.items || []).map((it: any, idx: number) => ({
            key: `${Date.now()}-${idx}`,
            name: it.name,
            url: it.url,
            vendor: it.vendor,
            price: it.price || 0,
            listThumbnail: it.listThumbnail,
          }))

          set(sourcingItemsState, prev => {
            const existingUrls = new Set(prev.map(item => item.url))
            const newItems = mapped.filter(item => !existingUrls.has(item.url))

            if (newItems.length === 0) {
              message.info('조건에 맞는 새로운 제품이 없습니다.')
              return prev
            }

            // 필터검색은 새로 뽑은 결과를 위에 쌓는 쪽이 UX가 좋음
            message.success(`학교장터 필터검색: ${newItems.length}개 제품을 가져왔습니다.`)
            return [...newItems, ...prev]
          })
        } catch (e: any) {
          message.error(e?.message || '학교장터 필터검색 중 오류가 발생했습니다.')
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

          const res = await ipcRenderer.invoke('sourcing-collect-details', { url: urlInput })
          if (!res?.success) throw new Error(res?.error || '상세 수집 실패')

          const found = (res.items || []).find((d: any) => d.url === urlInput)
          if (found) {
            const item: SourcingItem = {
              ...found,
              key: `${Date.now()}`,
              vendor: found.vendor,
              listThumbnail: found.listThumbnail,
              downloadDir: found.downloadDir,
              isCollected: true, // URL로 직접 가져온 것은 수집완료 상태로 설정
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
      async (
        keys?: React.Key[],
        optionHandling?: 'split' | 'single',
        delayMinSec?: number,
        delayMaxSec?: number,
        useAI?: boolean,
      ) => {
        const currentSelectedKeys = await snapshot.getPromise(selectedSourcingKeysState)
        const currentItems = await snapshot.getPromise(sourcingItemsState)

        const targetKeys = keys ?? currentSelectedKeys
        if (targetKeys.length === 0) {
          message.warning('등록 요청할 품목을 선택하세요.')
          return
        }

        try {
          // 선택된 상품들만 필터링
          const selectedItems = currentItems.filter(item => targetKeys.includes(item.key))

          // 딜레이 설정 (학교장터 상품이 있고 2개 이상일 때만)
          const hasSchoolS2B = selectedItems.some(item => item.vendor === '학교장터')
          const minDelaySec = delayMinSec ?? 5
          const maxDelaySec = delayMaxSec ?? 30

          // 각 상품을 순차적으로 처리
          for (let i = 0; i < selectedItems.length; i++) {
            const item = selectedItems[i]

            // 현재 상품 로딩 상태 시작
            set(sourcingItemsState, prev =>
              prev.map(p => (p.key === item.key ? { ...p, loading: true, result: undefined } : p)),
            )

            try {
              // 단일 상품 수집
              const result = await ipcRenderer.invoke('sourcing-collect-single-detail', {
                url: item.url,
                product: {
                  url: item.url,
                  name: item.name,
                  price: item.price,
                  listThumbnail: item.listThumbnail,
                  vendor: item.vendor,
                },
                optionHandling,
                useAI,
              })

              if (result?.success) {
                // 성공 시 결과 업데이트
                set(sourcingItemsState, prev =>
                  prev.map(p =>
                    p.key === item.key
                      ? {
                          ...p,
                          ...result.item,
                          downloadDir: result.item.downloadDir ?? p.downloadDir,
                          isCollected: true,
                          loading: false,
                          result: '성공',
                        }
                      : p,
                  ),
                )

                message.success(`${item.name} 수집 완료`)
              } else {
                throw new Error(result?.error || '수집 실패')
              }
            } catch (error: any) {
              // 실패 시 결과 업데이트
              set(sourcingItemsState, prev =>
                prev.map(p =>
                  p.key === item.key ? { ...p, loading: false, result: error.message || '수집 실패' } : p,
                ),
              )

              message.error(`${item.name} 수집 실패: ${error.message}`)
            }

            // 마지막 상품이 아니고 학교장터인 경우 딜레이 처리 (프론트엔드에서)
            if (i < selectedItems.length - 1 && item.vendor === '학교장터' && hasSchoolS2B) {
              const minDelayMs = Math.max(0, minDelaySec) * 1000
              const maxDelayMs = Math.max(minDelayMs, maxDelaySec * 1000)
              const randomDelayMs = random(minDelayMs, maxDelayMs)
              const delaySeconds = (randomDelayMs / 1000).toFixed(1)
              message.info(`다음 상품 소싱까지 ${delaySeconds}초 대기 중...`)
              await new Promise(resolve => setTimeout(resolve, randomDelayMs))
            }
          }
        } catch (e) {
          message.error('상세 수집 중 오류가 발생했습니다.')

          // 전체 프로세스 실패 시 로딩 중인 모든 상품을 실패 상태로 처리
          set(sourcingItemsState, prev =>
            prev.map(p => (p.loading ? { ...p, loading: false, result: '프로세스 실패' } : p)),
          )
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
          const configSets = await snapshot.getPromise(sourcingConfigSetsState)
          const activeConfigSetId = await snapshot.getPromise(activeConfigSetIdState)

          if (currentSelectedKeys.length === 0) {
            message.warning('다운로드할 소싱 데이터를 선택해주세요.')
            return
          }

          // 선택된 항목만 필터링
          const selectedItems = currentItems.filter(item => currentSelectedKeys.includes(item.key))

          // 현재 활성화된 설정값 세트 찾기
          const activeConfigSet = configSets.find(cs => cs.id === activeConfigSetId)

          const result = await ipcRenderer.invoke('download-sourcing-excel', {
            sourcingItems: selectedItems,
            configSet: activeConfigSet,
          })

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

  // 수집 중단
  const cancelSourcing = useRecoilCallback(
    ({ set }) =>
      async () => {
        try {
          // 로딩 중인 모든 상품을 실패 상태로 처리
          set(sourcingItemsState, prev =>
            prev.map(p => (p.loading ? { ...p, loading: false, result: '사용자 중단' } : p)),
          )

          message.warning('상품 수집이 중단되었습니다.')
        } catch (error) {
          console.error('Cancel sourcing failed:', error)
          message.error('수집 중단 중 오류가 발생했습니다.')
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
    fetchS2BFilteredSearch,
    fetchOneByUrl,
    deleteItem,
    requestRegister,
    downloadExcel,
    openVendorSite,
    cancelSourcing,
  }
}
