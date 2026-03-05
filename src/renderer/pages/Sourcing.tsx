import React, { useMemo, useState, useEffect, useRef } from 'react'
import { useRecoilState } from 'recoil'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Collapse,
  Divider,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Space,
  Table,
  Typography,
  Spin,
  Tag,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  DeleteOutlined,
  PlusOutlined,
  SendOutlined,
  CheckCircleOutlined,
  StopOutlined,
  GlobalOutlined,
  ShopOutlined,
  SearchOutlined,
  LoadingOutlined,
  FileSearchOutlined,
  SyncOutlined,
  InfoCircleOutlined,
  ArrowRightOutlined,
  PlusCircleOutlined,
} from '@ant-design/icons'
import { useLog } from '../hooks/useLog'
import { useSourcing } from '../hooks/useSourcing'
import { usePermission } from '../hooks/usePermission'
import { useRegister } from '../hooks/useRegister'
import { Product } from '../stores/registerStore'
import { useNavigate } from 'react-router-dom'
import {
  SourcingItem,
  videoCollapsedState,
  sourcingConfigSetsState,
  activeConfigSetIdState,
  SourcingConfigSet,
} from '../stores/sourcingStore'
import { fetchCredits } from '../api/creditsApi'
import ConfigSetManager from '../components/ConfigSetManager'

const { shell, ipcRenderer } = window.require('electron')

const VENDORS = [
  { label: '도매꾹', value: 'domeggook' },
  { label: '도매의신', value: 'domeosin' },
  { label: '쿠팡', value: 'coupang' },
  { label: '학교장터', value: 's2b' },
]

const currency = (value: number) => value.toLocaleString('ko-KR')
const S2B_DEFAULT_MAX_PRICE = 999_999_999
const S2B_DEFAULT_PAGE_DELAY_SEC = 1

