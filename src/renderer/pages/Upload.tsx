import React, {useEffect, useState} from 'react'
import {Button, Card, message, Space, Table} from 'antd'
import {DownloadOutlined, ReloadOutlined, UploadOutlined} from '@ant-design/icons'
import type {ColumnsType} from 'antd/es/table'
import {TableRowSelection} from 'antd/es/table/interface'
import path from 'node:path'

const {ipcRenderer} = window.require('electron')

interface ProductData {
  key: string;
  goodsName: string;
  spec: string;
  modelName: string;
  originalData?: any;
}

const Upload: React.FC = () => {
  const [data, setData] = useState<ProductData[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])

  useEffect(() => {
    loadExcelData()
  }, [])

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
      setSelectedKeys(loadedData.map((item) => item.key))

      message.success('Excel 데이터를 성공적으로 불러왔습니다.')
    } catch (error) {
      console.error('Failed to load Excel data:', error)
      message.error('데이터 로드에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const rowSelection: TableRowSelection<ProductData> = {
    type: 'checkbox',
    selectedRowKeys: selectedKeys,
    onChange: (selectedRowKeys) => {
      setSelectedKeys(selectedRowKeys)
    },
    getCheckboxProps: (record) => ({
      disabled: loading,
    }),
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
        const product = data.find((item) => item.key === key)

        if (product) {
          try {
            await ipcRenderer.invoke('register-product', {
              productData: product.originalData,
              excelPath: settings.excelPath,
            })
            message.success(`상품 "${product.goodsName}" 처리완료`)
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

  const downloadSampleExcel = async () => {
    const excelFilePath = path.join(__dirname, '../../files/상품등록_형식포함_예시양식.xlsx')
    await ipcRenderer.invoke('download-file', excelFilePath)
    await message.success('엑셀 파일 다운로드가 시작되었습니다.')
  }

  return (
    <Card
      title="상품 등록"
      extra={
        <Space>
          <Button
            icon={<ReloadOutlined/>}
            onClick={loadExcelData}
            loading={loading}
          >
            새로고침
          </Button>
          <Button
            type="primary"
            icon={<UploadOutlined/>}
            onClick={handleUpload}
            loading={loading}
            disabled={selectedKeys.length === 0}
          >
            선택 상품 등록
          </Button>
          <Button
            type="primary"
            icon={<DownloadOutlined/>}
            onClick={downloadSampleExcel}
          >
            엑셀 예시 다운로드
          </Button>
        </Space>
      }
    >
      <Table
        columns={columns}
        dataSource={data}
        rowSelection={rowSelection}
        loading={loading}
      />
    </Card>
  )
}

export default Upload
