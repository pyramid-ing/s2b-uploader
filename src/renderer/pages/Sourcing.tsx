import React, { useMemo, useState, useEffect, useRef } from 'react'
import { Alert, Button, Card, Divider, Form, Input, message, Select, Space, Table, Typography, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DeleteOutlined, PlusOutlined, SendOutlined, DownloadOutlined } from '@ant-design/icons'
import { useLog } from '../hooks/useLog'
import { useSourcing } from '../hooks/useSourcing'
import { usePermission } from '../hooks/usePermission'
import { SourcingItem } from '../stores/sourcingStore'

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

  const columns: ColumnsType<SourcingItem> = useMemo(
    () => [
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
        ),
      },
      {
        title: '품목코드',
        dataIndex: 'productCode',
        key: 'productCode',
        render: (text: string, record: SourcingItem) => {
          const displayText = text || '-'
          return (
            <Tooltip
              title={
                <pre
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    maxWidth: '400px',
                    maxHeight: '300px',
                    overflow: 'auto',
                  }}
                >
                  {JSON.stringify(record, null, 2)}
                </pre>
              }
              placement="topLeft"
              overlayStyle={{ maxWidth: '500px' }}
            >
              <Typography.Text style={{ cursor: 'help' }}>{displayText}</Typography.Text>
            </Tooltip>
          )
        },
      },
      {
        title: '액션',
        key: 'action',
        render: (_, record) => (
          <Space>
            <Button type="link" icon={<SendOutlined />} onClick={() => handleRequestRegister([record.key])}>
              등록요청
            </Button>
            <Button
              type="link"
              icon={<DownloadOutlined />}
              onClick={() => {
                try {
                  if (!record.downloadDir) {
                    message.warning('저장 폴더 정보가 없습니다. 먼저 상세 수집을 실행하세요.')
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
    try {
      setLoading(true)
      await requestRegister(keys)
    } finally {
      setLoading(false)
    }
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

      <Card title="검색">
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

      <Card title="세팅">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Form layout="inline">
            <Form.Item label="마진율(%)">
              <Input
                type="number"
                style={{ width: 120 }}
                value={settings.marginRate}
                onChange={e => setSettings(prev => ({ ...prev, marginRate: Number(e.target.value) }))}
                min={0}
              />
            </Form.Item>
          </Form>
          <Form.Item label="상세설명 HTML">
            <Input.TextArea
              value={settings.detailHtmlTemplate}
              onChange={e => setSettings(prev => ({ ...prev, detailHtmlTemplate: e.target.value }))}
              placeholder="상세설명 HTML을 입력하세요..."
              rows={4}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Divider />

          <Form.Item>
            <Button type="primary" onClick={saveSettings}>
              설정 저장
            </Button>
          </Form.Item>
        </Space>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {hasSelection && (
            <Space>
              <Button type="primary" icon={<SendOutlined />} onClick={() => handleRequestRegister()}>
                등록요청({selectedRowKeys.length}개)
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
