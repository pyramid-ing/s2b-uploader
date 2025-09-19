import React, { useMemo, useState, useEffect } from 'react'
import { Button, Card, Divider, Form, Input, message, Select, Space, Table, Typography, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DeleteOutlined, PlusOutlined, SendOutlined, DownloadOutlined } from '@ant-design/icons'

const { shell, ipcRenderer } = window.require('electron')

interface SourcingItem {
  key: string
  name: string
  url: string
  price: number
  productCode?: string
  additionalInfo?: any
}

const VENDORS = [
  { label: '도매꾹', value: 'domeggook' },
  { label: '도매의신', value: 'domeosin' },
]

const currency = (value: number) => value.toLocaleString('ko-KR')

const Sourcing: React.FC = () => {
  const [form] = Form.useForm()
  const [vendor, setVendor] = useState<string>(VENDORS[0].value)
  const [urlInput, setUrlInput] = useState<string>('')
  const [marginRate, setMarginRate] = useState<number>(20)
  const [detailHtmlTemplate, setDetailHtmlTemplate] = useState<string>('<p>상세설명을 입력하세요.</p>')
  const [items, setItems] = useState<SourcingItem[]>([])
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [loading, setLoading] = useState(false)

  const hasSelection = selectedRowKeys.length > 0

  // 설정 불러오기
  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const settings = await ipcRenderer.invoke('get-settings')
      if (settings) {
        setMarginRate(settings.marginRate || 20)
        setDetailHtmlTemplate(settings.detailHtmlTemplate || '<p>상세설명을 입력하세요.</p>')
      }
    } catch (error) {
      console.error('설정 불러오기 실패:', error)
    }
  }

  const saveSettings = async () => {
    try {
      const settings = await ipcRenderer.invoke('get-settings')
      const updatedSettings = {
        ...settings,
        marginRate,
        detailHtmlTemplate,
      }
      await ipcRenderer.invoke('save-settings', updatedSettings)
      message.success('설정이 저장되었습니다.')
    } catch (error) {
      console.error('설정 저장 실패:', error)
      message.error('설정 저장에 실패했습니다.')
    }
  }

  const columns: ColumnsType<SourcingItem> = useMemo(
    () => [
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
            <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.key)}>
              삭제
            </Button>
          </Space>
        ),
      },
    ],
    [marginRate, items],
  )

  const handleFetchCurrentPage = async () => {
    try {
      setLoading(true)
      const res = await ipcRenderer.invoke('sourcing-collect-list-current')
      if (!res?.success) throw new Error(res?.error || '수집 실패')
      const mapped: SourcingItem[] = (res.items || []).map((it: any, idx: number) => ({
        key: `${Date.now()}-${idx}`,
        name: it.name,
        url: it.url,
        price: it.price || 0,
      }))

      // URL 기준으로 중복 제거하여 추가
      setItems(prev => {
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
    } finally {
      setLoading(false)
    }
  }

  const handleOpenVendorSite = async () => {
    try {
      setLoading(true)
      const res = await ipcRenderer.invoke('sourcing-open-site', { vendor })
      if (!res?.success) throw new Error(res?.error || '사이트 열기 실패')
      message.success('사이트를 열었습니다.')
    } catch (e) {
      message.error('사이트 열기에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleFetchOneByUrl = async () => {
    if (!urlInput) {
      message.warning('URL을 입력하세요.')
      return
    }
    try {
      setLoading(true)

      // 중복 URL 체크
      const isDuplicate = items.some(item => item.url === urlInput)
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
        }
        setItems(prev => [item, ...prev])
        message.success('URL 기준으로 1개 항목을 가져왔습니다.')
      } else {
        message.error('해당 URL에서 제품 정보를 찾을 수 없습니다.')
      }
    } catch (e) {
      message.error('제품 수집 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
      setUrlInput('')
    }
  }

  const handleDelete = (key: React.Key) => {
    setItems(prev => prev.filter(i => i.key !== key))
    setSelectedRowKeys(prev => prev.filter(k => k !== key))
  }

  const handleRequestRegister = async (keys?: React.Key[]) => {
    const targetKeys = keys ?? selectedRowKeys
    if (targetKeys.length === 0) {
      message.warning('등록 요청할 품목을 선택하세요.')
      return
    }
    try {
      setLoading(true)
      const targetItems = items.filter(i => targetKeys.includes(i.key))
      const urls = targetItems.map(i => i.url)
      const res = await ipcRenderer.invoke('sourcing-collect-details', { urls })
      if (!res?.success) throw new Error(res?.error || '상세 수집 실패')
      // 상세 수집 결과를 테이블에 반영 (가격/이름/품목코드/추가정보 업데이트)
      const updated = items.map(it => {
        const found = (res.items || []).find((d: any) => d.url === it.url)
        if (!found) return it
        return {
          ...it,
          ...found,
        }
      })
      setItems(updated)
      message.success(`${urls.length}건 상세 수집 완료`)
    } catch (e) {
      message.error('상세 수집 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadExcel = async () => {
    try {
      if (selectedRowKeys.length === 0) {
        message.warning('다운로드할 소싱 데이터를 선택해주세요.')
        return
      }

      // 선택된 항목만 필터링
      const selectedItems = items.filter(item => selectedRowKeys.includes(item.key))

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
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
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
                value={marginRate}
                onChange={e => setMarginRate(Number(e.target.value))}
                min={0}
              />
            </Form.Item>
          </Form>
          <Form.Item label="상세설명 HTML">
            <Input.TextArea
              value={detailHtmlTemplate}
              onChange={e => setDetailHtmlTemplate(e.target.value)}
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
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </Space>
  )
}

export default Sourcing
