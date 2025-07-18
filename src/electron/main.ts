import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import * as path from 'path'
import Store from 'electron-store'
import { S2BAutomation } from './s2b-automation'
import fs from 'fs/promises'
import * as fsSync from 'fs'
import * as XLSX from 'xlsx'
import axios from 'axios'
import dayjs from 'dayjs'
import { autoUpdater } from 'electron-updater'

/**
 * 계정 유효성 확인 함수
 * @param accountId - 확인할 계정 ID
 * @returns boolean - 계정이 유효한 경우 true, 그렇지 않은 경우 false
 */
async function checkAccountValidity(accountId: string): Promise<boolean> {
  try {
    const response = await axios.post('https://n8n.pyramid-ing.com/webhook/check-s2b-id', {
      accountId,
    })
    return response.data?.exist === true
  } catch (error) {
    console.error('계정 확인 실패:', error)
    throw new Error('계정 확인 중 문제가 발생했습니다.')
  }
}

/**
 * 문자열 정리 함수
 * @param value - 정리할 값
 * @returns 정리된 문자열 또는 원래 값
 */
function sanitizeString(value: any): any {
  if (typeof value === 'string') {
    // \u00A0 -> 띄어쓰기에서 이상한 문자섞이는 경우 있음
    return value.replace(/\u00A0/g, ' ').trim()
  }
  return value
}

/**
 * 상품 데이터 정리 함수
 * @param product - 정리할 상품 객체
 * @returns 정리된 상품 객체
 */
function sanitizeProductData(product: any): any {
  const sanitizedProduct = { ...product }

  // 상품 객체의 모든 속성에 대해 문자열 정리 적용
  for (const key in sanitizedProduct) {
    if (sanitizedProduct.hasOwnProperty(key)) {
      sanitizedProduct[key] = sanitizeString(sanitizedProduct[key])
    }
  }

  return sanitizedProduct
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

const saveExcelResult = async (allProducts: any[]) => {
  try {
    const settings = store.get('settings')
    const originalPath = settings.excelPath // 원본 엑셀 파일 경로
    const logDir = path.join(settings.fileDir, 'log') // log 폴더 경로

    // ✅ log 폴더 없으면 생성
    if (!fsSync.existsSync(logDir)) {
      fsSync.mkdirSync(logDir, { recursive: true })
    }

    const workbook = XLSX.readFile(originalPath)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]

    // ✅ JSON으로 변환 (1행을 헤더로 사용)
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })

    if (rows.length === 0) {
      console.error('엑셀 파일이 비어 있습니다.')
      return
    }

    // ✅ "결과" 열이 없으면 추가
    if (!rows[0].hasOwnProperty('결과')) {
      rows.forEach(row => {
        row['결과'] = '' // 새로운 열 추가
      })
    } else {
      // ✅ 기존 결과 초기화
      rows.forEach(row => {
        row['결과'] = ''
      })
    }

    // ✅ 선택된 상품만 결과 업데이트
    allProducts.forEach((product, index) => {
      if (product.selected) {
        // ✅ 상품 데이터 정리 적용
        const sanitizedProduct = sanitizeProductData(product)
        rows[index]['결과'] = sanitizedProduct.result || '알 수 없음' // ✅ 선택된 상품만 결과 입력
      }
    })

    // ✅ 결과 파일을 log 폴더에 저장
    const timestamp = dayjs().format('YYYYMMDD_HHmmss')
    const resultPath = path.join(logDir, `결과_${timestamp}.xlsx`)

    // ✅ JSON 데이터를 다시 엑셀 형식으로 변환
    const updatedSheet = XLSX.utils.json_to_sheet(rows)
    workbook.Sheets[workbook.SheetNames[0]] = updatedSheet
    XLSX.writeFile(workbook, resultPath)

    return resultPath
  } catch (error) {
    console.error('엑셀 결과 저장 실패:', error)
  }
}

interface StoreSchema {
  settings: {
    fileDir: string
    excelPath: string
    loginId: string
    loginPw: string
    registrationDelay: string
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
      registrationDelay: '',
      imageOptimize: false,
      headless: false,
    },
  },
  // 중요한 데이터는 암호화
  encryptionKey: 's2b-uploader-secret-key',
})

let mainWindow: BrowserWindow | null = null

function sendLogToRenderer(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss') // ✅ 타임스탬프 추가
  if (mainWindow) {
    mainWindow.webContents.send('log-message', { log: `[${timestamp}] ${message}`, level })
  }
}

/**
 * 자동 업데이트 설정
 * @param win - BrowserWindow 인스턴스
 */
