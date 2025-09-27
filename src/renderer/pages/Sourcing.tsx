import React, { useMemo, useState, useEffect, useRef } from 'react'
import {
  Alert,
  Button,
  Card,
  Divider,
  Form,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
  Typography,
  Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DeleteOutlined, PlusOutlined, SendOutlined, DownloadOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { useLog } from '../hooks/useLog'
import { useSourcing } from '../hooks/useSourcing'
import { usePermission } from '../hooks/usePermission'
import { SourcingItem } from '../stores/sourcingStore'
import { fetchCredits } from '../api/creditsApi'
import ConfigSetManager from '../components/ConfigSetManager'

const { shell } = window.require('electron')

const VENDORS = [
  { label: '도매꾹', value: 'domeggook' },
  { label: '도매의신', value: 'domeosin' },
]

const currency = (value: number) => value.toLocaleString('ko-KR')

const Sourcing: React.FC = () => {
  const [form] = Form.useForm()
  const [vendor, setVendor] = useState<string>(VENDORS[0].value)
  const [urlInput, setUrlInput] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [credits, setCredits] = useState<number | null>(null)
  const [creditsLoading, setCreditsLoading] = useState(false)

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
    fetchOneByUrl,
    deleteItem,
    requestRegister,
    downloadExcel,
    openVendorSite,
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
  }, [loadSettings, checkPermission])

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
            {record.isCollected && (
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '16px' }} />
            )}
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
          </Space>
        ),
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
      setLoading(true)
      await fetchCurrentPage()
    } finally {
      setLoading(false)
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

  const handleRequestRegister = async (keys?: React.Key[]) => {
    const count = keys && keys.length > 0 ? keys.length : selectedRowKeys.length
    if (count === 0) {
      message.warning('수집할 품목을 선택하세요.')
      return
    }

    // 상세설명 HTML 길이 검증
    if (settings.detailHtmlTemplate.length < 10) {
      message.error('상세설명 HTML은 10자 이상 입력해야 합니다.')
      return
    }

    try {
      setLoading(true)
      await requestRegister(keys)
    } finally {
      setLoading(false)
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
          description="현재 계정으로는 소싱 기능이 제한됩니다. 관리자에게 문의하세요."
          type="warning"
          showIcon
          style={{ marginBottom: '20px' }}
        />
      )}

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
              <Button onClick={handleFetchCurrentPage} loading={loading}>
                현재페이지 제품 가져오기 (자동)
              </Button>
            </Form.Item>
            <Divider />
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
          </Form>
        </Space>
      </Card>

      <ConfigSetManager />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {hasSelection && (
            <Space>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => handleRequestRegister()}
                disabled={settings.detailHtmlTemplate.length < 10}
              >
                수집하기({selectedRowKeys.length}개)
              </Button>
              <Button danger icon={<DeleteOutlined />} onClick={handleBulkDelete}>
                선택 삭제({selectedRowKeys.length}개)
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

      <Card>
        <Table<SourcingItem>
          rowKey="key"
          columns={columns}
          dataSource={items}
          rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
          pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100, 200, 500] }}
        />
      </Card>

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
