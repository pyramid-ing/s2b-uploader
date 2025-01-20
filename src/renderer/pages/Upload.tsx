import React, { useEffect, useState } from 'react'
import { Alert, Button, Card, InputNumber, message, Space, Table } from 'antd'
import { ReloadOutlined, UploadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

const { ipcRenderer } = window.require('electron')

interface ProductData {
  key: string
  goodsName: string
  spec: string
  modelName: string
  originalData?: any
}

const Upload: React.FC = () => {
  const [data, setData] = useState<ProductData[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])
  const [weeks, setWeeks] = useState<number>(12)
  const [isAccountValid, setIsAccountValid] = useState<boolean | null>(null)

  useEffect(() => {
    checkAccountValidity()
    loadExcelData()
  }, [])

  const checkAccountValidity = async () => {
    try {
      const settings = await ipcRenderer.invoke('get-settings')
      if (!settings?.loginId) {
        message.error('로그인 정보가 설정되지 않았습니다.')
        setIsAccountValid(false)
        return
      }
      const result = await ipcRenderer.invoke('check-account-validity', {
        accountId: settings.loginId,
      })
      setIsAccountValid(result)
    } catch (error) {
      console.error('계정 유효성 확인 실패:', error)
      setIsAccountValid(false)
      message.error('계정 유효성 확인 중 오류가 발생했습니다.')
    }
  }

  const loadExcelData = async () => {
    try {
      const settings = await ipcRenderer.invoke('get-settings')
      if (!settings?.excelPath) {
        message.warning('Excel 파일 경로가 설정되지 않았습니다.')
        return
      }
      if (!settings?.imageDir) {
        message.warning('이미지 디렉토리가 설정되지 않았습니다.')
        return
      }

      setLoading(true)

      const products = await ipcRenderer.invoke('load-excel-data', {
        excelPath: settings.excelPath,
        imageDir: settings.imageDir,
      })

      const loadedData = products.map((p: any, index: number) => ({
        key: index.toString(),
        goodsName: p.goodsName,
        spec: p.spec,
        modelName: p.modelName,
        originalData: p,
      }))
      setData(loadedData)
      setSelectedKeys(loadedData.map(item => item.key))

      message.success('Excel 데이터를 성공적으로 불러왔습니다.')
    } catch (error) {
      console.error('Failed to load Excel data:', error)
      message.error('데이터 로드에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async () => {
    try {
      if (selectedKeys.length === 0) {
        message.warning('등록할 상품을 선택해주세요.')
        return
      }

      const settings = await ipcRenderer.invoke('get-settings')
      if (!settings?.loginId || !settings?.loginPw) {
        message.error('로그인 정보가 설정되지 않았습니다.')
        return
      }

      setLoading(true)

      await ipcRenderer.invoke('start-automation', {
        loginId: settings.loginId,
        loginPw: settings.loginPw,
      })

      for (const key of selectedKeys) {
        const product = data.find(item => item.key === key)

        if (product) {
          try {
            await ipcRenderer.invoke('register-product', {
              productData: product.originalData,
              excelPath: settings.excelPath,
            })
            message.success(`상품 "${product.goodsName}" 처리 완료`)
          } catch (error) {
            console.error(`Failed to register product: ${product.goodsName}`, error)
            message.error(`상품 "${product.goodsName}" 등록에 실패했습니다.`)
          }
        }
      }
    } catch (error) {
      console.error('Upload process failed:', error)
      message.error('상품 등록 과정에서 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleExtendManagementDate = async () => {
    try {
      const settings = await ipcRenderer.invoke('get-settings')
      if (!settings?.loginId || !settings?.loginPw) {
        message.error('로그인 정보가 설정되지 않았습니다.')
        return
      }

      await ipcRenderer.invoke('start-automation', {
        loginId: settings.loginId,
        loginPw: settings.loginPw,
      })

      const result = await ipcRenderer.invoke('extend-management-date', { weeks })
    } catch (error) {
      console.error('관리일 연장 실패:', error)
    }
  }

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

  return (
    <>
      {isAccountValid === false && (
        <Alert
          message="계정 인증 실패"
          description="현재 계정으로는 상품 등록이 불가능합니다. 관리자에게 문의하세요."
          type="error"
          showIcon
          style={{ marginBottom: '20px' }}
        />
      )}

      <Card
        title="관리일 설정"
        style={{ marginBottom: '20px', opacity: isAccountValid === false ? 0.5 : 1 }}
        bordered={false}
      >
        <Space direction="vertical" size="middle">
          <Space>
            <label>관리일 (몇 주 이내):</label>
            <InputNumber
              min={1}
              value={weeks}
              onChange={value => setWeeks(value || 1)}
              disabled={isAccountValid === false}
            />
          </Space>
          <Button type="primary" onClick={handleExtendManagementDate} disabled={isAccountValid === false || loading}>
            관리일 연장
          </Button>
        </Space>
      </Card>

      <Card
        title="상품 등록"
        style={{ marginBottom: '20px', opacity: isAccountValid === false ? 0.5 : 1 }}
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadExcelData}
              loading={loading}
              disabled={isAccountValid === false}
            >
              새로고침
            </Button>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              onClick={handleUpload}
              loading={loading}
              disabled={selectedKeys.length === 0 || isAccountValid === false}
            >
              선택 상품 등록
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={data}
          rowSelection={{
            type: 'checkbox',
            selectedRowKeys: selectedKeys,
            onChange: setSelectedKeys,
            getCheckboxProps: () => ({
              disabled: isAccountValid === false || loading,
            }),
          }}
          loading={loading}
        />
      </Card>
    </>
  )
}

export default Upload
