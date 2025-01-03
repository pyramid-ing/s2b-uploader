import React, {useEffect, useState} from 'react'
import {Layout, Menu, theme} from 'antd'
import {SettingOutlined, UploadOutlined} from '@ant-design/icons'
import {Route, Routes, useLocation, useNavigate} from 'react-router-dom'
import Settings from './pages/Settings'
import Upload from './pages/Upload'

const {Header, Sider, Content} = Layout

const App: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const {
    token: {colorBgContainer},
  } = theme.useToken()

  const menuItems = [
    {
      key: '/upload',
      icon: <UploadOutlined/>,
      label: '상품등록',
    },
    {
      key: '/settings',
      icon: <SettingOutlined/>,
      label: '설정',
    },
  ]

  useEffect(() => {
    if (location.pathname === '/') {
      navigate('/upload')
    }
  }, [location, navigate])

  return (
    <Layout style={{minHeight: '100vh'}}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <div style={{color: '#FFF', padding: '20px', textAlign: 'center'}}>
          S2B 머신
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({key}) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{padding: 0, background: colorBgContainer}}/>
        <Content style={{margin: '16px'}}>
          <Routes>
            <Route path="/upload" element={<Upload/>}/>
            <Route path="/settings" element={<Settings/>}/>
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
