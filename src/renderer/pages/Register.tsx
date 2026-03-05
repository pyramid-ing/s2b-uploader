import React, { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Space, Table, Select, Tag, Popconfirm } from 'antd'
import {
  StopOutlined,
  EditOutlined,
  DeleteOutlined,
  UserOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  DownloadOutlined,
  UploadOutlined,
  FileExcelOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useLog } from '../hooks/useLog'
import { useRegister } from '../hooks/useRegister'
import { Product } from '../stores/registerStore'
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
    loadProducts,
    registerProducts,
    cancelRegistration,
    updateSelectedAccountId,
    syncAccountPresets,
    removeProducts,
    updateProduct,
    downloadExcelData,
    uploadExcelModifyData,
    downloadSampleExcel,
  } = useRegister()

  const { ipcRenderer } = (window as any).require('electron')
  const terminalRef = useRef<HTMLDivElement>(null)
  const [currentPublicIp, setCurrentPublicIp] = useState<string>('')

  // 수정 모달 상태
  const [isEditModalVisible, setIsEditModalVisible] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  useEffect(() => {
    ;(async () => {
      await loadProducts()
      const synced = await syncAccountPresets()
      const targetAccount = synced.accounts.find((account: any) => account.id === synced.selectedAccountId)
      await checkPermission(targetAccount?.loginId)
      const ipResult = await ipcRenderer.invoke('get-current-public-ip')
      setCurrentPublicIp(ipResult?.success ? ipResult.ip : '')
    })()
  }, [checkPermission, syncAccountPresets, loadProducts])

  // 로그 업데이트 시 스크롤을 맨 아래로 이동
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs])

  const columns: ColumnsType<Product> = [
    {
      title: '상품 정보',
      key: 'productInfo',
      render: (_, record) => {
        const thumbnail = record.image1 || record.listThumbnail
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 8,
                overflow: 'hidden',
                border: '1px solid #e0e0e0',
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
                    color: '#999',
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  No Img
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 16,
                  color: '#111',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={record.name}
              >
                {record.name}
              </div>
              <div style={{ fontSize: 14, color: '#666', marginTop: 4 }}>
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
      width: 220,
      render: (_, record) => {
        const cats = [record.category1, record.category2, record.category3].filter(Boolean)
        return (
          <div style={{ fontSize: 14, color: '#555' }}>
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
      width: 140,
      align: 'right',
      render: (_, record) => {
        const price = record.price || 0
        return <div style={{ fontWeight: 700, color: '#111', fontSize: 16 }}>{price.toLocaleString()}원</div>
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
            <Tag icon={<SyncOutlined spin={false} />} style={{ borderRadius: 16, padding: '4px 12px', fontSize: 14 }}>
              대기
            </Tag>
          )
        if (value === '성공')
          return (
            <Tag
              color="success"
              icon={<CheckCircleOutlined />}
              style={{ borderRadius: 16, padding: '4px 12px', fontSize: 14, fontWeight: 600 }}
            >
              성공
            </Tag>
          )
        return (
          <Tag
            color="error"
            icon={<InfoCircleOutlined />}
            style={{ borderRadius: 16, padding: '4px 12px', fontSize: 14, fontWeight: 600 }}
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
      width: 160,
      align: 'center',
      render: (_, record) => (
        <Space size={8}>
          <Button
            size="middle"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingProduct(record)
              setIsEditModalVisible(true)
            }}
            style={{ fontSize: 14, fontWeight: 600 }}
          >
            수정
          </Button>
          <Popconfirm
            title="상품 삭제"
            description="이 상품을 목록에서 삭제하시겠습니까?"
            onConfirm={() => removeProducts([record.id])}
            okText="삭제"
            cancelText="취소"
            okButtonProps={{ danger: true, size: 'large' }}
            cancelButtonProps={{ size: 'large' }}
          >
            <Button size="middle" danger icon={<DeleteOutlined />} style={{ fontSize: 14, fontWeight: 600 }}>
              삭제
            </Button>
          </Popconfirm>
        </Space>
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

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0, color: '#111' }}>상품 등록 관리</h1>
          <Space size={16}>
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontSize: 15,
                  color: '#666',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 8,
                }}
              >
                <GlobalOutlined /> 현재 방화벽 우회 IP:{' '}
                <span style={{ color: '#111', fontWeight: 600 }}>{currentPublicIp || '-'}</span>
              </div>
              <div
                style={{
                  fontSize: 15,
                  color: '#666',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 8,
                  marginTop: 6,
                }}
              >
                <UserOutlined /> 최근 등록 IP:{' '}
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
            padding: '8px 16px',
          }}
        >
          {/* 상단 액션 행: 계정 선택 및 최종 등록 버튼 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 32,
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <Space size={12} align="center">
              <div
                style={{
                  background: '#f5f5f5',
                  padding: '8px 16px',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  border: '1px solid #e8e8e8',
                }}
              >
                <UserOutlined style={{ color: '#888', fontSize: 18 }} />
                <Select
                  variant="borderless"
                  style={{ width: 280, fontWeight: 600, fontSize: 16 }}
                  placeholder="작업할 사업자(계정)를 선택하세요"
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
                  borderRadius: 16,
                  padding: '8px 16px',
                  fontSize: 15,
                  fontWeight: 600,
                  margin: 0,
                  border: 'none',
                  backgroundColor: selectedCount > 0 ? '#e6f4ff' : '#f5f5f5',
                  color: selectedCount > 0 ? '#0958d9' : '#8c8c8c',
                }}
              >
                선택 {selectedCount.toLocaleString()}개 / 전체 {totalCount.toLocaleString()}개
              </Tag>
            </Space>

            <div style={{ display: 'flex', gap: 12 }}>
              <Button
                size="large"
                type="primary"
                icon={<CheckCircleOutlined style={{ fontSize: 24 }} />}
                onClick={registerProducts}
                loading={settings.loading}
                disabled={
                  selectedKeys.length === 0 || permission.hasPermission === false || !settings.selectedAccountId
                }
                style={{
                  borderRadius: 14,
                  fontWeight: 900,
                  padding: '0 48px',
                  height: 64,
                  fontSize: 22,
                  background: '#52c41a',
                  borderColor: '#52c41a',
                  boxShadow: '0 6px 16px rgba(82, 196, 26, 0.35)',
                }}
              >
                학교장터에 등록 시작
              </Button>
              <Button
                size="large"
                type="primary"
                danger
                icon={<StopOutlined />}
                onClick={cancelRegistration}
                disabled={!settings.loading}
                style={{ borderRadius: 14, fontWeight: 700, height: 64, fontSize: 18, minWidth: 120 }}
              >
                중단
              </Button>
            </div>
          </div>

          {/* 중간 도구함: 엑셀 편의 도구 (선택 사항) */}
          <div
            style={{
              background: '#f9fafb',
              padding: '24px',
              borderRadius: 20,
              border: '1px solid #eee',
              marginBottom: 32,
            }}
          >
            <div
              style={{
                fontSize: 16,
                color: '#555',
                fontWeight: 700,
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <FileExcelOutlined style={{ color: '#1d6f42' }} /> 📊 대량 등록/수정용 엑셀 도구 (선택 사항)
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                  style={{
                    borderRadius: 12,
                    fontWeight: 600,
                    height: 52,
                    fontSize: 16,
                    minWidth: 200,
                    backgroundColor: '#fff',
                  }}
                >
                  작성한 엑셀 파일 올리기
                </Button>
                <span style={{ fontSize: 12, color: '#999', textAlign: 'center' }}>목록에 일괄 추가</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Button
                  size="large"
                  icon={<EditOutlined />}
                  onClick={async () => {
                    const filePath = await ipcRenderer.invoke('select-excel')
                    if (filePath) {
                      await uploadExcelModifyData(filePath)
                    }
                  }}
                  loading={settings.loading}
                  style={{ borderRadius: 12, fontWeight: 600, height: 52, fontSize: 16, minWidth: 200 }}
                >
                  기존 상품 정보 수정하기
                </Button>
                <span style={{ fontSize: 12, color: '#999', textAlign: 'center' }}>엑셀로 내용 수정</span>
              </div>

              <div style={{ width: 1, height: 40, background: '#e5e7eb', margin: '0 8px', alignSelf: 'flex-start' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Button
                  size="large"
                  icon={<DownloadOutlined />}
                  onClick={downloadExcelData}
                  loading={settings.loading}
                  disabled={totalCount === 0}
                  style={{
                    borderRadius: 12,
                    fontWeight: 700,
                    height: 52,
                    fontSize: 16,
                    minWidth: 220,
                    borderColor: selectedCount > 0 ? '#1890ff' : '#d9d9d9',
                    color: selectedCount > 0 ? '#1890ff' : 'rgba(0, 0, 0, 0.88)',
                  }}
                >
                  {selectedCount > 0 ? `선택한 ${selectedCount}개 다운로드` : '전체 리스트 다운로드'}
                </Button>
                <span style={{ fontSize: 12, color: '#999', textAlign: 'center' }}>엑셀 파일로 저장</span>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              marginBottom: 12,
              padding: '0 4px',
            }}
          >
            <Popconfirm
              title="선택 상품 삭제"
              description={`선택된 ${selectedCount}개의 상품을 정말로 삭제하시겠습니까?`}
              onConfirm={() => removeProducts(selectedKeys)}
              okText="예, 삭제합니다"
              cancelText="아니오"
              okButtonProps={{ danger: true, size: 'large' }}
              cancelButtonProps={{ size: 'large' }}
              disabled={selectedCount === 0 || settings.loading}
            >
              <Button
                size="large"
                danger
                type="primary"
                ghost
                icon={<DeleteOutlined />}
                disabled={selectedCount === 0 || settings.loading}
                style={{
                  fontWeight: 700,
                  fontSize: 16,
                  height: 48,
                  borderRadius: 10,
                  padding: '0 24px',
                }}
              >
                선택한 항목({selectedCount}) 삭제하기
              </Button>
            </Popconfirm>
          </div>

          <Table
            columns={columns}
            dataSource={products}
            rowKey="id"
            rowSelection={{
              type: 'checkbox',
              selectedRowKeys: selectedKeys,
              onChange: keys => setSelectedKeys(keys as string[]),
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
        onSave={(id, updatedData) => updateProduct(id, updatedData)}
        onCancel={() => {
          setIsEditModalVisible(false)
          setEditingProduct(null)
        }}
      />

      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                backgroundColor: settings.loading ? '#52c41a' : '#bfbfbf',
                animation: settings.loading ? 'pulse 2s infinite' : 'none',
              }}
            />
            <span style={{ fontSize: 20, fontWeight: 700 }}>실시간 작업 현황 (로그)</span>
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
          maxWidth: 1400,
          margin: '24px auto 48px auto',
        }}
      >
        <div
          ref={terminalRef}
          style={{
            backgroundColor: '#1e1e1e',
            color: '#d4d4d4',
            height: '280px',
            overflowY: 'auto',
            padding: '20px',
            fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
            borderRadius: '12px',
            fontSize: 15,
            lineHeight: 1.8,
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: '#888', fontStyle: 'italic' }}>작업을 시작하면 이 곳에 처리 결과가 표시됩니다.</div>
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
          70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(82, 196, 26, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(82, 196, 26, 0); }
        }
        .premium-table .ant-table {
          background: transparent;
        }
        .premium-table .ant-table-thead > tr > th {
          background: #f0f2f5;
          font-weight: 700;
          font-size: 16px;
          color: #333;
          border-bottom: 2px solid #ddd;
          padding: 16px;
        }
        .premium-table .ant-table-tbody > tr > td {
          font-size: 15px;
          padding: 16px;
        }
        .premium-table .ant-table-tbody > tr:hover > td {
          background: #f0f7ff !important;
        }
        .premium-table .ant-table-row-selected > td {
          background: #e6f4ff !important;
        }
        .ant-table-selection-column {
          width: 60px;
        }
        .ant-checkbox-inner {
          width: 20px;
          height: 20px;
        }
        .ant-checkbox-checked .ant-checkbox-inner::after {
          width: 6.5px;
          height: 11px;
        }
      `}</style>
    </>
  )
}

export default Register