function setupAutoUpdater(win: BrowserWindow) {
  autoUpdater.autoDownload = true

  autoUpdater.on('checking-for-update', () => {
    sendLogToRenderer('업데이트 확인 중...', 'info')
  })

  autoUpdater.on('update-available', () => {
    sendLogToRenderer('업데이트 가능', 'info')
    win.webContents.send('update_available')
  })

  autoUpdater.on('update-not-available', () => {
    sendLogToRenderer('업데이트 없음', 'info')
  })

  autoUpdater.on('download-progress', progressObj => {
    sendLogToRenderer(`다운로드 진행률: ${progressObj.percent}%`, 'info')
  })

  autoUpdater.on('update-downloaded', () => {
    sendLogToRenderer('업데이트 다운로드 완료', 'info')
    win.webContents.send('update_downloaded')
    dialog
      .showMessageBox(win, {
        type: 'info',
        title: '업데이트 완료',
        message: '새로운 버전이 다운로드되었습니다. 지금 재시작하시겠습니까?',
        buttons: ['지금 재시작', '나중에'],
      })
      .then(result => {
        if (result.response === 0) {
          sendLogToRenderer('재시작을 시작합니다...', 'info')
          autoUpdater.quitAndInstall()
        }
      })
  })

  autoUpdater.on('error', err => {
    sendLogToRenderer(`업데이트 에러: ${err.message}`, 'error')
    win.webContents.send('update_error', err.message)
  })

  // 업데이트 체크 시작
  autoUpdater.checkForUpdatesAndNotify()
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

  // 자동 업데이트 설정
  setupAutoUpdater(mainWindow)

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

  let isCancelled = false // ✅ 등록 중단 상태 변수

  ipcMain.handle('cancel-registration', async () => {
    isCancelled = true
    sendLogToRenderer('상품 등록이 중단되었습니다.', 'warning')
  })

  // 앱 버전 가져오기
  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('open-folder', async () => {
    try {
      const settings = store.get('settings')
      const logDir = path.join(settings.fileDir, 'log') // log 폴더 경로

      // ✅ log 폴더 없으면 생성
      if (!fsSync.existsSync(logDir)) {
        fsSync.mkdirSync(logDir, { recursive: true })
      }

      await shell.openPath(logDir) // log 폴더 열기
    } catch (error) {
      console.error('폴더 열기 실패:', error)
    }
  })

  // Excel 데이터 로드 및 automation 초기화
  ipcMain.handle('load-excel-data', async (_, { excelPath, fileDir }) => {
    try {
      // 경로 확인 및 유효성 체크
      const resolvedExcelPath = decodeURIComponent(encodeURIComponent(path.normalize(path.resolve(excelPath))))
      const resolvedFileDir = decodeURIComponent(encodeURIComponent(path.normalize(path.resolve(fileDir))))

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

  ipcMain.handle('start-and-register-products', async (_, { allProducts }) => {
    isCancelled = false // ✅ 시작 시 중단 상태 초기화

    try {
      sendLogToRenderer('자동화 시작', 'info')

      const settings = store.get('settings')
      automation = new S2BAutomation(settings.fileDir, sendLogToRenderer, settings.headless)

      await automation.start()
      sendLogToRenderer('브라우저 시작 완료', 'info')

      await automation.login(settings.loginId, settings.loginPw)
      sendLogToRenderer(`로그인 성공 (ID: ${settings.loginId})`, 'info')

      automation.setImageOptimize(settings.imageOptimize)
      sendLogToRenderer(`이미지 최적화 설정: ${settings.imageOptimize}`, 'info')

      // ✅ 계정 유효성 검사
      const isAccountValid = await checkAccountValidity(settings.loginId)
      if (!isAccountValid) {
        throw new Error('인증되지 않은 계정입니다. 상품 등록이 불가능합니다.')
      }

      const delay = Number(settings.registrationDelay) || 0 // 등록 간격 (초)
      const selectedProducts = allProducts.filter(p => p.selected) // ✅ 선택된 상품만 필터링

      for (let i = 0; i < selectedProducts.length; i++) {
        if (isCancelled) {
          sendLogToRenderer('상품 등록이 사용자에 의해 중단되었습니다.', 'warning')
          break
        }

        const product = selectedProducts[i]

        if (!product.selected) continue // ✅ 선택되지 않은 상품은 무시

        try {
          // ✅ 상품 등록 전 데이터 정리
          const sanitizedProduct = sanitizeProductData(product)

          await automation.registerProduct(sanitizedProduct)
          product.result = '성공' // ✅ 성공한 경우 결과 업데이트
        } catch (error) {
          if (error.message && isIgnorableError(error.message)) {
            // ✅ 무시할 에러
            console.warn(`무시된 에러: ${error.message}`)
          } else {
            // ✅ 사용자에게 보여줘야 하는 에러만 처리
            sendLogToRenderer(`상품 등록 실패: ${product.goodsName} - ${error.message}`, 'error')
            product.result = error.message || '알 수 없는 에러' // ✅ 실패한 경우 결과 업데이트
          }
        }

        // ✅ 설정된 등록 간격만큼 대기
        if (i < selectedProducts.length - 1 && delay > 0) {
          sendLogToRenderer(`다음 상품 등록까지 ${delay}초 대기 중...`, 'info')
          await new Promise(resolve => setTimeout(resolve, delay * 1000))
        }
      }

      return { success: true }
    } catch (error) {
      sendLogToRenderer(`에러 발생: ${error.message}`, 'error')
    } finally {
      const resultPath = await saveExcelResult(allProducts)
      sendLogToRenderer(`결과 파일 저장 완료: ${resultPath}`, 'info')
      await automation.close()
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

  ipcMain.handle('extend-management-date', async (_, { startDate, endDate, registrationStatus }) => {
    try {
      const settings = store.get('settings')
      automation = new S2BAutomation(settings.fileDir, sendLogToRenderer, settings.headless)

      await automation.start()
      sendLogToRenderer('브라우저 시작 완료', 'info')

      await automation.login(settings.loginId, settings.loginPw)
      sendLogToRenderer(`로그인 성공 (ID: ${settings.loginId})`, 'info')

      await automation.extendManagementDateForRange(startDate, endDate, registrationStatus)

      return { success: true, message: `상품 관리일이 ${startDate} ~ ${endDate}로 설정되었습니다.` }
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

    const files = await fs.readdir(tempDir, { encoding: 'utf-8' })
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
