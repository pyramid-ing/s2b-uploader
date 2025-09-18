import React, { useMemo, useState } from 'react'
import { Button, Card, Divider, Form, Input, message, Select, Space, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DeleteOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons'

const { shell } = window.require('electron')

interface SourcingItem {
  key: string
  name: string
  url: string
  price: number
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
  const [items, setItems] = useState<SourcingItem[]>([])
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [loading, setLoading] = useState(false)

  const hasSelection = selectedRowKeys.length > 0

  const columns: ColumnsType<SourcingItem> = useMemo(
    () => [
      { title: '상품명', dataIndex: 'name', key: 'name' },
      {
        title: 'URL',
        dataIndex: 'url',
        key: 'url',
        render: (text: string) => (
          <Typography.Link
            onClick={e => {
              e.preventDefault()
              if (!text) return
              try {
                shell.openExternal(text)
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
        title: '가격',
        dataIndex: 'price',
        key: 'price',
        render: (value: number) => `${currency(value)}원`,
        align: 'right',
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
      message.info('현재 페이지에서 제품 목록을 수집합니다 (서버 연동 준비중).')
      // 서버 연동 전 임시 더미 데이터
      const dummy: SourcingItem[] = [
        {
          key: `${Date.now()}-1`,
          name: vendor === 'domeggook' ? '도매꾹 샘플 상품' : '도매의신 샘플 상품',
          url: vendor === 'domeggook' ? 'https://www.domeggook.com/' : 'https://www.domeosin.com/',
          price: 12900,
        },
      ]
      setItems(prev => [...dummy, ...prev])
    } catch (e) {
      message.error('제품 수집 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleFetchOneByUrl = () => {
    if (!urlInput) {
      message.warning('URL을 입력하세요.')
      return
    }
    try {
      const url = new URL(urlInput)
      const host = url.hostname
      const item: SourcingItem = {
        key: `${Date.now()}`,
        name: `수동 1개 가져오기 (${host})`,
        url: urlInput,
        price: 0,
      }
      setItems(prev => [item, ...prev])
      message.success('URL 기준으로 1개 항목을 가져왔습니다. (서버 연동 예정)')
    } catch (e) {
      const item: SourcingItem = {
        key: `${Date.now()}`,
        name: '수동 1개 가져오기',
        url: urlInput,
        price: 0,
      }
      setItems(prev => [item, ...prev])
      message.info('유효하지 않은 URL 형식입니다. 그대로 추가했습니다.')
    } finally {
      setUrlInput('')
    }
  }

  const handleDelete = (key: React.Key) => {
    setItems(prev => prev.filter(i => i.key !== key))
    setSelectedRowKeys(prev => prev.filter(k => k !== key))
  }

  const handleRequestRegister = (keys?: React.Key[]) => {
    const targetKeys = keys ?? selectedRowKeys
    if (targetKeys.length === 0) {
      message.warning('등록 요청할 품목을 선택하세요.')
      return
    }
    const targetItems = items.filter(i => targetKeys.includes(i.key))
    message.success(`${targetItems.length}건 등록요청 (서버 연동 준비중)`) // backend 보류 상태
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
        <Space>
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
        </Space>
      </Card>

      {hasSelection && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Space>
            <Button type="primary" icon={<SendOutlined />} onClick={() => handleRequestRegister()}>
              등록요청({selectedRowKeys.length}개)
            </Button>
          </Space>
        </div>
      )}

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
