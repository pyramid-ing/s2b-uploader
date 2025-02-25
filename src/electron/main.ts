import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import * as path from 'path'
import Store from 'electron-store'
import { S2BAutomation } from './s2b-automation'
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

const ignoredErrorPatterns = [
  'Attempted to use detached Frame',
  'already handle',
  'Target closed',
  'Session closed',
  'Most likely the page has been closed',
  'Navigating frame was detached',
  'Protocol error',
  'Execution context was destroyed',
  'Cannot find context with specified id',
]
const isIgnorableError = (errorMessage: string): boolean => {
  return ignoredErrorPatterns.some(pattern => errorMessage.includes(pattern))
}

const updateExcelResult = async (excelPath: string, goodsName: string, resultMessage: string) => {
  try {
    const workbook = XLSX.readFile(excelPath, { type: 'binary' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 })

    const headers = rows[0]
    const productIndex = rows.findIndex(row => row.includes(goodsName))

    if (productIndex !== -1) {
      const resultColumnKey = '결과'

      // 결과열 추가
      let resultColumnIndex = headers.indexOf(resultColumnKey)
      if (resultColumnIndex === -1) {
        headers.unshift(resultColumnKey)
        resultColumnIndex = 0
        rows.forEach((row, index) => {
          if (index > 0) row.unshift('')
        })
      }

      // 결과 메시지 업데이트
      rows[productIndex][resultColumnIndex] = resultMessage

      // 시트 저장
      const updatedSheet = XLSX.utils.aoa_to_sheet(rows)
      workbook.Sheets[workbook.SheetNames[0]] = updatedSheet
      XLSX.writeFile(workbook, excelPath)
    }
  } catch (excelError) {
    sendLogToRenderer(`엑셀 업데이트 실패: ${excelError.message}`, 'error')
    console.error('엑셀 업데이트 실패:', excelError)
  }
}

interface StoreSchema {
  settings: {
    fileDir: string
    excelPath: string
    loginId: string
    loginPw: string
    imageOptimize: boolean
    headless: boolean
  }
}

// Store 인스턴스 생성
const store = new Store<StoreSchema>({
  defaults: {
    settings: {
      fileDir: '',
      excelPath: '',
      loginId: '',
      loginPw: '',
      imageOptimize: false,
      headless: false,
    },
  },
  // 중요한 데이터는 암호화
  encryptionKey: 's2b-uploader-secret-key',
})

let mainWindow: BrowserWindow | null = null

function sendLogToRenderer(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  if (mainWindow) {
    mainWindow.webContents.send('log-message', { log: message, level })
  }
}

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
  ipcMain.handle('load-excel-data', async (_, { excelPath, fileDir }) => {
    try {
      // 경로 확인 및 유효성 체크
      const resolvedExcelPath = path.normalize(path.resolve(excelPath))
      const resolvedFileDir = path.normalize(path.resolve(fileDir))

      if (!fsSync.existsSync(resolvedExcelPath)) {
        throw new Error(`Excel file does not exist: ${resolvedExcelPath}`)
      }
      if (!fsSync.existsSync(resolvedFileDir)) {
        throw new Error(`File directory does not exist: ${resolvedFileDir}`)
      }

      const automation = new S2BAutomation(resolvedFileDir, sendLogToRenderer)
      const data = await automation.readExcelFile(resolvedExcelPath)
      return data
    } catch (error) {
      console.error('Error loading Excel data:', error)
      throw error
    }
  })

  ipcMain.handle(
    'start-and-register-products',
    async (_, { loginId, loginPw, imageOptimize, productList, excelPath }) => {
      try {
        sendLogToRenderer('자동화 시작', 'info')

        if (!automation) {
          const settings = store.get('settings')
          automation = new S2BAutomation(settings.fileDir, sendLogToRenderer, settings.headless)
        }

        await automation.start()
        sendLogToRenderer('브라우저 시작 완료', 'info')

        await automation.login(loginId, loginPw)
        sendLogToRenderer(`로그인 성공 (ID: ${loginId})`, 'info')

        automation.setImageOptimize(imageOptimize)
        sendLogToRenderer(`이미지 최적화 설정: ${imageOptimize}`, 'info')

        // ✅ 계정 유효성 검사
        const isAccountValid = await checkAccountValidity(loginId)
        if (!isAccountValid) {
          throw new Error('인증되지 않은 계정입니다. 상품 등록이 불가능합니다.')
        }

        // ✅ 상품 등록 순회 및 진행상황 로그 추가
        const totalItems = productList.length
        for (let i = 0; i < totalItems; i++) {
          const product = productList[i]
          const progressMessage = `현재 진행: ${i + 1} / ${totalItems}`
          sendLogToRenderer(progressMessage, 'info')

          try {
            await automation.registerProduct(product)
            sendLogToRenderer(`상품 등록 성공: ${product.goodsName}`, 'info')

            // ✅ 성공 메시지 엑셀에 추가
            await updateExcelResult(excelPath, product.goodsName, '성공')
          } catch (error) {
            if (error.message && isIgnorableError(error.message)) {
              // ✅ 무시할 에러
              console.warn(`무시된 에러: ${error.message}`)
            } else {
              // ✅ 사용자에게 보여줘야 하는 에러만 처리
              sendLogToRenderer(`상품 등록 실패: ${product.goodsName} - ${error.message}`, 'error')
              await updateExcelResult(excelPath, product.goodsName, error.message || '알 수 없는 에러')
            }
          }
        }

        return { success: true }
      } catch (error) {
        sendLogToRenderer(`에러 발생: ${error.message}`, 'error')
        console.error('자동화 실패:', error)
        return { success: false, error: error.message }
      } finally {
        await automation.close()
      }
    },
  )

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

  ipcMain.handle('check-account-validity', async (_, { accountId }) => {
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
      filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }],
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

  ipcMain.handle('extend-management-date', async (_, { weeks }) => {
    try {
      await automation.extendManagementDateForWeeks(weeks)

      return { success: true, message: `상품 관리일이 ${weeks}주 이내로 설정되었습니다.` }
    } catch (error) {
      console.error('Failed to extend management date:', error)
      return { success: false, error: error.message || 'Unknown error occurred.' }
    }
  })
}

async function clearTempFiles(fileDir: string): Promise<void> {
  const tempDir = path.join(fileDir, 'temp')

  try {
    if (!fsSync.existsSync(tempDir)) {
      console.warn(`Directory does not exist: ${tempDir}`)
      return
    }

    const files = await fs.readdir(tempDir)
    await Promise.all(
      files.map(async file => {
        try {
          await fs.unlink(path.join(tempDir, file))
        } catch (error) {
          console.warn(`Failed to delete file ${file}:`, error)
        }
      }),
    )
    console.log(`Deleted all files in ${tempDir}`)
  } catch (error) {
    console.error(`Failed to delete files in ${tempDir}:`, error)
  }
}

app.whenReady().then(() => {
  const settings = store.get('settings')

  // temp 디렉토리 정리
  clearTempFiles(settings.fileDir).catch(error => console.error(error))

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
process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})
