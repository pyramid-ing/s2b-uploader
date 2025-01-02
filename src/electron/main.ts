import {app, BrowserWindow, dialog, ipcMain, shell} from 'electron'
import * as path from 'path'
import Store from 'electron-store'
import {S2BAutomation} from './s2b-automation'
import fs from 'fs/promises'
import * as fsSync from 'fs'

interface StoreSchema {
  settings: {
    imageDir: string;
    excelPath: string;
    loginId: string;
    loginPw: string;
  };
}

// Store 인스턴스 생성
const store = new Store<StoreSchema>({
  defaults: {
    settings: {
      imageDir: '',
      excelPath: '',
      loginId: '',
      loginPw: '',
    },
  },
  // 중요한 데이터는 암호화
  encryptionKey: 's2b-uploader-secret-key',
})

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })
// main.ts 내부
  if (process.env.ELECTRON_DEBUG) {
    console.log('Loading dev server at http://localhost:8080')
    mainWindow.loadURL('http://localhost:8080')
  } else {
    const indexPath = path.resolve(app.getAppPath(), 'dist/renderer/index.html');
    mainWindow.loadFile(indexPath);
  }
}

// IPC 핸들러 설정
function setupIpcHandlers() {
  let automation: S2BAutomation | null = null


  // Excel 데이터 로드 및 automation 초기화

  ipcMain.handle('load-excel-data', async (_, { excelPath, imageDir }) => {
    try {
      // 경로 확인 및 유효성 체크
      const resolvedExcelPath = path.resolve(excelPath);
      const resolvedImageDir = path.resolve(imageDir);

      if (!fsSync.existsSync(resolvedExcelPath)) {
        throw new Error(`Excel file does not exist: ${resolvedExcelPath}`);
      }
      if (!fsSync.existsSync(resolvedImageDir)) {
        throw new Error(`Image directory does not exist: ${resolvedImageDir}`);
      }

      const automation = new S2BAutomation(resolvedImageDir);
      const data = await automation.readExcelFile(resolvedExcelPath);
      return data;
    } catch (error) {
      console.error('Error loading Excel data:', error);
      throw error;
    }
  });
  // 자동화 시작
  ipcMain.handle('start-automation', async (_, {loginId, loginPw}) => {
    try {
      if (!automation) {
        // automation이 없으면 새로 생성
        const settings = store.get('settings')
        automation = new S2BAutomation(settings.imageDir)
      }
      await automation.start()
      await automation.login(loginId, loginPw)
      return true
    } catch (error) {
      console.error('Failed to start automation:', error)
      throw error
    }
  })

  // 상품 등록
  ipcMain.handle('register-product', async (_, productData) => {
    try {
      if (!automation) {
        throw new Error('Automation not initialized')
      }
      await automation.registerProduct(productData)
      return true
    } catch (error) {
      console.error('Failed to register product:', error)
      throw error
    }
  })

  // 자동화 종료
  ipcMain.handle('close-automation', async () => {
    try {
      if (automation) {
        await automation.close()
        automation = null
      }
      return true
    } catch (error) {
      console.error('Failed to close automation:', error)
      throw error
    }
  })


  // 설정 불러오기
  ipcMain.handle('get-settings', () => {
    try {
      const settings = store.get('settings')
      console.log('Settings loaded:', settings)
      return settings
    } catch (error) {
      console.error('Error loading settings:', error)
      throw error
    }
  })

  // 설정 저장하기
  ipcMain.handle('save-settings', async (_, settings) => {
    try {
      console.log('Saving settings:', settings)
      store.set('settings', settings)
      return true
    } catch (error) {
      console.error('Error saving settings:', error)
      throw error
    }
  })

  // 디렉토리 선택 다이얼로그
  ipcMain.handle('select-directory', async () => {
    if (!mainWindow) return null

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '디렉토리 선택',
    })

    return result.canceled ? null : result.filePaths[0]
  })

  // 엑셀 파일 선택 다이얼로그
  ipcMain.handle('select-excel', async () => {
    if (!mainWindow) return null

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        {name: 'Excel Files', extensions: ['xlsx', 'xls']},
      ],
      title: 'Excel 파일 선택',
    })

    return result.canceled ? null : result.filePaths[0]
  })

  // 파일 다운로드
  ipcMain.handle('download-file', async (_, filePath) => {
    if (!mainWindow) return null

    try {
      // 파일 경로 확인
      if (!filePath || !(await fs.stat(filePath).catch(() => false))) {
        throw new Error(`파일이 존재하지 않습니다: ${filePath}`)
      }

      // 절대 경로로 변환
      const absolutePath = path.resolve(filePath)

      // 저장 경로 다이얼로그 열기
      const saveDialog = await dialog.showSaveDialog(mainWindow, {
        defaultPath: path.basename(absolutePath),
        title: '파일 다운로드',
      })

      if (!saveDialog.canceled && saveDialog.filePath) {
        const destinationPath = saveDialog.filePath

        // 파일 복사
        await fs.copyFile(absolutePath, destinationPath)
        console.log(`파일이 저장되었습니다: ${destinationPath}`)

        // 저장된 파일 열기
        await shell.openPath(destinationPath)
        return destinationPath
      }
    } catch (error) {
      console.error('파일 다운로드 에러:', error.message)
      throw error
    }

    return null
  })
}

app.whenReady().then(() => {
  createWindow()
  setupIpcHandlers()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// 에러 핸들링
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})
