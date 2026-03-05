import React, { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Space, Table, Input, Select, Tag } from 'antd'
import { FolderOpenOutlined, ReloadOutlined, StopOutlined, UploadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useLog } from '../hooks/useLog'
import { useRegister } from '../hooks/useRegister'
import { ProductData } from '../stores/registerStore'

const Register: React.FC = () => {
  const { logs, progress, clearLogs } = useLog()
  const {
    products,
    selectedKeys,
    settings,
    permission,
    setSelectedKeys,
    checkPermission,
    loadExcelData,
    openResultFolder,
    registerProducts,
    cancelRegistration,
    updateSelectedAccountId,
    syncAccountPresets,
  } = useRegister()

  const { ipcRenderer } = (window as any).require('electron')
  const terminalRef = useRef<HTMLDivElement>(null)
  const [currentPublicIp, setCurrentPublicIp] = useState<string>('')

  useEffect(() => {
    ;(async () => {
      const synced = await syncAccountPresets()
      const targetAccount = synced.accounts.find((account: any) => account.id === synced.selectedAccountId)
      await checkPermission(targetAccount?.loginId)
      const ipResult = await ipcRenderer.invoke('get-current-public-ip')
      setCurrentPublicIp(ipResult?.success ? ipResult.ip : '')
      await loadExcelData()
    })()
  }, [checkPermission, loadExcelData, syncAccountPresets])

  // 로그 업데이트 시 스크롤을 맨 아래로 이동
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs])

  const columns: ColumnsType<ProductData> = [
    {
      title: '상품명',
      dataIndex: 'goodsName',
      key: 'goodsName',
    },
    {
      title: '규격',
      dataIndex: 'spec',
      key: 'spec',
    },
    {
      title: '모델명',
      dataIndex: 'modelName',
      key: 'modelName',
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

      <Card title="상품 등록" style={{ marginBottom: '20px', opacity: permission.hasPermission === false ? 0.5 : 1 }}>
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            border: '1px solid #f0f0f0',
            borderRadius: 10,
            background: '#fafafa',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 12,
              flexWrap: 'wrap',
              marginBottom: 10,
            }}
          >
            <Space wrap size={[8, 8]} align="center">
              <span style={{ fontSize: 12, color: '#666' }}>사업자</span>
              <Select
                style={{ width: 240 }}
                placeholder="사업자(계정) 선택"
                value={settings.selectedAccountId}
                options={settings.accounts.map((account, index) => ({
                  label: account.name?.trim() || account.loginId || `계정 ${index + 1}`,
                  value: account.id,
                }))}
                onChange={updateSelectedAccountId}
                disabled={settings.loading}
              />
              <Tag color={selectedCount > 0 ? 'blue' : 'default'}>
                선택 {selectedCount.toLocaleString()} / 전체 {totalCount.toLocaleString()}
              </Tag>
            </Space>

            <Space wrap size={[8, 8]}>
              <Button
                icon={<ReloadOutlined />}
                onClick={loadExcelData}
                loading={settings.loading}
                disabled={permission.hasPermission === false}
              >
                새로고침
              </Button>
              <Button
                type="primary"
                icon={<UploadOutlined />}
                onClick={registerProducts}
                loading={settings.loading}
                disabled={
                  selectedKeys.length === 0 || permission.hasPermission === false || !settings.selectedAccountId
                }
              >
                선택 상품 등록
              </Button>
              <Button
                type="primary"
                danger
                icon={<StopOutlined />}
                onClick={cancelRegistration}
                disabled={!settings.loading}
              >
                중단
              </Button>
            </Space>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 8,
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <Input
              readOnly
              value={settings.excelPath}
              placeholder="등록용 Excel 파일 경로"
              addonAfter={
                <Button
                  type="text"
                  icon={<FolderOpenOutlined />}
                  onClick={async () => {
                    const filePath = await ipcRenderer.invoke('select-excel')
                    if (filePath) {
                      await ipcRenderer.invoke('save-settings', { excelPath: filePath })
                      await loadExcelData()
                    }
                  }}
                  disabled={settings.loading}
                >
                  선택
                </Button>
              }
            />
            <Button type="default" icon={<FolderOpenOutlined />} onClick={openResultFolder}>
              결과 폴더 열기
            </Button>
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
            <div
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                background: '#fff',
                border: '1px solid #eaeaea',
              }}
            >
              <span style={{ color: '#666' }}>현재IP</span>
              <span style={{ marginLeft: 8, fontFamily: 'monospace', color: '#111' }}>{currentPublicIp || '-'}</span>
            </div>
            <div
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                background: '#fff',
                border: '1px solid #eaeaea',
              }}
            >
              <span style={{ color: '#666' }}>계정마지막IP</span>
              <span style={{ marginLeft: 8, fontFamily: 'monospace', color: '#111' }}>
                {selectedAccount?.lastRegisteredIp || '-'}
              </span>
            </div>
          </div>
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
            <div
              key={index}
              style={{ color: log.level === 'error' ? '#FF0000' : log.level === 'warning' ? '#FFA500' : '#00FF00' }}
            >
              {log.log}
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

export default Register
