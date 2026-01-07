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
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  DeleteOutlined,
  PlusOutlined,
  SendOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { useLog } from '../hooks/useLog'
import { useSourcing } from '../hooks/useSourcing'
import { usePermission } from '../hooks/usePermission'
import {
  SourcingItem,
  videoCollapsedState,
  sourcingConfigSetsState,
  activeConfigSetIdState,
  SourcingConfigSet,
} from '../stores/sourcingStore'
import { fetchCredits } from '../api/creditsApi'
import ConfigSetManager from '../components/ConfigSetManager'

const { shell } = window.require('electron')

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
    downloadExcel,
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
        title: '구매처',
        dataIndex: 'vendor',
        key: 'vendor',
        width: 100,
        render: (vendor: string) => vendor || '-',
      },
      {
        title: '썸네일',
        dataIndex: 'listThumbnail',
        key: 'listThumbnail',
        width: 80,
        render: (thumbnail: string) =>
          thumbnail ? (
            <img
              src={thumbnail}
              alt="상품 썸네일"
              style={{
                width: 60,
                height: 60,
                objectFit: 'cover',
                borderRadius: 4,
              }}
            />
          ) : (
            <div
              style={{
                width: 60,
                height: 60,
                backgroundColor: '#f5f5f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 4,
                fontSize: 12,
                color: '#999',
              }}
            >
              이미지 없음
            </div>
          ),
      },
      {
        title: '상품명',
        dataIndex: 'name',
        key: 'name',
        render: (text: string, record: SourcingItem) => (
          <Space>
            {record.isCollected && <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '16px' }} />}
            {record.vendor === '학교장터' ? (
              <Typography.Text type="secondary">{text}</Typography.Text>
            ) : (
              <Typography.Link
                onClick={e => {
                  e.preventDefault()
                  if (!record.url) return
                  try {
                    shell.openExternal(record.url)
                  } catch (err) {
                    message.error('링크를 열 수 없습니다.')
                  }
                }}
              >
                {text}
              </Typography.Link>
            )}
          </Space>
        ),
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
        width: 120,
        render: (_, record) => {
          if (record.loading) {
            return (
              <Space>
                <Spin size="small" />
                <span style={{ color: '#1890ff' }}>수집 중...</span>
              </Space>
            )
          }
          if (record.result) {
            return <span style={{ color: record.result === '성공' ? '#52c41a' : '#ff4d4f' }}>{record.result}</span>
          }
          if (record.isCollected) {
            return <span style={{ color: '#52c41a' }}>수집완료</span>
          }
          return <span style={{ color: '#8c8c8c' }}>대기</span>
        },
      },
      {
        title: '액션',
        key: 'action',
        render: (_, record) => (
          <Space>
            <Button type="link" icon={<SendOutlined />} onClick={() => handleRequestRegister([record.key])}>
              수집하기
            </Button>
            <Button
              type="link"
              icon={<DownloadOutlined />}
              disabled={!record.isCollected}
              onClick={() => {
                try {
                  if (!record.downloadDir) {
                    message.warning('저장 폴더 정보가 없습니다. 먼저 수집을 실행하세요.')
                    return
                  }
                  shell.openPath(record.downloadDir)
                } catch (e) {
                  message.error('폴더를 열 수 없습니다.')
                }
              }}
            >
              폴더 열기
            </Button>
            <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.key)}>
              삭제
            </Button>
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
    try {
      setLoading(true)
      await fetchOneByUrl(urlInput)
      setUrlInput('')
    } finally {
      setLoading(false)
    }
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

  const handleDownloadExcel = async () => {
    await downloadExcel()
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
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
          style={{ marginBottom: '20px' }}
        />
      )}

      <Collapse
        activeKey={videoCollapsed ? [] : ['video']}
        onChange={keys => setVideoCollapsed(!keys.includes('video'))}
        items={[
          {
            key: 'video',
            label: '사용 방법',
            children: (
              <div
                style={{
                  position: 'relative',
                  paddingBottom: '56.25%', // 16:9 비율
                  height: 0,
                  overflow: 'hidden',
                  maxWidth: '100%',
                  borderRadius: '8px',
                }}
              >
                <iframe
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    border: 0,
                  }}
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
        title="검색"
        extra={
          <Space>
            <Typography.Text>
              사용권:{' '}
              {creditsLoading ? '조회 중…' : credits === null ? '알 수 없음' : `${credits.toLocaleString('ko-KR')}회`}
            </Typography.Text>
            <Button size="small" onClick={handleFetchCredits} loading={creditsLoading}>
              새로고침
            </Button>
          </Space>
        }
      >
        <Space wrap>
          <Form form={form} layout="inline">
            <Form.Item label="업체">
              <Select style={{ width: 160 }} options={VENDORS} value={vendor} onChange={setVendor} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" onClick={handleOpenVendorSite} loading={loading}>
                사이트 열기
              </Button>
            </Form.Item>
            <Form.Item>
              <Button onClick={handleFetchCurrentPage} loading={listLoading}>
                현재페이지 제품 가져오기 (자동)
              </Button>
            </Form.Item>
            {vendor === 's2b' && (
              <>
                <Divider style={{ margin: '16px 0' }} />
                <div
                  style={{
                    width: '100%',
                    padding: '16px',
                    backgroundColor: '#fafafa',
                    borderRadius: '8px',
                    border: '1px solid #e8e8e8',
                  }}
                >
                  <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
                    학교장터 필터 검색
                  </Typography.Title>

                  {/* 그룹 1: 키워드 */}
                  <Form.Item label="키워드" style={{ marginBottom: 16 }}>
                    <Input
                      placeholder="예: 노트북"
                      value={s2bKeyword}
                      onChange={e => {
                        const v = e.target.value
                        setS2bKeyword(v)
                        if (s2bKeywordInvalid && v.trim().length > 0) setS2bKeywordInvalid(false)
                      }}
                      onPressEnter={handleS2BFilterSearch}
                      status={s2bKeywordInvalid && (s2bKeyword || '').trim().length === 0 ? 'error' : undefined}
                    />
                  </Form.Item>

                  {/* 그룹 2: 금액 최소/최대 */}
                  <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
                    <Form.Item label="금액(최소)" style={{ flex: 1, marginRight: 8, marginBottom: 0 }}>
                      <InputNumber
                        style={{ width: '100%' }}
                        min={0}
                        max={S2B_DEFAULT_MAX_PRICE}
                        value={s2bMinPrice}
                        onChange={v => setS2bMinPrice(typeof v === 'number' ? v : null)}
                        placeholder="0"
                      />
                    </Form.Item>
                    <Form.Item label="금액(최대)" style={{ flex: 1, marginBottom: 0 }}>
                      <InputNumber
                        style={{ width: '100%' }}
                        min={0}
                        max={S2B_DEFAULT_MAX_PRICE}
                        value={s2bMaxPrice}
                        onChange={v => setS2bMaxPrice(typeof v === 'number' ? v : S2B_DEFAULT_MAX_PRICE)}
                      />
                    </Form.Item>
                  </Space.Compact>

                  {/* 그룹 3: 페이지딜레이, 정렬, 최대갯수 */}
                  <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
                    <Form.Item label="페이지 딜레이(초)" style={{ flex: 1, marginRight: 8, marginBottom: 0 }}>
                      <InputNumber
                        style={{ width: '100%' }}
                        min={0}
                        max={60}
                        step={1}
                        precision={0}
                        value={s2bPageDelaySec}
                        onChange={v => setS2bPageDelaySec(typeof v === 'number' ? v : S2B_DEFAULT_PAGE_DELAY_SEC)}
                      />
                    </Form.Item>
                    <Form.Item label="정렬" style={{ flex: 1, marginRight: 8, marginBottom: 0 }}>
                      <Select
                        style={{ width: '100%' }}
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
                    </Form.Item>
                    <Form.Item label="최대갯수" style={{ flex: 1, marginBottom: 0 }}>
                      <InputNumber
                        style={{ width: '100%' }}
                        min={1}
                        max={5000}
                        value={s2bMaxCount}
                        onChange={v => setS2bMaxCount(typeof v === 'number' ? v : 50)}
                      />
                    </Form.Item>
                  </Space.Compact>

                  {/* 검색 버튼 */}
                  <Form.Item style={{ marginBottom: 0 }}>
                    <Button
                      type="primary"
                      onClick={handleS2BFilterSearch}
                      loading={listLoading}
                      disabled={(s2bKeyword || '').trim().length === 0}
                      block
                    >
                      필터 검색 (자동)
                    </Button>
                  </Form.Item>
                </div>
              </>
            )}
            {vendor !== 's2b' && (
              <>
                <Divider style={{ margin: '16px 0' }} />
                <Form.Item label="URL">
                  <Input
                    placeholder="https://"
                    style={{ width: 360 }}
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    onPressEnter={handleFetchOneByUrl}
                  />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleFetchOneByUrl}>
                    1개 가져오기 (수동)
                  </Button>
                </Form.Item>
              </>
            )}
          </Form>
        </Space>
      </Card>

      <ConfigSetManager />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {hasSelection && (
            <Space>
              <Select
                size="small"
                style={{ width: 260 }}
                value={optionHandling}
                onChange={value => setOptionHandling(value)}
              >
                <Select.Option value="split">옵션별로 풀어서 여러 개 상품 생성</Select.Option>
                <Select.Option value="single">옵션을 묶어서 1개 상품 생성</Select.Option>
              </Select>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => handleRequestRegister()}
                disabled={settings.detailHtmlTemplate.length < 10}
                loading={loading}
              >
                수집하기({selectedRowKeys.length}개)
              </Button>
              <Button danger icon={<DeleteOutlined />} onClick={handleBulkDelete}>
                선택 삭제({selectedRowKeys.length}개)
              </Button>
              <Button type="primary" danger icon={<StopOutlined />} onClick={cancelSourcing} disabled={!loading}>
                중단
              </Button>
            </Space>
          )}
        </div>
        <div>
          <Space>
            <Button
              type="default"
              icon={<DownloadOutlined />}
              onClick={handleDownloadExcel}
              disabled={selectedRowKeys.length === 0}
            >
              엑셀 다운로드 ({selectedRowKeys.length}개)
            </Button>
          </Space>
        </div>
      </div>

      <Spin spinning={listLoading} tip="목록을 수집 중입니다...">
        <Card>
          <Table<SourcingItem>
            rowKey="key"
            columns={columns}
            dataSource={items}
            rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
            pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100, 200, 500] }}
          />
        </Card>
      </Spin>

      <Card
        title="진행 정보"
        extra={
          <Button onClick={clearLogs} size="small">
            로그 초기화
          </Button>
        }
        style={{ marginTop: '20px' }}
      >
        <div
          ref={terminalRef}
          style={{
            backgroundColor: '#000',
            color: '#fff',
            height: '300px',
            overflowY: 'auto',
            padding: '10px',
            fontFamily: 'monospace',
            borderRadius: '5px',
          }}
        >
          {logs.map((log, index) => (
            <div key={index} style={{ color: getLogColor(log.level) }}>
              {log.log}
            </div>
          ))}
        </div>
      </Card>
    </Space>
  )
}

export default Sourcing
