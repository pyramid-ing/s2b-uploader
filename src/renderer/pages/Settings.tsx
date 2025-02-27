import React, { useEffect, useState } from 'react'
import { Button, Card, Form, Input, message, Switch } from 'antd'
import { FolderOutlined } from '@ant-design/icons'

const { ipcRenderer } = window.require('electron')

interface SettingsForm {
  fileDir: string
  excelPath: string
  loginId: string
  loginPw: string
  imageOptimize: boolean // 이미지 최적화 여부
  headless: boolean // ✅ 헤드리스 모드 여부
}

const Settings: React.FC = () => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)

  useEffect(() => {
    loadSettings().finally(() => setInitialLoading(false))
  }, [])

  const loadSettings = async () => {
    try {
      const settings = await ipcRenderer.invoke('get-settings')
      if (settings) {
        form.setFieldsValue(settings)
        console.log('Settings loaded successfully:', settings)
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
      message.error({
        content: '설정을 불러오는데 실패했습니다.',
        key: 'settings-error',
        duration: 3,
      })
    }
  }

  const handleSelectDirectory = async () => {
    try {
      const path = await ipcRenderer.invoke('select-directory')
      if (path) {
        form.setFieldValue('fileDir', path)
        console.log('Selected file directory:', path)
      }
    } catch (error) {
      console.error('Failed to select directory:', error)
      message.error('디렉토리 선택에 실패했습니다.')
    }
  }

  const handleSelectExcel = async () => {
    try {
      const path = await ipcRenderer.invoke('select-excel')
      if (path) {
        form.setFieldValue('excelPath', path)
        console.log('Selected Excel file:', path)
      }
    } catch (error) {
      console.error('Failed to select Excel file:', error)
      message.error('Excel 파일 선택에 실패했습니다.')
    }
  }

  const handleSubmit = async (values: SettingsForm) => {
    try {
      setLoading(true)
      await ipcRenderer.invoke('save-settings', values)
      message.success({
        content: '설정이 저장되었습니다.',
        key: 'settings-success',
        duration: 2,
      })
      console.log('Settings saved successfully:', values)
    } catch (error) {
      console.error('Failed to save settings:', error)
      message.error({
        content: '설정 저장에 실패했습니다.',
        key: 'settings-error',
        duration: 3,
      })
    } finally {
      setLoading(false)
    }
  }

  if (initialLoading) {
    return <Card loading={true} />
  }

  return (
    <Card title="설정">
      <Form form={form} layout="vertical" onFinish={handleSubmit} autoComplete="off" disabled={loading}>
        <Form.Item
          label="파일 폴더 경로"
          name="fileDir"
          rules={[{ required: true, message: '파일 폴더를 선택해주세요' }]}
        >
          <Input
            readOnly
            addonAfter={
              <Button type="text" icon={<FolderOutlined />} onClick={handleSelectDirectory} disabled={loading}>
                선택
              </Button>
            }
          />
        </Form.Item>

        <Form.Item
          label="등록용 Excel 파일 경로"
          name="excelPath"
          rules={[{ required: true, message: 'Excel 파일을 선택해주세요' }]}
        >
          <Input
            readOnly
            addonAfter={
              <Button type="text" icon={<FolderOutlined />} onClick={handleSelectExcel} disabled={loading}>
                선택
              </Button>
            }
          />
        </Form.Item>

        <Form.Item label="로그인 아이디" name="loginId" rules={[{ required: true, message: '아이디를 입력해주세요' }]}>
          <Input />
        </Form.Item>

        <Form.Item label="비밀번호" name="loginPw" rules={[{ required: true, message: '비밀번호를 입력해주세요' }]}>
          <Input.Password />
        </Form.Item>

        {/* 이미지 최적화 설정 추가 */}
        <Form.Item
          label="이미지 최적화"
          name="imageOptimize"
          valuePropName="checked"
          initialValue={false}
          tooltip="이미지 업로드 시 최적화를 진행합니다."
        >
          <Switch />
        </Form.Item>

        <Form.Item
          label="브라우저 숨김"
          name="headless"
          valuePropName="checked"
          initialValue={false}
          tooltip="브라우저 숨김 여부를 선택합니다."
        >
          <Switch />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            저장
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )
}

export default Settings
