import React, { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Space, Table, Select, Tag } from 'antd'
import {
  StopOutlined,
  UploadOutlined,
  EditOutlined,
  UserOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useLog } from '../hooks/useLog'
import { useRegister } from '../hooks/useRegister'
import { ProductData } from '../stores/registerStore'
import EditProductModal from '../components/EditProductModal'

const Register: React.FC = () => {
  const { logs, progress, clearLogs } = useLog()
  const {
    products,
    selectedKeys,
    settings,
    permission,
    setSelectedKeys,
    checkPermission,
    uploadExcelData,
    clearProducts,
    openResultFolder,
    registerProducts,
    cancelRegistration,
    updateSelectedAccountId,
    syncAccountPresets,
    updateProduct,
  } = useRegister()

  const { ipcRenderer } = (window as any).require('electron')
  const terminalRef = useRef<HTMLDivElement>(null)
  const [currentPublicIp, setCurrentPublicIp] = useState<string>('')

  // 수정 모달 상태
  const [isEditModalVisible, setIsEditModalVisible] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ProductData | null>(null)

  useEffect(() => {
    ;(async () => {
      const synced = await syncAccountPresets()
      const targetAccount = synced.accounts.find((account: any) => account.id === synced.selectedAccountId)
      await checkPermission(targetAccount?.loginId)
      const ipResult = await ipcRenderer.invoke('get-current-public-ip')
      setCurrentPublicIp(ipResult?.success ? ipResult.ip : '')
    })()
  }, [checkPermission, syncAccountPresets])

  // 로그 업데이트 시 스크롤을 맨 아래로 이동
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs])

  const columns: ColumnsType<ProductData> = [
    {
      title: '상품 정보',
      key: 'productInfo',
      render: (_, record) => {
        const d = record.originalData || {}
        const thumbnail = d.image1 || d.listThumbnail
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 48,
                height: 48,
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
                  }}
                >
                  No Img
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={record.goodsName}
              >
                {record.goodsName}
              </div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                {record.modelName || '모델명 없음'} | {record.spec || '규격 없음'}
              </div>
            </div>
          </div>
        )
      },
    },
    {
      title: '카테고리',
      key: 'category',
      width: 200,
      render: (_, record) => {
        const d = record.originalData || {}
        const cats = [d.category1, d.category2, d.category3].filter(Boolean)
        return (
          <div style={{ fontSize: 12, color: '#666' }}>
            {cats.length > 0 ? (
              cats.map((c, i) => (
                <span key={i}>
                  {c}
                  {i < cats.length - 1 && <span style={{ margin: '0 4px', color: '#ccc' }}>&gt;</span>}
                </span>
              ))
            ) : (
              <span style={{ color: '#ccc' }}>미설정</span>
            )}
          </div>
        )
      },
    },
    {
      title: '가격',
      key: 'price',
      width: 120,
      align: 'right',
      render: (_, record) => {
        const price = Number(record.originalData?.estimateAmt) || 0
        return <div style={{ fontWeight: 500, color: '#111' }}>{price.toLocaleString()}원</div>
      },
    },
    {
      title: '등록결과',
      dataIndex: 'result',
      key: 'result',
      width: 140,
      align: 'center',
      render: (value?: string) => {
        if (!value)
          return (
            <Tag icon={<SyncOutlined spin={false} />} style={{ borderRadius: 12, padding: '2px 10px' }}>
              대기
            </Tag>
          )
        if (value === '성공')
          return (
            <Tag
              color="success"
              icon={<CheckCircleOutlined />}
              style={{ borderRadius: 12, padding: '2px 10px', fontWeight: 500 }}
            >
              성공
            </Tag>
          )
        return (
          <Tag
            color="error"
            icon={<InfoCircleOutlined />}
            style={{ borderRadius: 12, padding: '2px 10px', fontWeight: 500 }}
            title={value}
          >
            실패
          </Tag>
        )
      },
    },
    {
      title: '관리',
      key: 'action',
      width: 80,
      align: 'center',
      render: (_, record) => (
        <Button
          type="text"
          shape="circle"
          icon={<EditOutlined />}
          onClick={() => {
            setEditingProduct(record)
            setIsEditModalVisible(true)
          }}
          title="수정"
        />
      ),
    },
  ]
  const selectedAccount = settings.accounts.find(account => account.id === settings.selectedAccountId)
  const selectedCount = selectedKeys.length
  const totalCount = products.length

  return (
    <>
      {permission.hasPermission === false && (
        <Alert
          message="계정 인증 실패"
          description={
            <>
              현재 계정으로는 상품 등록이 불가능합니다. 관리자에게 문의하세요.
              {permission.accountInfo?.periodEnd && (
                <div style={{ marginTop: '8px', fontSize: '14px' }}>
                  계정 만료일: {new Date(permission.accountInfo.periodEnd).toLocaleDateString('ko-KR')}
                </div>
              )}
            </>
          }
          type="error"
          showIcon
          style={{ marginBottom: '20px' }}
        />
      )}

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: '#111' }}>상품 등록 관리</h1>
          <Space size={16}>
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontSize: 13,
                  color: '#666',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 6,
                }}
              >
                <GlobalOutlined /> 현재 IP:{' '}
                <span style={{ color: '#111', fontWeight: 600 }}>{currentPublicIp || '-'}</span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: '#666',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 6,
                  marginTop: 4,
                }}
              >
                <UserOutlined /> 계정 마지막 등록 IP:{' '}
                <span style={{ color: '#111', fontWeight: 600 }}>{selectedAccount?.lastRegisteredIp || '-'}</span>
              </div>
            </div>
          </Space>
        </div>

        <Card
          bordered={false}
          style={{
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
            borderRadius: 16,
            marginBottom: 24,
            opacity: permission.hasPermission === false ? 0.6 : 1,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 24,
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <Space size={12} align="center">
              <div
                style={{
                  background: '#f5f5f5',
                  padding: '4px 12px',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  border: '1px solid #e8e8e8',
                }}
              >
                <UserOutlined style={{ color: '#888' }} />
                <Select
                  variant="borderless"
                  style={{ width: 220, fontWeight: 500 }}
                  placeholder="사업자(계정) 선택"
                  value={settings.selectedAccountId}
                  options={settings.accounts.map((account, index) => ({
                    label: account.name?.trim() || account.loginId || `계정 ${index + 1}`,
                    value: account.id,
                  }))}
                  onChange={updateSelectedAccountId}
                  disabled={settings.loading}
                />
              </div>
              <Tag
                color={selectedCount > 0 ? 'blue' : 'default'}
                style={{
                  borderRadius: 12,
                  padding: '4px 12px',
                  fontSize: 13,
                  fontWeight: 500,
                  margin: 0,
                  border: 'none',
                  backgroundColor: selectedCount > 0 ? '#e6f4ff' : '#f5f5f5',
                  color: selectedCount > 0 ? '#0958d9' : '#8c8c8c',
                }}
              >
                선택 {selectedCount.toLocaleString()} / 전체 {totalCount.toLocaleString()}
              </Tag>
            </Space>

            <Space size={12}>
              <Button
                size="large"
                icon={<UploadOutlined />}
                onClick={async () => {
                  const filePath = await ipcRenderer.invoke('select-excel')
                  if (filePath) {
                    await uploadExcelData(filePath)
                  }
                }}
                loading={settings.loading}
                disabled={permission.hasPermission === false}
                style={{ borderRadius: 10, fontWeight: 600 }}
              >
                상품 엑셀 업로드
              </Button>
              <Button
                size="large"
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={registerProducts}
                loading={settings.loading}
                disabled={
                  selectedKeys.length === 0 || permission.hasPermission === false || !settings.selectedAccountId
                }
                style={{ borderRadius: 10, fontWeight: 600, paddingLeft: 24, paddingRight: 24 }}
              >
                선택 상품 등록 시작
              </Button>
              <Button
                size="large"
                type="primary"
                danger
                icon={<StopOutlined />}
                onClick={cancelRegistration}
                disabled={!settings.loading}
                style={{ borderRadius: 10, fontWeight: 600 }}
              >
                중단
              </Button>
            </Space>
          </div>

          <Table
            columns={columns}
            dataSource={products}
            rowSelection={{
              type: 'checkbox',
              selectedRowKeys: selectedKeys,
              onChange: setSelectedKeys,
              getCheckboxProps: () => ({
                disabled: permission.hasPermission === false || settings.loading,
              }),
            }}
            loading={settings.loading}
            pagination={{
              defaultPageSize: 50,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100, 200, 500],
              position: ['bottomCenter'],
              style: { marginTop: 24 },
            }}
            style={{ marginTop: 8 }}
            className="premium-table"
          />
        </Card>
      </div>

      <EditProductModal
        visible={isEditModalVisible}
        product={editingProduct}
        onSave={updateProduct}
        onCancel={() => {
          setIsEditModalVisible(false)
          setEditingProduct(null)
        }}
      />

      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: settings.loading ? '#52c41a' : '#bfbfbf',
                animation: settings.loading ? 'pulse 2s infinite' : 'none',
              }}
            />
            <span>실시간 등록 진행 결과</span>
          </div>
        }
        bordered={false}
        extra={
          <Button onClick={clearLogs} size="small" type="link">
            로그 초기화
          </Button>
        }
        style={{
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          borderRadius: 16,
          marginTop: 24,
          maxWidth: 1200,
          margin: '24px auto 48px auto',
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
            <div style={{ color: '#666', fontStyle: 'italic' }}>등록을 시작하면 실시간 로그가 여기에 표시됩니다.</div>
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
                <span
                  style={{
                    color: log.level === 'error' ? '#f44747' : log.level === 'warning' ? '#dcdcaa' : '#b5cea8',
                    wordBreak: 'break-all',
                  }}
                >
                  {log.log}
                </span>
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
        .premium-table .ant-table {
          background: transparent;
        }
        .premium-table .ant-table-thead > tr > th {
          background: #f8f9fa;
          font-weight: 700;
          color: #444;
          border-bottom: 2px solid #eee;
        }
        .premium-table .ant-table-tbody > tr:hover > td {
          background: #f0f7ff !important;
        }
        .premium-table .ant-table-row-selected > td {
          background: #e6f4ff !important;
        }
      `}</style>
    </>
  )
}

export default Register
