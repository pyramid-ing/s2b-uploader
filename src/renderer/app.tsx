import React, { useEffect, useState } from 'react'
import { Layout, Menu, theme } from 'antd'
import { AppstoreOutlined, SettingOutlined, UploadOutlined } from '@ant-design/icons'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import Settings from './pages/Settings'
import Upload from './pages/Upload'
import Sourcing from './pages/Sourcing'

const { ipcRenderer } = window.require('electron')

const { Header, Sider, Content } = Layout

const App: React.FC = () => {
  const [appVersion, setAppVersion] = useState<string>('')
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const {
    token: { colorBgContainer },
  } = theme.useToken()

  const menuItems = [
    {
      key: '/upload',
      icon: <UploadOutlined />,
      label: '상품등록',
    },
    {
      key: '/sourcing',
      icon: <AppstoreOutlined />,
      label: '소싱',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '설정',
    },
  ]

  useEffect(() => {
    const fetchVersion = async () => {
      const version = await ipcRenderer.invoke('get-app-version')
      setAppVersion(version)
    }

    fetchVersion()
  }, [])

  useEffect(() => {
    if (location.pathname === '/') {
      navigate('/upload')
    }
  }, [location, navigate])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <div
          style={{
            color: '#FFF',
            padding: '20px',
            textAlign: 'center',
            backgroundColor: '#001529',
            borderBottom: '1px solid #ccc',
          }}
        >
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>S2B 업로더</div>
          <div style={{ fontSize: '12px', marginTop: '8px', color: '#BBB' }}>
            버전 <span style={{ fontWeight: 'bold' }}>{appVersion}</span>
          </div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: 0, background: colorBgContainer }} />
        <Content style={{ margin: '16px' }}>
          <Routes>
            <Route path="/upload" element={<Upload />} />
            <Route path="/sourcing" element={<Sourcing />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
