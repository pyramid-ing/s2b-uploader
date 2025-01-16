import {app, BrowserWindow, dialog, ipcMain, shell} from 'electron'
import * as path from 'path'
import Store from 'electron-store'
import {S2BAutomation} from './s2b-automation'
import fs from 'fs/promises'
import * as fsSync from 'fs'
import * as XLSX from 'xlsx'
import axios from 'axios'

/**
 * 계정 유효성 확인 함수
 * @param accountId - 확인할 계정 ID
 * @returns boolean - 계정이 유효한 경우 true, 그렇지 않은 경우 false
 */
async function checkAccountValidity(accountId: string): Promise<boolean> {
  try {
    const response = await axios.post('http://211.188.51.146:20001/webhook/check-s2b-id', {
      accountId,
    })
    return response.data?.exist === true
  } catch (error) {
    console.error('계정 확인 실패:', error)
    throw new Error('계정 확인 중 문제가 발생했습니다.')
  }
}

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
    icon: path.join(__dirname, '../../build/icon.png'), // 개발 모드용 아이콘 경로
  })
// main.ts 내부
  if (process.env.ELECTRON_DEBUG) {
    console.log('Loading dev server at http://localhost:8080')
    mainWindow.loadURL('http://localhost:8080')
  } else {
    const indexPath = path.resolve(app.getAppPath(), 'dist/renderer/index.html')
    mainWindow.loadFile(indexPath)
  }
}

// IPC 핸들러 설정
function setupIpcHandlers() {
  let automation: S2BAutomation | null = null


// 앱 버전 가져오기
  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  // Excel 데이터 로드 및 automation 초기화
  ipcMain.handle('load-excel-data', async (_, {excelPath, imageDir}) => {
    try {
      // 경로 확인 및 유효성 체크
      const resolvedExcelPath = path.normalize(path.resolve(excelPath))
      const resolvedImageDir = path.normalize(path.resolve(imageDir))

      if (!fsSync.existsSync(resolvedExcelPath)) {
        throw new Error(`Excel file does not exist: ${resolvedExcelPath}`)
      }
      if (!fsSync.existsSync(resolvedImageDir)) {
        throw new Error(`Image directory does not exist: ${resolvedImageDir}`)
      }

      const automation = new S2BAutomation(resolvedImageDir)
      const data = await automation.readExcelFile(resolvedExcelPath)
      return data
    } catch (error) {
      console.error('Error loading Excel data:', error)
      throw error
    }
  })
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

  ipcMain.handle('register-product', async (_, {productData, excelPath}) => {
    try {
      if (!automation) {
        throw new Error('Automation not initialized')
      }

      // 계정 유효성 확인
      const settings = store.get('settings')
      const isAccountValid = await checkAccountValidity(settings.loginId)

      if (!isAccountValid) {
        throw new Error('인증되지 않은 계정입니다. 상품 등록이 불가능합니다.')
      }

      await automation.registerProduct(productData) // 상품 등록 로직

      // 등록 성공 메시지 추가
      const workbook = XLSX.readFile(excelPath, {type: 'binary'})
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, {header: 1})

      const headers = rows[0] // 첫 번째 행은 헤더
      const productIndex = rows.findIndex((row) => row.includes(productData.goodsName))

      if (productIndex !== -1) {
        const resultColumnKey = '결과' // "결과" 열 이름

        // 결과열 확인: 없으면 첫 번째 열(A 열)에 추가
        let resultColumnIndex = headers.indexOf(resultColumnKey)
        if (resultColumnIndex === -1) {
          headers.unshift(resultColumnKey) // 첫 번째 열로 추가
          resultColumnIndex = 0 // A 열로 설정
          rows.forEach((row, index) => {
            if (index > 0) row.unshift('') // 데이터 행도 맞춰서 빈 값 추가
          })
        }

        // 성공 메시지 작성
        rows[productIndex][resultColumnIndex] = '성공'

        // 시트 업데이트 및 저장
        const updatedSheet = XLSX.utils.aoa_to_sheet(rows)
        workbook.Sheets[workbook.SheetNames[0]] = updatedSheet
        XLSX.writeFile(workbook, excelPath)
      }

      return {success: true}
    } catch (error) {
      console.error('Failed to register product:', error)

      // 에러 메시지 추가
      try {
        const workbook = XLSX.readFile(excelPath, {type: 'binary'})
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, {header: 1})

        const headers = rows[0]
        const productIndex = rows.findIndex((row) => row.includes(productData.goodsName))

        if (productIndex !== -1) {
          const resultColumnKey = '결과'

          // 결과열 확인: 없으면 첫 번째 열(A 열)에 추가
          let resultColumnIndex = headers.indexOf(resultColumnKey)
          if (resultColumnIndex === -1) {
            headers.unshift(resultColumnKey) // 첫 번째 열로 추가
            resultColumnIndex = 0 // A 열로 설정
            rows.forEach((row, index) => {
              if (index > 0) row.unshift('') // 데이터 행도 맞춰서 빈 값 추가
            })
          }

          // 에러 메시지 작성
          rows[productIndex][resultColumnIndex] = error.message || '알 수 없는 에러'

          // 시트 업데이트 및 저장
          const updatedSheet = XLSX.utils.aoa_to_sheet(rows)
          workbook.Sheets[workbook.SheetNames[0]] = updatedSheet
          XLSX.writeFile(workbook, excelPath)
        }
      } catch (excelError) {
        console.error('Failed to update Excel with error message:', excelError)
      }

      return {success: false, error: error.message}
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

  ipcMain.handle('check-account-validity', async (_, {accountId}) => {
    return await checkAccountValidity(accountId)
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

  ipcMain.handle('extend-management-date', async (_, {weeks}) => {
    try {
      await automation.extendManagementDateForWeeks(weeks)

      return {success: true, message: `상품 관리일이 ${weeks}주 이내로 설정되었습니다.`}
    } catch (error) {
      console.error('Failed to extend management date:', error)
      return {success: false, error: error.message || 'Unknown error occurred.'}
    }
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
