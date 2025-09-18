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
    marginRate: number
    detailHtmlTemplate: string
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
      marginRate: 20,
      detailHtmlTemplate: '<p>상세설명을 입력하세요.</p>',
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

      sendLogToRenderer(`엑셀 데이터 로드 시작: ${resolvedExcelPath}`, 'info')
      const settings = store.get('settings')
      const automation = new S2BAutomation(resolvedFileDir, sendLogToRenderer, settings.headless, settings)
      const data = await automation.readExcelFile(resolvedExcelPath)
      return data
    } catch (error) {
      console.error('Error loading Excel data:', error)
      sendLogToRenderer(`엑셀 로드 실패: ${error.message || '알 수 없는 오류'}`, 'error')
      throw error
    }
  })

  ipcMain.handle('start-and-register-products', async (_, { allProducts }) => {
    isCancelled = false // ✅ 시작 시 중단 상태 초기화

    try {
      sendLogToRenderer('자동화 시작', 'info')

      const settings = store.get('settings')
      automation = new S2BAutomation(settings.fileDir, sendLogToRenderer, settings.headless, settings)

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

  // 소싱: 사이트 열기 (브라우저 시작 및 벤더 기본 URL 이동)
  ipcMain.handle('sourcing-open-site', async (_, { vendor }: { vendor: string }) => {
    try {
      const settings = store.get('settings')
      automation = new S2BAutomation(settings.fileDir, sendLogToRenderer, settings.headless, settings)
      await automation.start()
      const baseUrl = vendor === 'domeggook' ? 'https://www.domeggook.com/' : 'https://www.domesin.com/'
      await automation.openUrl(baseUrl)
      return { success: true, url: automation.getCurrentUrl() }
    } catch (error) {
      return { success: false, error: error.message || '사이트 열기 실패' }
    }
  })

  // 소싱: 현재 페이지에서 목록 수집 (이미 열린 브라우저 기준)
  ipcMain.handle('sourcing-collect-list-current', async () => {
    try {
      if (!automation) throw new Error('브라우저가 열려있지 않습니다. 먼저 사이트를 여세요.')
      const currentUrl = automation.getCurrentUrl()
      if (!currentUrl) throw new Error('현재 URL을 확인할 수 없습니다.')
      const list = await automation.collectListFromUrl(currentUrl)
      return { success: true, items: list }
    } catch (error) {
      return { success: false, error: error.message || '현재 페이지 목록 수집 실패' }
    }
  })

  // 현재 브라우저 탭에서 보이는 목록 수집 (특정 URL 전달)
  ipcMain.handle('sourcing-collect-list', async (_, { url }: { url: string }) => {
    try {
      const settings = store.get('settings')
      automation = new S2BAutomation(settings.fileDir, sendLogToRenderer, settings.headless, settings)
      await automation.start()
      const list = await automation.collectListFromUrl(url)
      await automation.close()
      return { success: true, items: list }
    } catch (error) {
      return { success: false, error: error.message || '목록 수집 실패' }
    }
  })

  // 선택된 항목에 대해 상세정보 수집
  ipcMain.handle('sourcing-collect-details', async (_, { urls }: { urls: string[] }) => {
    try {
      const settings = store.get('settings')
      automation = new S2BAutomation(settings.fileDir, sendLogToRenderer, settings.headless, settings)
      await automation.start()
      const details = await automation.collectNormalizedDetailForUrls(urls)
      await automation.close()
      return { success: true, items: details }
    } catch (error) {
      return { success: false, error: error.message || '상세 수집 실패' }
    }
  })

  ipcMain.handle('check-account-validity', async (_, { accountId }) => {
    return await checkAccountValidity(accountId)
  })

  // 설정 불러오기
  ipcMain.handle('get-settings', () => {
    try {
      const settings = store.get('settings')
      return settings
    } catch (error) {
      console.error('Error loading settings:', error)
      throw error
    }
  })

  // 설정 저장하기
  ipcMain.handle('save-settings', async (_, settings) => {
    try {
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
      automation = new S2BAutomation(settings.fileDir, sendLogToRenderer, settings.headless, settings)

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

  // 소싱 데이터 엑셀 다운로드 핸들러
  ipcMain.handle('download-sourcing-excel', async (_, { sourcingItems }) => {
    try {
      const settings = store.get('settings')
      const fileDir = settings.fileDir

      if (!fileDir) {
        throw new Error('파일 폴더가 설정되지 않았습니다.')
      }

      // 다운로드 폴더 생성
      const downloadDir = path.join(fileDir, 'downloads')
      if (!fsSync.existsSync(downloadDir)) {
        fsSync.mkdirSync(downloadDir, { recursive: true })
      }

      // 엑셀 파일 생성
      const timestamp = dayjs().format('YYYYMMDD_HHmmss')
      const fileName = `소싱데이터_${timestamp}.xlsx`
      const filePath = path.join(downloadDir, fileName)

      // 워크북 생성
      const workbook = XLSX.utils.book_new()

      // excelMapped 데이터를 그대로 사용
      const excelData = sourcingItems.map((item: any) => {
        if (item.excelMapped) {
          // 이미 excelMapped가 있는 경우 그대로 사용
          return item.excelMapped
        }
      })

      // 워크시트 생성
      const worksheet = XLSX.utils.json_to_sheet(excelData)

      // 컬럼 너비 설정 (mapToExcelFormat 필드에 맞게 조정)
      const columnWidths = [
        { wch: 15 }, // 카테고리1
        { wch: 15 }, // 카테고리2
        { wch: 15 }, // 카테고리3
        { wch: 10 }, // 등록구분
        { wch: 30 }, // 물품명
        { wch: 20 }, // 규격
        { wch: 20 }, // 모델명
        { wch: 12 }, // 제시금액
        { wch: 12 }, // 원가
        { wch: 15 }, // 제조사
        { wch: 15 }, // 소재재질
        { wch: 10 }, // 재고수량
        { wch: 10 }, // 판매단위
        { wch: 10 }, // 보증기간
        { wch: 15 }, // 납품가능기간
        { wch: 15 }, // 견적서유효기간
        { wch: 12 }, // 배송비종류
        { wch: 10 }, // 배송비
        { wch: 12 }, // 반품배송비
        { wch: 15 }, // 묶음배송여부
        { wch: 15 }, // 제주배송여부
        { wch: 15 }, // 제주추가배송비
        { wch: 50 }, // 상세설명HTML
        { wch: 30 }, // 기본이미지1
        { wch: 30 }, // 기본이미지2
        { wch: 30 }, // 추가이미지1
        { wch: 30 }, // 추가이미지2
        { wch: 30 }, // 상세이미지
        { wch: 15 }, // 원산지구분
        { wch: 20 }, // 국내원산지
        { wch: 20 }, // 해외원산지
        { wch: 20 }, // G2B물품목록번호
        { wch: 10 }, // 배송방법
        { wch: 15 }, // 배송지역
        { wch: 20 }, // 정격전압소비전력
        { wch: 20 }, // 크기및무게
        { wch: 15 }, // 동일모델출시년월
        { wch: 15 }, // 냉난방면적
        { wch: 20 }, // 제품구성
        { wch: 15 }, // 안전표시
        { wch: 10 }, // 용량
        { wch: 20 }, // 주요사양
        { wch: 15 }, // 소비기한선택
        { wch: 15 }, // 소비기한입력
        { wch: 25 }, // 어린이하차확인장치타입
        { wch: 25 }, // 어린이하차확인장치인증번호
        { wch: 25 }, // 어린이하차확인장치첨부파일
        { wch: 20 }, // 안전확인대상타입
        { wch: 20 }, // 안전확인대상신고번호
        { wch: 20 }, // 안전확인대상첨부파일
        { wch: 15 }, // 조달청계약여부
        { wch: 12 }, // 계약시작일
        { wch: 12 }, // 계약종료일
        { wch: 15 }, // 전화번호
        { wch: 20 }, // 제조사AS전화번호
        { wch: 20 }, // 과세여부
        { wch: 15 }, // 어린이제품KC유형
        { wch: 20 }, // 어린이제품KC인증번호
        { wch: 20 }, // 어린이제품KC성적서
        { wch: 15 }, // 전기용품KC유형
        { wch: 20 }, // 전기용품KC인증번호
        { wch: 20 }, // 전기용품KC성적서
        { wch: 15 }, // 생활용품KC유형
        { wch: 20 }, // 생활용품KC인증번호
        { wch: 20 }, // 생활용품KC성적서
        { wch: 15 }, // 방송통신KC유형
        { wch: 20 }, // 방송통신KC인증번호
        { wch: 20 }, // 방송통신KC성적서
        { wch: 10 }, // 여성기업
        { wch: 10 }, // 장애인기업
        { wch: 10 }, // 창업기업
        { wch: 15 }, // 장애인표준사업장
        { wch: 15 }, // 중증장애인생산품
        { wch: 15 }, // 사회적협동조합
        { wch: 10 }, // 사회적기업
        { wch: 15 }, // 우수재활용제품
        { wch: 15 }, // 환경표지제품
        { wch: 12 }, // 저탄소인증
        { wch: 12 }, // SW품질인증
        { wch: 12 }, // 신제품인증
        { wch: 12 }, // 신기술인증
        { wch: 15 }, // 녹색기술인증
        { wch: 10 }, // 성능인증
        { wch: 15 }, // 우수조달제품
        { wch: 10 }, // 마을기업
        { wch: 10 }, // 자활기업
        { wch: 12 }, // 협동조합
        { wch: 50 }, // 소싱URL
        { wch: 20 }, // 품목코드
        { wch: 60 }, // 추가정보
        { wch: 20 }, // 수집일시
      ]
      worksheet['!cols'] = columnWidths

      // 워크북에 워크시트 추가
      XLSX.utils.book_append_sheet(workbook, worksheet, '소싱데이터')

      // 파일 저장
      XLSX.writeFile(workbook, filePath)

      sendLogToRenderer(`소싱 데이터 엑셀 파일 생성 완료: ${fileName}`, 'info')

      return {
        success: true,
        filePath,
        fileName,
        recordCount: sourcingItems.length,
      }
    } catch (error) {
      console.error('Sourcing Excel download failed:', error)
      sendLogToRenderer(`소싱 데이터 엑셀 다운로드 실패: ${error.message}`, 'error')
      return { success: false, error: error.message || '소싱 데이터 엑셀 다운로드 중 오류가 발생했습니다.' }
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
