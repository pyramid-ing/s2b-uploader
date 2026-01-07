import React, { useEffect, useState } from 'react'
import { Layout, Menu, theme } from 'antd'
import {
  AppstoreOutlined,
  SettingOutlined,
  UploadOutlined,
  CalendarOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { RecoilRoot } from 'recoil'
import Settings from './pages/Settings'
import Register from './pages/Register'
import Sourcing from './pages/Sourcing'
import Management from './pages/Management'
import License from './pages/License'

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
      key: '/register',
      icon: <UploadOutlined />,
      label: '상품등록',
    },
    {
      key: '/sourcing',
      icon: <AppstoreOutlined />,
      label: '소싱',
    },
    {
      key: '/management',
      icon: <CalendarOutlined />,
      label: '최종관리일',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '설정',
    },
    {
      key: '/license',
      icon: <SafetyCertificateOutlined />,
      label: '라이센스',
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
      navigate('/register')
    }
  }, [location, navigate])

  return (
    <RecoilRoot>
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
              <Route path="/register" element={<Register />} />
              <Route path="/sourcing" element={<Sourcing />} />
              <Route path="/management" element={<Management />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/license" element={<License />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>
    </RecoilRoot>
  )
}

export default App