const Sourcing: React.FC = () => {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const { addProducts } = useRegister()
  const [vendor, setVendor] = useState<string>(VENDORS[0].value)
  const [urlInput, setUrlInput] = useState<string>('')
  const [s2bKeyword, setS2bKeyword] = useState<string>('')
  const [s2bKeywordInvalid, setS2bKeywordInvalid] = useState<boolean>(false)
  const [s2bMinPrice, setS2bMinPrice] = useState<number | null>(null)
  const [s2bMaxPrice, setS2bMaxPrice] = useState<number | null>(S2B_DEFAULT_MAX_PRICE)
  const [s2bMaxCount, setS2bMaxCount] = useState<number>(50)
  const [s2bSortCode, setS2bSortCode] = useState<'PCAC' | 'RANK' | 'CERT' | 'TRUST' | 'DATE' | 'PCDC' | 'REVIEW_COUNT'>(
    'RANK',
  )
  const [s2bPageDelaySec, setS2bPageDelaySec] = useState<number>(S2B_DEFAULT_PAGE_DELAY_SEC)
  const [loading, setLoading] = useState(false)
  const [listLoading, setListLoading] = useState(false)
  const [credits, setCredits] = useState<number | null>(null)
  const [creditsLoading, setCreditsLoading] = useState(false)
  const [videoCollapsed, setVideoCollapsed] = useRecoilState(videoCollapsedState)
  const [optionHandling, setOptionHandling] = useState<'split' | 'single'>('split')
  const [configSets] = useRecoilState(sourcingConfigSetsState)
  const [activeConfigSetId] = useRecoilState(activeConfigSetIdState)
  const [lastUseAI, setLastUseAI] = useState<boolean | null>(null)

  // Recoil 기반 상태 관리
  const { logs, progress, clearLogs } = useLog()
  const { permission, checkPermission } = usePermission()
  const {
    items,
    selectedRowKeys,
    settings,
    setSelectedRowKeys,
    setSettings,
    loadSettings,
    saveSettings,
    fetchCurrentPage,
    fetchS2BFilteredSearch,
    fetchOneByUrl,
    deleteItem,
    requestRegister,
    openVendorSite,
    cancelSourcing,
  } = useSourcing()

  const terminalRef = useRef<HTMLDivElement>(null)

  const hasSelection = selectedRowKeys.length > 0

  // 로그 업데이트 시 스크롤을 맨 아래로 이동
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs])

  const getLogColor = (level: string) => {
    switch (level) {
      case 'info':
        return '#00FF00' // 초록
      case 'warning':
        return '#FFA500' // 주황
      case 'error':
        return '#FF0000' // 빨강
      default:
        return '#FFFFFF' // 기본 흰색
    }
  }

  // 설정 불러오기 및 권한 체크
  useEffect(() => {
    loadSettings()
    checkPermission()
    // 마지막 AI 사용 설정 불러오기
    const { ipcRenderer } = window.require('electron')
    ipcRenderer
      .invoke('get-settings')
      .then((settingsData: any) => {
        if (settingsData?.useAIForSourcing !== undefined) {
          setLastUseAI(settingsData.useAIForSourcing)
        }
      })
      .catch(console.error)
  }, [loadSettings, checkPermission])

  // 활성화된 설정값 세트 기준으로 기본 옵션 처리 방법 설정
  useEffect(() => {
    const activeConfigSet: SourcingConfigSet | undefined =
      configSets.find(cs => cs.id === activeConfigSetId) || configSets.find(cs => cs.isActive)
    if (activeConfigSet?.config?.optionHandling) {
      setOptionHandling(activeConfigSet.config.optionHandling)
    }
  }, [configSets, activeConfigSetId])

  const handleFetchCredits = async () => {
    try {
      setCreditsLoading(true)
      const settingsData = await (window as any).require('electron').ipcRenderer.invoke('get-settings')
      const s2bId = settingsData?.loginId
      const credits = await fetchCredits(s2bId)
      setCredits(credits)
    } catch (e) {
      setCredits(null)
    } finally {
      setCreditsLoading(false)
    }
  }

  useEffect(() => {
    handleFetchCredits()
  }, [])

  const columns: ColumnsType<SourcingItem> = useMemo(
    () => [
      {
        title: '상품 정보',
        key: 'productInfo',
        render: (_, record) => {
          const info = record.additionalInfo || {}
          const excel = (record as any).excelMapped?.[0] || {}
          const thumbnail = excel['기본이미지1'] || info.images?.[0] || record.listThumbnail
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: '1px solid #f0f0f0',
                  backgroundColor: '#f9f9f9',
                  flexShrink: 0,
                }}
              >
                {thumbnail ? (
                  <img
                    src={thumbnail.startsWith('http') ? thumbnail : `local-resource://${thumbnail}`}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ccc',
                      fontSize: 10,
                    }}
                  >
                    No Img
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <Tag color="default" style={{ margin: 0, fontSize: 10, borderRadius: 4 }}>
                    {record.vendor || '알수없음'}
                  </Tag>
                  {record.isCollected && <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 14 }} />}
                </div>
                {record.vendor === '학교장터' ? (
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: '#444',
                    }}
                    title={record.name}
                  >
                    {record.name}
                  </div>
                ) : (
                  <Typography.Link
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    onClick={e => {
                      e.preventDefault()
                      if (!record.url) return
                      try {
                        shell.openExternal(record.url)
                      } catch (err) {
                        message.error('링크를 열 수 없습니다.')
                      }
                    }}
                    title={record.name}
                  >
                    {record.name}
                  </Typography.Link>
                )}
              </div>
            </div>
          )
        },
      },
      {
        title: '금액',
        dataIndex: 'price',
        key: 'price',
        width: 120,
        align: 'right',
        render: (value: number) => {
          const n = Number(value)
          if (!Number.isFinite(n) || n <= 0) return '-'
          return `${currency(n)}원`
        },
      },
      {
        title: '상태',
        key: 'status',
        width: 140,
        align: 'center',
        render: (_, record) => {
          if (record.loading) {
            return (
              <Tag
                icon={<LoadingOutlined />}
                color="processing"
                style={{ borderRadius: 12, padding: '2px 10px', border: 'none' }}
              >
                수집 중...
              </Tag>
            )
          }
          if (record.result) {
            const isSuccess = record.result === '성공'
            return (
              <Tag
                color={isSuccess ? 'success' : 'error'}
                icon={isSuccess ? <CheckCircleOutlined /> : <InfoCircleOutlined />}
                style={{ borderRadius: 12, padding: '2px 10px', border: 'none' }}
                title={record.result}
              >
                {record.result}
              </Tag>
            )
          }
          if (record.isCollected) {
            return (
              <Tag color="success" style={{ borderRadius: 12, padding: '2px 10px' }}>
                수집완료
              </Tag>
            )
          }
          return <Tag style={{ borderRadius: 12, padding: '2px 10px' }}>대기</Tag>
        },
      },
      {
        title: '관리',
        key: 'action',
        width: 120,
        align: 'center',
        render: (_, record) => (
          <Space size={0}>
            <Button
              type="text"
              shape="circle"
              icon={<SyncOutlined />}
              onClick={() => handleRequestRegister([record.key])}
              title="다시 수집"
            />
            <Button
              type="text"
              shape="circle"
              icon={record.isCollected ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <SearchOutlined />}
              disabled={!record.isCollected}
              onClick={() => {
                try {
                  if (!record.downloadDir) {
                    message.warning('저장 폴더 정보가 없습니다.')
                    return
                  }
                  shell.openPath(record.downloadDir)
                } catch (e) {
                  message.error('폴더를 열 수 없습니다.')
                }
              }}
              title="데이터 확인"
            />
            <Button
              type="text"
              shape="circle"
              icon={<PlusCircleOutlined style={{ color: record.isCollected ? '#52c41a' : '#bfbfbf' }} />}
              disabled={!record.isCollected}
              onClick={() => handleMoveToRegister([record.key])}
              title="등록 페이지로 추가"
            />
            <Button
              type="text"
              shape="circle"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record.key)}
              title="삭제"
            />
          </Space>
        ),
      },
    ],
    [settings.marginRate, items],
  )

  const handleFetchCurrentPage = async () => {
    try {
      setListLoading(true)
      await fetchCurrentPage()
    } finally {
      setListLoading(false)
    }
  }

  const handleS2BFilterSearch = async () => {
    const keyword = (s2bKeyword || '').trim()
    if (!keyword) {
      setS2bKeywordInvalid(true)
      message.warning('학교장터 검색어는 필수입니다.')
      return
    }
    setS2bKeywordInvalid(false)
    try {
      setListLoading(true)
      await fetchS2BFilteredSearch({
        keyword,
        minPrice: typeof s2bMinPrice === 'number' ? s2bMinPrice : undefined,
        maxPrice: typeof s2bMaxPrice === 'number' ? s2bMaxPrice : undefined,
        maxCount: s2bMaxCount,
        sortCode: s2bSortCode,
        viewCount: 50,
        pageDelayMs: Math.max(0, Math.round((Number(s2bPageDelaySec) || 0) * 1000)),
      })
    } finally {
      setListLoading(false)
    }
  }

  const handleOpenVendorSite = async () => {
    try {
      setLoading(true)
      await openVendorSite(vendor)
    } finally {
      setLoading(false)
    }
  }

  const handleFetchOneByUrl = async () => {
    const useAIRef = { value: lastUseAI ?? false }

    Modal.confirm({
      title: '1개 가져오기',
      width: 500,
      content: (
        <div style={{ padding: '16px 0' }}>
          <Typography.Text>입력한 URL 기준으로 1개 항목을 가져오시겠습니까?</Typography.Text>
          <Divider style={{ margin: '16px 0' }} />
          <Form.Item style={{ marginBottom: 0 }}>
            <Checkbox
              defaultChecked={lastUseAI ?? false}
              onChange={e => {
                useAIRef.value = e.target.checked
              }}
            >
              수집시 AI로 정보 가져오기
            </Checkbox>
          </Form.Item>
        </div>
      ),
      okText: '가져오기',
      cancelText: '취소',
      onOk: async () => {
        const useAI = useAIRef.value
        setLastUseAI(useAI)
        const { ipcRenderer } = window.require('electron')
        ipcRenderer.invoke('save-settings', { useAIForSourcing: useAI }).catch(console.error)

        try {
          setLoading(true)
          await fetchOneByUrl(urlInput, useAI)
          setUrlInput('')
        } finally {
          setLoading(false)
        }
      },
    })
  }

  const handleDelete = (key: React.Key) => {
    deleteItem(key)
  }

  const handleRequestRegister = (keys?: React.Key[]) => {
    const targetKeys = keys && keys.length > 0 ? keys : selectedRowKeys
    const count = targetKeys.length
    if (count === 0) {
      message.warning('수집할 품목을 선택하세요.')
      return
    }

    // 상세설명 HTML 길이 검증
    if (settings.detailHtmlTemplate.length < 10) {
      message.error('상세설명 HTML은 10자 이상 입력해야 합니다.')
      return
    }

    const targetItems = items.filter(item => targetKeys.includes(item.key))
    const firstItemName = targetItems[0]?.name || ''
    const hasSchoolS2B = targetItems.some(item => item.vendor === '학교장터')

    // AI 사용 여부 체크박스 상태 관리
    const useAIRef = { value: lastUseAI ?? false }

    // 2개 이상이고 학교장터 상품이 있으면 딜레이 설정 팝업 표시
    if (count >= 2 && hasSchoolS2B) {
      const delayRef = { min: 5, max: 30 }

      Modal.confirm({
        title: '소싱 딜레이 설정',
        width: 500,
        content: (
          <div style={{ padding: '16px 0' }}>
            <Typography.Text>{count}개의 상품을 수집하겠습니까?</Typography.Text>
            <Divider style={{ margin: '16px 0' }} />
            <Form.Item label="소싱 딜레이(최소초)" style={{ marginBottom: 16 }}>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                max={300}
                step={1}
                precision={0}
                defaultValue={5}
                onChange={v => {
                  delayRef.min = typeof v === 'number' ? v : 5
                }}
              />
            </Form.Item>
            <Form.Item label="소싱 딜레이(최대초)" style={{ marginBottom: 16 }}>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                max={300}
                step={1}
                precision={0}
                defaultValue={30}
                onChange={v => {
                  delayRef.max = typeof v === 'number' ? v : 30
                }}
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Checkbox
                defaultChecked={lastUseAI ?? false}
                onChange={e => {
                  useAIRef.value = e.target.checked
                }}
              >
                수집시 AI로 정보 가져오기
              </Checkbox>
            </Form.Item>
          </div>
        ),
        okText: '수집하기',
        cancelText: '취소',
        onOk: () => {
          // 최소값이 최대값보다 크면 최대값으로 조정
          const finalMin = Math.min(delayRef.min, delayRef.max)
          const finalMax = Math.max(delayRef.min, delayRef.max)
          const useAI = useAIRef.value
          // 마지막 설정값 저장
          setLastUseAI(useAI)
          const { ipcRenderer } = window.require('electron')
          ipcRenderer.invoke('save-settings', { useAIForSourcing: useAI }).catch(console.error)
          requestRegister(targetKeys, optionHandling, finalMin, finalMax, useAI)
        },
      })
    } else {
      // 1개이거나 학교장터가 아니면 기존 방식
      const content = count === 1 ? `${firstItemName}을 수집하겠습니까?` : `${count}개의 상품을 수집하겠습니까?`

      Modal.confirm({
        title: '수집 시 정말로 수집하겠습니까?',
        width: 500,
        content: (
          <div style={{ padding: '16px 0' }}>
            <Typography.Text>{content}</Typography.Text>
            <Divider style={{ margin: '16px 0' }} />
            <Form.Item style={{ marginBottom: 0 }}>
              <Checkbox
                defaultChecked={lastUseAI ?? false}
                onChange={e => {
                  useAIRef.value = e.target.checked
                }}
              >
                수집시 AI로 정보 가져오기
              </Checkbox>
            </Form.Item>
          </div>
        ),
        okText: '예',
        cancelText: '아니오',
        onOk: () => {
          const useAI = useAIRef.value
          // 마지막 설정값 저장
          setLastUseAI(useAI)
          const { ipcRenderer } = window.require('electron')
          ipcRenderer.invoke('save-settings', { useAIForSourcing: useAI }).catch(console.error)
          requestRegister(targetKeys, optionHandling, undefined, undefined, useAI)
        },
      })
    }
  }

  const handleBulkDelete = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('삭제할 품목을 선택하세요.')
      return
    }

    Modal.confirm({
      title: '확인',
      content: `${selectedRowKeys.length}개 항목을 삭제하시겠습니까?`,
      okText: '예',
      cancelText: '아니오',
      onOk: () => {
        selectedRowKeys.forEach(key => deleteItem(key))
        setSelectedRowKeys([])
      },
    })
  }

  const handleMoveToRegister = async (keys: React.Key[]) => {
    const collectedItems = items.filter(item => keys.includes(item.key) && item.isCollected)
    if (collectedItems.length === 0) {
      if (keys.length === 1) {
        message.warning('수집 완료된 상품만 등록 페이지로 보낼 수 있습니다.')
      } else {
        message.warning('수집 완료된 상품이 없습니다.')
      }
      return
    }

    try {
      // 서버에서 sourcing → product 변환
      const products: Product[] = await ipcRenderer.invoke('convert-sourcing-to-products', {
        items: collectedItems.map(item => ({
          key: item.key,
          name: item.name,
          url: item.url,
          vendor: item.vendor,
          price: item.price,
          productCode: item.productCode,
          g2bItemNo: item.g2bItemNo,
          listThumbnail: item.listThumbnail,
          downloadDir: item.downloadDir,
          additionalInfo: item.additionalInfo,
          isCollected: item.isCollected,
          origin: item.origin,
          excelMapped: item.excelMapped,
        })),
      })

      await addProducts(products)
      navigate('/register')
    } catch (error) {
      console.error('Failed to convert sourcing to products:', error)
      message.error('상품 변환 중 오류가 발생했습니다.')
    }
  }

  return (
    <Space
      direction="vertical"
      size="large"
      style={{ width: '100%', maxWidth: 1200, margin: '0 auto', padding: '24px 0' }}
    >
      {permission.hasPermission === false && (
        <Alert
          message="계정 인증 실패"
          description={
            <>
              현재 계정으로는 소싱 기능이 제한됩니다. 관리자에게 문의하세요.
              {permission.accountInfo?.periodEnd && (
                <div style={{ marginTop: '8px', fontSize: '14px' }}>
                  계정 만료일: {new Date(permission.accountInfo.periodEnd).toLocaleDateString('ko-KR')}
                </div>
              )}
            </>
          }
          type="warning"
          showIcon
          style={{ borderRadius: 12 }}
        />
      )}

      <Collapse
        activeKey={videoCollapsed ? [] : ['video']}
        ghost
        onChange={keys => setVideoCollapsed(!keys.includes('video'))}
        items={[
          {
            key: 'video',
            label: (
              <Space>
                <InfoCircleOutlined style={{ color: '#1890ff' }} />
                <span style={{ fontWeight: 600 }}>초보자 가이드: 소싱 방법 알아보기</span>
              </Space>
            ),
            children: (
              <div
                style={{
                  position: 'relative',
                  paddingBottom: '56.25%',
                  height: 0,
                  overflow: 'hidden',
                  maxWidth: 900,
                  margin: '0 auto',
                  borderRadius: '12px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                }}
              >
                <iframe
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                  src="https://www.youtube.com/embed/vJAv-a1xxEs?si=N3ctiCzTS57Qaluy"
                  title="소싱 페이지 사용 방법"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            ),
          },
        ]}
      />

      <Card
        bordered={false}
        style={{ borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
        title={
          <Space>
            <SearchOutlined style={{ color: '#1890ff' }} />
            <span style={{ fontSize: 18, fontWeight: 700 }}>상품 소싱 검색</span>
          </Space>
        }
        extra={
          <div
            style={{
              background: '#f5f5f5',
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: 13,
              color: '#666',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <GlobalOutlined /> 사용권:{' '}
            <span style={{ color: '#111', fontWeight: 700 }}>
              {creditsLoading ? <LoadingOutlined /> : credits === null ? '알 수 없음' : `${credits.toLocaleString()}회`}
            </span>
            <Button
              type="text"
              size="small"
              shape="circle"
              icon={<SyncOutlined spin={creditsLoading} />}
              onClick={handleFetchCredits}
              style={{ fontSize: 12 }}
            />
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: '#fafafa',
                padding: '4px 12px',
                borderRadius: 10,
                border: '1px solid #eee',
              }}
            >
              <ShopOutlined style={{ color: '#888' }} />
              <Select
                variant="borderless"
                style={{ width: 140, fontWeight: 600 }}
                options={VENDORS}
                value={vendor}
                onChange={setVendor}
              />
            </div>
            <Button
              size="large"
              type="primary"
              icon={<GlobalOutlined />}
              onClick={handleOpenVendorSite}
              loading={loading}
              style={{ borderRadius: 10, fontWeight: 600, background: '#1890ff' }}
            >
              해당 사이트 열기
            </Button>
            <Button
              size="large"
              icon={<SyncOutlined />}
              onClick={handleFetchCurrentPage}
              loading={listLoading}
              style={{ borderRadius: 10, fontWeight: 600 }}
            >
              현재 페이지 자동 수집
            </Button>
          </div>

          {vendor === 's2b' ? (
            <div
              style={{
                padding: '24px',
                background: '#f9fcff',
                borderRadius: 14,
                border: '1px solid #e6f7ff',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <FileSearchOutlined style={{ color: '#1890ff', fontSize: 18 }} />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#003a8c' }}>학교장터 정밀 필터 검색</h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ fontSize: 13, color: '#666', marginBottom: 6, fontWeight: 500 }}>검색 키워드</div>
                  <Input
                    size="large"
                    placeholder="검색할 상품명을 입력하세요 (예: 노트북, 사무용 의자)"
                    value={s2bKeyword}
                    onChange={e => {
                      const v = e.target.value
                      setS2bKeyword(v)
                      if (s2bKeywordInvalid && v.trim().length > 0) setS2bKeywordInvalid(false)
                    }}
                    onPressEnter={handleS2BFilterSearch}
                    prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                    status={s2bKeywordInvalid && (s2bKeyword || '').trim().length === 0 ? 'error' : undefined}
                    style={{ borderRadius: 10 }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 13, color: '#666', marginBottom: 6, fontWeight: 500 }}>금액 범위 (원)</div>
                  <Space.Compact style={{ width: '100%' }}>
                    <InputNumber
                      size="large"
                      style={{ width: '50%', borderRadius: '10px 0 0 10px' }}
                      min={0}
                      max={S2B_DEFAULT_MAX_PRICE}
                      value={s2bMinPrice}
                      onChange={v => setS2bMinPrice(typeof v === 'number' ? v : null)}
                      placeholder="최소"
                      formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    />
                    <InputNumber
                      size="large"
                      style={{ width: '50%', borderRadius: '0 10px 10px 0' }}
                      min={0}
                      max={S2B_DEFAULT_MAX_PRICE}
                      value={s2bMaxPrice}
                      onChange={v => setS2bMaxPrice(typeof v === 'number' ? v : S2B_DEFAULT_MAX_PRICE)}
                      placeholder="최대"
                      formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    />
                  </Space.Compact>
                </div>

                <div>
                  <div style={{ fontSize: 13, color: '#666', marginBottom: 6, fontWeight: 500 }}>정렬 기준</div>
                  <Select
                    size="large"
                    style={{ width: '100%', borderRadius: 10 }}
                    value={s2bSortCode}
                    onChange={v => setS2bSortCode(v)}
                    options={[
                      { label: '낮은 금액순', value: 'PCAC' },
                      { label: '정확도순', value: 'RANK' },
                      { label: '인증 많은순', value: 'CERT' },
                      { label: '계약이행신뢰도순', value: 'TRUST' },
                      { label: '등록순', value: 'DATE' },
                      { label: '높은 금액순', value: 'PCDC' },
                      { label: '후기 많은순', value: 'REVIEW_COUNT' },
                    ]}
                  />
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#666', marginBottom: 6, fontWeight: 500 }}>
                      페이지 지연 (초)
                    </div>
                    <InputNumber
                      size="large"
                      style={{ width: '100%', borderRadius: 10 }}
                      min={0}
                      max={60}
                      value={s2bPageDelaySec}
                      onChange={v => setS2bPageDelaySec(typeof v === 'number' ? v : S2B_DEFAULT_PAGE_DELAY_SEC)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#666', marginBottom: 6, fontWeight: 500 }}>수집 개수</div>
                    <InputNumber
                      size="large"
                      style={{ width: '100%', borderRadius: 10 }}
                      min={1}
                      max={5000}
                      value={s2bMaxCount}
                      onChange={v => setS2bMaxCount(typeof v === 'number' ? v : 50)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <Button
                    size="large"
                    type="primary"
                    onClick={handleS2BFilterSearch}
                    loading={listLoading}
                    disabled={(s2bKeyword || '').trim().length === 0}
                    style={{ width: '100%', borderRadius: 10, fontWeight: 700, height: 40 }}
                  >
                    필터 기반 수집 시작
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: '24px',
                background: '#f8f8f8',
                borderRadius: 14,
                border: '1px solid #eee',
              }}
            >
              <div style={{ fontSize: 13, color: '#666', marginBottom: 6, fontWeight: 500 }}>상세 페이지 URL</div>
              <div style={{ display: 'flex', gap: 12 }}>
                <Input
                  size="large"
                  placeholder="수집할 상품의 상세 URL을 입력하세요 (예: https://domeggook.com/...)"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  onPressEnter={handleFetchOneByUrl}
                  style={{ borderRadius: 10, flex: 1 }}
                />
                <Button
                  size="large"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleFetchOneByUrl}
                  style={{ borderRadius: 10, fontWeight: 600, paddingLeft: 24, paddingRight: 24 }}
                >
                  수동 추가
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <ConfigSetManager />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          border: '1px solid #f0f0f0',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <Space size={16}>
          <div
            style={{
              padding: '6px 14px',
              background: '#e6f4ff',
              borderRadius: 20,
              color: '#0958d9',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {selectedRowKeys.length}개 선택됨
          </div>
          {hasSelection && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: '#f5f5f5',
                padding: '4px 12px',
                borderRadius: 10,
              }}
            >
              <span style={{ fontSize: 13, color: '#666', fontWeight: 500 }}>옵션 처리:</span>
              <Select
                variant="borderless"
                style={{ width: 230, fontWeight: 600 }}
                value={optionHandling}
                onChange={value => setOptionHandling(value)}
              >
                <Select.Option value="split">옵션별 개별 품목 생성 (추천)</Select.Option>
                <Select.Option value="single">옵션 통합 1개 품목 생성</Select.Option>
              </Select>
            </div>
          )}
        </Space>

        <Space size={12}>
          {hasSelection && (
            <>
              <Button
                size="large"
                type="primary"
                icon={<SendOutlined />}
                onClick={() => handleRequestRegister()}
                disabled={settings.detailHtmlTemplate.length < 10}
                loading={loading}
                style={{ borderRadius: 10, fontWeight: 700, paddingLeft: 20, paddingRight: 20 }}
              >
                상세 정보 수집 시작
              </Button>
              <Button
                size="large"
                type="primary"
                icon={<ArrowRightOutlined />}
                onClick={() => handleMoveToRegister(selectedRowKeys)}
                style={{ background: '#52c41a', color: '#fff', borderRadius: 10, fontWeight: 700 }}
              >
                등록 페이지로 이동
              </Button>
              <Button
                size="large"
                danger
                icon={<DeleteOutlined />}
                onClick={handleBulkDelete}
                style={{ borderRadius: 10, fontWeight: 600 }}
              />
            </>
          )}

          <Button
            size="large"
            type="primary"
            danger
            icon={<StopOutlined />}
            onClick={cancelSourcing}
            disabled={!loading}
            style={{ borderRadius: 10, fontWeight: 600 }}
          >
            중단
          </Button>
        </Space>
      </div>

      <Spin
        spinning={listLoading}
        tip="목록을 수집 중입니다..."
        indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />}
      >
        <div
          style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
        >
          <Table<SourcingItem>
            rowKey="key"
            columns={columns}
            dataSource={items}
            rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
            pagination={{
              defaultPageSize: 50,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100, 200, 500],
              position: ['bottomCenter'],
              style: { padding: '16px 0' },
            }}
            className="premium-table"
          />
        </div>
      </Spin>

      <Card
        bordered={false}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: loading || listLoading ? '#52c41a' : '#bfbfbf',
                animation: loading || listLoading ? 'pulse 2s infinite' : 'none',
              }}
            />
            <span style={{ fontWeight: 600 }}>실시간 수집 로그</span>
          </div>
        }
        extra={
          <Button onClick={clearLogs} size="small" type="link">
            로그 초기화
          </Button>
        }
        style={{
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          borderRadius: 16,
          marginTop: 24,
          marginBottom: 48,
        }}
      >
        <div
          ref={terminalRef}
          style={{
            backgroundColor: '#1e1e1e',
            color: '#d4d4d4',
            height: '240px',
            overflowY: 'auto',
            padding: '16px',
            fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
            borderRadius: '12px',
            fontSize: 13,
            lineHeight: 1.6,
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: '#666', fontStyle: 'italic' }}>
              수집을 시작하면 실시간 작업 내역이 여기에 표시됩니다.
            </div>
          ) : (
            logs.map((log, index) => (
              <div
                key={index}
                style={{
                  padding: '2px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  display: 'flex',
                  gap: 8,
                }}
              >
                <span style={{ color: '#569cd6', flexShrink: 0 }}>[{new Date().toLocaleTimeString()}]</span>
                <span style={{ color: getLogColor(log.level), wordBreak: 'break-all' }}>{log.log}</span>
              </div>
            ))
          )}
        </div>
      </Card>

      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(82, 196, 26, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(82, 196, 26, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(82, 196, 26, 0); }
        }
        .premium-table .ant-table { background: transparent; }
        .premium-table .ant-table-thead > tr > th {
          background: #f8f9fa;
          font-weight: 700;
          color: #444;
          border-bottom: 2px solid #eee;
        }
        .premium-table .ant-table-tbody > tr:hover > td { background: #f0f7ff !important; }
        .premium-table .ant-table-row-selected > td { background: #e6f4ff !important; }
      `}</style>
    </Space>
  )
}

export default Sourcing
