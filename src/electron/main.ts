import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import * as path from 'path'
import Store from 'electron-store'
import { S2BSourcing } from './s2b-sourcing'
import { S2BRegistration } from './s2b-registration'
import { S2BManagement } from './s2b-management'
import { S2BPricing } from './s2b-pricing'
import fs from 'fs/promises'
import * as fsSync from 'fs'
import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import { autoUpdater } from 'electron-updater'
import { ExcelRegistrationData, ConfigSet } from './types/excel'
import { envConfig, supabase } from './envConfig'

/**
 * 계정 정보 타입 정의
 */
interface AccountInfo {
  id: bigint | number // s2b_accounts.id는 BIGSERIAL (bigint)
  s2b_id: string
  plan_type: string | null // products.product_type 또는 metadata.plan_code
  plan_label: string | null // products.name
  status: string | null
  period_start: string | null
  period_end: string | null
  permissions: string[]
}

/**
 * 계정 정보 조회 함수 (s2b_accounts -> subscriptions -> products 조인)
 * @param accountId - 확인할 계정 ID (s2b_id)
 * @returns 계정 정보 객체 또는 null
 */
async function getAccountInfo(accountId: string): Promise<AccountInfo | null> {
  try {
    // 1. s2b_accounts 테이블에서 profile_id 조회
    const { data: accountData, error: accountError } = await supabase
      .from('s2b_accounts')
      .select('id, s2b_id, profile_id')
      .eq('s2b_id', accountId)
      .single()

    if (accountError) {
      console.error('계정 조회 실패:', accountError)
      // 계정이 없는 경우 null 반환 (에러로 처리하지 않음)
      if (accountError.code === 'PGRST116') {
        console.log('계정을 찾을 수 없음:', accountId)
        return null
      }
      throw new Error(`계정 조회 중 문제가 발생했습니다: ${accountError.message}`)
    }

    if (!accountData) {
      console.log('계정을 찾을 수 없음:', accountId)
      return null
    }

    // 2. subscriptions 테이블에서 profile_id로 조회
    let planType: string | null = null
    let planLabel: string | null = null
    let status: string | null = null
    let periodStart: string | null = null
    let periodEnd: string | null = null
    let permissions: string[] = []

    if (accountData.profile_id) {
      const { data: subscriptionData, error: subscriptionError } = await supabase
        .from('subscriptions')
        .select('plan_type, status, period_start, period_end')
        .eq('profile_id', accountData.profile_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (subscriptionError) {
        console.error('구독 정보 조회 실패:', subscriptionError)
        // 구독 정보가 없어도 계정 정보는 반환
      } else if (subscriptionData) {
        planType = subscriptionData.plan_type
        status = subscriptionData.status
        periodStart = subscriptionData.period_start
        periodEnd = subscriptionData.period_end

        // 3. products 테이블에서 plan_type으로 매칭하여 name과 metadata.permissions 조회
        if (planType) {
          // 먼저 product_type으로 매칭 시도
          let productData: any = null
          const { data: productByType, error: productByTypeError } = await supabase
            .from('products')
            .select('id, name, product_type, metadata')
            .eq('product_type', planType)
            .eq('active', true)
            .maybeSingle()

          if (!productByTypeError && productByType) {
            productData = productByType
          } else {
            // product_type으로 찾지 못하면 metadata.plan_code로 매칭 시도
            // Supabase에서는 JSONB 필드 검색을 위해 특별한 문법이 필요할 수 있음
            // 하지만 직접 쿼리로는 어려우므로, 모든 subscription 타입 제품을 가져와서 필터링
            const { data: allSubscriptionProducts, error: allProductsError } = await supabase
              .from('products')
              .select('id, name, product_type, metadata')
              .eq('product_type', 'subscription')
              .eq('active', true)

            if (!allProductsError && allSubscriptionProducts) {
              // metadata.plan_code가 planType과 일치하는 제품 찾기
              const matchedProduct = allSubscriptionProducts.find((product: any) => {
                if (product.metadata && typeof product.metadata === 'object') {
                  return product.metadata.plan_code === planType
                }
                return false
              })
              if (matchedProduct) {
                productData = matchedProduct
              }
            }
          }

          if (productData) {
            planLabel = productData.name || null

            // metadata에서 permissions 추출
            if (productData.metadata && typeof productData.metadata === 'object') {
              if (productData.metadata.permissions && Array.isArray(productData.metadata.permissions)) {
                permissions = productData.metadata.permissions
              }
            }
          }
        }
      }
    }

    const account: AccountInfo = {
      id: accountData.id,
      s2b_id: accountData.s2b_id,
      plan_type: planType,
      plan_label: planLabel,
      status,
      period_start: periodStart,
      period_end: periodEnd,
      permissions,
    }

    console.log(
      `계정 정보 조회 성공: ${accountId} (만료일: ${account.period_end || '없음'}, 플랜: ${account.plan_type || '없음'})`,
    )
    return account
  } catch (error: any) {
    console.error('계정 조회 실패:', error)
    throw new Error(`계정 조회 중 문제가 발생했습니다: ${error?.message || error}`)
  }
}

/**
 * 계정 유효성 확인 함수 (만료일 및 권한 체크 포함)
 * @param accountId - 확인할 계정 ID
 * @returns boolean - 계정이 유효한 경우 true, 그렇지 않은 경우 false
 */
async function checkAccountValidity(accountId: string): Promise<boolean> {
  try {
    const account = await getAccountInfo(accountId)
    if (!account) {
      return false
    }

    // 1. 만료일 체크: 현재 날짜가 start_date와 end_date 사이에 있는지 확인
    const today = dayjs()
    const startDate = account.period_start ? dayjs(account.period_start) : null
    const endDate = account.period_end ? dayjs(account.period_end) : null

    if (startDate && today.isBefore(startDate, 'day')) {
      console.log(`계정 사용 기간이 아직 시작되지 않음: ${accountId} (시작일: ${startDate.format('YYYY-MM-DD')})`)
      return false
    }

    if (endDate && today.isAfter(endDate, 'day')) {
      console.log(`계정 사용 기간이 만료됨: ${accountId} (만료일: ${endDate.format('YYYY-MM-DD')})`)
      return false
    }

    // 2. 권한 체크: permissions 배열에 필요한 권한이 있는지 확인
    // permissions가 배열이고 비어있지 않은 경우에만 유효한 계정으로 간주
    if (!account.permissions || !Array.isArray(account.permissions) || account.permissions.length === 0) {
      console.log(`계정에 권한이 없음: ${accountId}`)
      return false
    }

    console.log(`계정 확인 성공: ${accountId} (권한: ${account.permissions.join(', ')})`)
    return true
  } catch (error: any) {
    console.error('계정 유효성 확인 실패:', error)
    return false
  }
}

/**
 * 계정 권한 확인 함수
 * @param accountId - 확인할 계정 ID
 * @param requiredPermission - 필요한 권한 (예: "상품등록", "판매관리일연장")
 * @returns boolean - 권한이 있는 경우 true, 그렇지 않은 경우 false
 */
async function checkAccountPermission(accountId: string, requiredPermission: string): Promise<boolean> {
  try {
    const account = await getAccountInfo(accountId)

    if (!account) {
      return false
    }

    // permissions 배열에 필요한 권한이 있는지 확인
    const hasPermission =
      account.permissions && Array.isArray(account.permissions) && account.permissions.includes(requiredPermission)

    if (!hasPermission) {
      console.log(`계정에 "${requiredPermission}" 권한이 없음: ${accountId}`)
      return false
    }

    return true
  } catch (error: any) {
    console.error('권한 확인 실패:', error)
    return false
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

const saveExcelResult = async (allProducts: ExcelRegistrationData[]) => {
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
    useAIForSourcing?: boolean
  }
  configSets: any[]
  activeConfigSetId: string | null
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
      useAIForSourcing: false,
    },
    configSets: [],
    activeConfigSetId: null,
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
  let sourcing: S2BSourcing | null = null
  let registration: S2BRegistration | null = null
  let management: S2BManagement | null = null

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

  // Excel 데이터 로드 및 registration 초기화
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
      const registration = new S2BRegistration(resolvedFileDir, sendLogToRenderer, settings.headless)
      const data = await registration.readExcelFile(resolvedExcelPath)
      return data
    } catch (error) {
      console.error('Error loading Excel data:', error)
      sendLogToRenderer(`엑셀 로드 실패: ${error.message || '알 수 없는 오류'}`, 'error')
      throw error
    }
  })

  ipcMain.handle(
    'start-and-register-products',
    async (_, { allProducts }: { allProducts: ExcelRegistrationData[] }) => {
      isCancelled = false // ✅ 시작 시 중단 상태 초기화

      try {
        sendLogToRenderer('자동화 시작', 'info')

        const settings = store.get('settings')
        registration = new S2BRegistration(settings.fileDir, sendLogToRenderer, settings.headless)

        await registration.launch()

        await registration.login(settings.loginId, settings.loginPw)
        sendLogToRenderer(`로그인 성공 (ID: ${settings.loginId})`, 'info')

        registration.setImageOptimize(settings.imageOptimize)
        sendLogToRenderer(`이미지 최적화 설정: ${settings.imageOptimize}`, 'info')

        // ✅ 계정 유효성 및 권한 검사
        const hasPermission = await checkAccountPermission(settings.loginId, '상품등록')
        if (!hasPermission) {
          throw new Error('"상품등록" 권한이 없습니다. 상품 등록이 불가능합니다.')
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

            await registration.registerProduct(sanitizedProduct)
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
        await registration?.close()
      }
    },
  )

  // 소싱: 사이트 열기 (브라우저 시작 및 벤더 기본 URL 이동)
  ipcMain.handle('sourcing-open-site', async (_, { vendor }: { vendor: string }) => {
    try {
      const settings = store.get('settings')

      // ✅ 계정 권한 검사
      const hasPermission = await checkAccountPermission(settings.loginId, '소싱')
      if (!hasPermission) {
        throw new Error('"소싱" 권한이 없습니다. 소싱 기능을 사용할 수 없습니다.')
      }

      const configSets = (store.get('configSets') || []) as ConfigSet[]
      const activeConfigSetId = store.get('activeConfigSetId')
      const activeConfigSet = configSets.find(cs => cs.id === activeConfigSetId) || configSets.find(cs => cs.isActive)

      // 공통 S2BSourcing 사용 (도매꾹/도매의신/쿠팡)
      if (!sourcing) {
        sourcing = new S2BSourcing(settings.fileDir, sendLogToRenderer, settings.headless, settings, activeConfigSet)
      }

      // 항상 최신 active 설정값 세트를 반영
      sourcing.setConfigSet(activeConfigSet)

      await sourcing.launch()

      const baseUrlMap: Record<string, string> = {
        domeggook: 'https://www.domeggook.com/',
        domeosin: 'https://www.domesin.com/',
        coupang: 'https://www.coupang.com/',
        s2b: 'https://www.s2b.kr/S2BNCustomer/S2B/scrweb/remu/rema/searchengine/s2bCustomerSearch.jsp',
      }

      const baseUrl = baseUrlMap[vendor]
      if (!baseUrl) {
        throw new Error(`지원하지 않는 벤더입니다: ${vendor}`)
      }

      await sourcing.openUrl(baseUrl)
      return { success: true, url: sourcing.getCurrentUrl() }
    } catch (error) {
      console.error('Error opening sourcing site:', error)
      sendLogToRenderer(`사이트 열기 실패: ${error.message || '알 수 없는 오류'}`, 'error')
      return { success: false, error: error.message || '사이트 열기 실패' }
    }
  })

  // 소싱: 현재 페이지에서 목록 수집 (이미 열린 브라우저 기준)
  ipcMain.handle('sourcing-collect-list-current', async () => {
    try {
      const settings = store.get('settings')

      // ✅ 계정 권한 검사
      const hasPermission = await checkAccountPermission(settings.loginId, '소싱')
      if (!hasPermission) {
        throw new Error('"소싱" 권한이 없습니다. 소싱 기능을 사용할 수 없습니다.')
      }

      if (!sourcing) throw new Error('브라우저가 열려있지 않습니다. 먼저 사이트를 여세요.')

      const currentUrl = sourcing.getCurrentUrl()
      if (!currentUrl) throw new Error('현재 URL을 확인할 수 없습니다.')
      // 이미 해당 페이지를 보고 있으므로, 다시 goto 호출로 페이지를 새로 여는 것은 생략한다.
      const list = await sourcing.collectListFromUrl(currentUrl, { skipGoto: true })
      return { success: true, items: list }
    } catch (error) {
      console.error('Error collecting list from current page:', error)
      sendLogToRenderer(`현재 페이지 목록 수집 실패: ${error.message || '알 수 없는 오류'}`, 'error')
      return { success: false, error: error.message || '현재 페이지 목록 수집 실패' }
    }
  })

  // 소싱(학교장터): 키워드 + 금액 범위 + 최대 갯수로 자동 페이지네이션하며 목록 수집
  ipcMain.handle(
    'sourcing-s2b-filter-search',
    async (
      _,
      {
        keyword,
        minPrice,
        maxPrice,
        maxCount,
        sortCode,
        viewCount,
        pageDelayMs,
      }: {
        keyword: string
        minPrice?: number
        maxPrice?: number
        maxCount?: number
        sortCode?: 'RANK' | 'PCAC' | 'CERT' | 'TRUST' | 'DATE' | 'PCDC' | 'REVIEW_COUNT'
        viewCount?: 10 | 20 | 30 | 40 | 50
        pageDelayMs?: number
      },
    ) => {
      try {
        const settings = store.get('settings')

        // ✅ 계정 권한 검사
        const hasPermission = await checkAccountPermission(settings.loginId, '소싱')
        if (!hasPermission) {
          throw new Error('"소싱" 권한이 없습니다. 소싱 기능을 사용할 수 없습니다.')
        }

        const configSets = (store.get('configSets') || []) as ConfigSet[]
        const activeConfigSetId = store.get('activeConfigSetId')
        const activeConfigSet = configSets.find(cs => cs.id === activeConfigSetId) || configSets.find(cs => cs.isActive)

        if (!sourcing) {
          sourcing = new S2BSourcing(settings.fileDir, sendLogToRenderer, settings.headless, settings, activeConfigSet)
        }
        sourcing.setConfigSet(activeConfigSet)
        await sourcing.launch()

        // 학교장터 검색 페이지로 이동(필요 시)
        const s2bSearchUrl = 'https://www.s2b.kr/S2BNCustomer/S2B/scrweb/remu/rema/searchengine/s2bCustomerSearch.jsp'
        if (!sourcing.getCurrentUrl().includes('/S2B/scrweb/remu/rema/searchengine/s2bCustomerSearch.jsp')) {
          await sourcing.openUrl(s2bSearchUrl)
        }

        const items = await sourcing.collectS2BFilteredList({
          keyword,
          minPrice,
          maxPrice,
          maxCount,
          sortCode,
          viewCount,
          pageDelayMs,
        })
        return { success: true, items }
      } catch (error: any) {
        console.error('Error s2b filter search:', error)
        sendLogToRenderer(`학교장터 필터검색 실패: ${error?.message || '알 수 없는 오류'}`, 'error')
        return { success: false, error: error?.message || '학교장터 필터검색 실패' }
      }
    },
  )

  // 현재 브라우저 탭에서 보이는 목록 수집 (특정 URL 전달)
  ipcMain.handle('sourcing-collect-list', async (_, { url }: { url: string }) => {
    try {
      const settings = store.get('settings')

      // ✅ 계정 권한 검사
      const hasPermission = await checkAccountPermission(settings.loginId, '소싱')
      if (!hasPermission) {
        throw new Error('"소싱" 권한이 없습니다. 소싱 기능을 사용할 수 없습니다.')
      }

      const configSets = (store.get('configSets') || []) as ConfigSet[]
      const activeConfigSetId = store.get('activeConfigSetId')
      const activeConfigSet = configSets.find(cs => cs.id === activeConfigSetId) || configSets.find(cs => cs.isActive)

      // 기존 sourcing 인스턴스가 없으면 새로 생성
      if (!sourcing) {
        sourcing = new S2BSourcing(settings.fileDir, sendLogToRenderer, settings.headless, settings, activeConfigSet)
      }

      // 항상 최신 active 설정값 세트를 반영
      sourcing.setConfigSet(activeConfigSet)

      await sourcing.launch()
      // 특정 URL 기반 목록 수집은 별도의 브라우저 세션에서 해당 URL로 이동한 후 수집한다.
      const list = await sourcing.collectListFromUrl(url)
      await sourcing.close()
      return { success: true, items: list }
    } catch (error) {
      console.error('Error collecting list:', error)
      sendLogToRenderer(`목록 수집 실패: ${error.message || '알 수 없는 오류'}`, 'error')
      return { success: false, error: error.message || '목록 수집 실패' }
    }
  })

  // 선택된 항목에 대해 상세정보 수집
  // 단일 상품 상세 수집 핸들러
  ipcMain.handle(
    'sourcing-collect-single-detail',
    async (
      _,
      {
        url,
        product,
        optionHandling,
        delayConfig,
        useAI,
      }: {
        url: string
        product?: { url: string; name?: string; price?: number; listThumbnail?: string; vendor?: string }
        optionHandling?: 'split' | 'single'
        delayConfig?: { minDelaySec?: number; maxDelaySec?: number }
        useAI?: boolean
      },
    ) => {
      try {
        const settings = store.get('settings')

        // ✅ 계정 권한 검사
        const hasPermission = await checkAccountPermission(settings.loginId, '소싱')
        if (!hasPermission) {
          throw new Error('"소싱" 권한이 없습니다. 소싱 기능을 사용할 수 없습니다.')
        }

        const configSets = (store.get('configSets') || []) as ConfigSet[]
        const activeConfigSetId = store.get('activeConfigSetId')
        const activeConfigSet = configSets.find(cs => cs.id === activeConfigSetId) || configSets.find(cs => cs.isActive)
        // 모든 벤더(도매꾹/도매의신/쿠팡)를 공통 S2BSourcing 로직으로 처리
        if (!sourcing) {
          sourcing = new S2BSourcing(settings.fileDir, sendLogToRenderer, settings.headless, settings, activeConfigSet)
        }

        // 항상 최신 active 설정값 세트를 반영
        sourcing.setConfigSet(activeConfigSet)

        // 브라우저/페이지가 닫혀 있거나 초기화되지 않은 경우를 포함해
        // 항상 launch 를 호출하여 사용 가능한 상태를 보장한다.
        await sourcing.launch()

        const target = product && product.url ? product : { url }
        // useAI가 명시되지 않으면 설정값 사용, 설정값도 없으면 false (기본값)
        const effectiveUseAI = useAI !== undefined ? useAI : (settings.useAIForSourcing ?? false)
        const details = await sourcing.collectNormalizedDetailForProducts([target], optionHandling, effectiveUseAI)
        if (details.length === 0) {
          throw new Error('상품 정보를 가져올 수 없습니다.')
        }

        return { success: true, item: details[0] }
      } catch (error: any) {
        console.error('Error collecting single detail:', error)
        sendLogToRenderer(`상세 수집 실패: ${error?.message || '알 수 없는 오류'}`, 'error')
        return { success: false, error: error?.message || '상세 수집 실패' }
      }
    },
  )

  // 단일 URL 처리 핸들러 (기존 sourcing-collect-details를 단일 URL 처리로 변경)
  ipcMain.handle(
    'sourcing-collect-details',
    async (
      _,
      {
        url,
        optionHandling,
        useAI,
      }: {
        url?: string
        optionHandling?: 'split' | 'single'
        useAI?: boolean
      },
    ) => {
      try {
        const settings = store.get('settings')

        // ✅ 계정 권한 검사
        const hasPermission = await checkAccountPermission(settings.loginId, '소싱')
        if (!hasPermission) {
          throw new Error('"소싱" 권한이 없습니다. 소싱 기능을 사용할 수 없습니다.')
        }

        const configSets = (store.get('configSets') || []) as ConfigSet[]
        const activeConfigSetId = store.get('activeConfigSetId')
        const activeConfigSet = configSets.find(cs => cs.id === activeConfigSetId) || configSets.find(cs => cs.isActive)

        if (!sourcing) {
          sourcing = new S2BSourcing(settings.fileDir, sendLogToRenderer, settings.headless, settings, activeConfigSet)
        }

        // 항상 최신 active 설정값 세트를 반영
        sourcing.setConfigSet(activeConfigSet)

        await sourcing.launch()
        if (!url) {
          throw new Error('URL이 필요합니다.')
        }
        // useAI가 명시되지 않으면 설정값 사용, 설정값도 없으면 false (기본값)
        const effectiveUseAI = useAI !== undefined ? useAI : (settings.useAIForSourcing ?? false)
        const details = await sourcing.collectNormalizedDetailForUrls([url], optionHandling, effectiveUseAI)
        await sourcing.close()

        return { success: true, items: details }
      } catch (error: any) {
        console.error('Error collecting details:', error)
        sendLogToRenderer(`상세 수집 실패: ${error?.message || '알 수 없는 오류'}`, 'error')
        return { success: false, error: error?.message || '상세 수집 실패' }
      }
    },
  )

  ipcMain.handle('check-account-validity', async (_, { accountId }) => {
    // 로그인 없이 s2b_accounts 테이블에서 직접 계정 정보 조회
    const account = await getAccountInfo(accountId)
    if (!account) {
      return { valid: false, accountInfo: null }
    }

    // 만료일 체크
    const today = dayjs()
    const startDate = account.period_start ? dayjs(account.period_start) : null
    const endDate = account.period_end ? dayjs(account.period_end) : null

    let isValid = true
    if (startDate && today.isBefore(startDate, 'day')) {
      isValid = false
    }
    if (endDate && today.isAfter(endDate, 'day')) {
      isValid = false
    }
    if (!account.permissions || !Array.isArray(account.permissions) || account.permissions.length === 0) {
      isValid = false
    }

    return {
      valid: isValid,
      accountInfo: {
        periodEnd: account.period_end,
        planType: account.plan_label || account.plan_type, // label 우선, 없으면 code
        periodStart: account.period_start,
        status: account.status,
      },
    }
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
      const prev = store.get('settings') || {}
      const merged = { ...prev, ...settings }
      store.set('settings', merged)
      return true
    } catch (error) {
      console.error('Error saving settings:', error)
      throw error
    }
  })

  // 설정값 세트 불러오기
  ipcMain.handle('get-config-sets', () => {
    try {
      const configSets = store.get('configSets') || []
      const activeConfigSetId = store.get('activeConfigSetId')
      return { configSets, activeConfigSetId }
    } catch (error) {
      console.error('Error loading config sets:', error)
      throw error
    }
  })

  // 설정값 세트 저장하기
  ipcMain.handle('save-config-sets', async (_, { configSets, activeConfigSetId }) => {
    try {
      store.set('configSets', configSets)
      store.set('activeConfigSetId', activeConfigSetId)
      return true
    } catch (error) {
      console.error('Error saving config sets:', error)
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

  ipcMain.handle('extend-management-date', async (_, { startDate, endDate, registrationStatus, searchQuery }) => {
    try {
      const settings = store.get('settings')

      // ✅ 계정 권한 검사
      const hasPermission = await checkAccountPermission(settings.loginId, '판매관리일연장')
      if (!hasPermission) {
        throw new Error('"판매관리일연장" 권한이 없습니다. 판매 관리일 수정이 불가능합니다.')
      }

      management = new S2BManagement(settings.fileDir, sendLogToRenderer, settings.headless, settings)

      await management.launch()

      await management.login(settings.loginId, settings.loginPw)
      sendLogToRenderer(`로그인 성공 (ID: ${settings.loginId})`, 'info')

      await management.extendManagementDateForRange(startDate, endDate, registrationStatus, searchQuery)

      return { success: true, message: `상품 관리일이 ${startDate} ~ ${endDate}로 설정되었습니다.` }
    } catch (error) {
      sendLogToRenderer(`에러 발생: ${error.message}`, 'error')
      return { success: false, error: error.message || 'Unknown error occurred.' }
    } finally {
      await management?.close()
    }
  })

  ipcMain.handle('update-pricing', async (_, { registrationStatus, searchQuery, priceChangePercent }) => {
    let pricing: S2BPricing | null = null
    try {
      const settings = store.get('settings')

      // ✅ 계정 권한 검사
      const hasPermission = await checkAccountPermission(settings.loginId, '판매관리일연장')
      if (!hasPermission) {
        throw new Error('"판매관리일연장" 권한이 없습니다. 상품 가격 수정이 불가능합니다.')
      }

      pricing = new S2BPricing(settings.fileDir, sendLogToRenderer, settings.headless, settings)

      await pricing.launch()

      await pricing.login(settings.loginId, settings.loginPw)
      sendLogToRenderer(`로그인 성공 (ID: ${settings.loginId})`, 'info')

      await pricing.updatePricingForRange(registrationStatus, searchQuery, priceChangePercent)

      return { success: true, message: '상품 가격이 성공적으로 변경되었습니다.' }
    } catch (error) {
      sendLogToRenderer(`에러 발생: ${error.message}`, 'error')
      return { success: false, error: error.message || 'Unknown error occurred.' }
    } finally {
      await pricing?.close()
    }
  })

  // 설정값 세트 엑셀 다운로드 핸들러
  ipcMain.handle('download-config-set-excel', async (_, configSet: ConfigSet) => {
    try {
      const XlsxPopulate = require('xlsx-populate') as any
      const workbook = await XlsxPopulate.fromBlankAsync()
      const worksheet = workbook.sheet(0)

      // 설정값 세트 데이터를 엑셀 형식으로 변환
      const configData = {
        설정값세트명: configSet.name,
        '납품가능기간(일)': configSet.config.deliveryPeriod,
        '견적서유효기간(일)': configSet.config.quoteValidityPeriod,
        배송비종류:
          configSet.config.shippingFeeType === 'free'
            ? '무료'
            : configSet.config.shippingFeeType === 'fixed'
              ? '유료'
              : '조건부무료',
        '배송비(원)': configSet.config.shippingFee,
        '반품배송비(원)': configSet.config.returnShippingFee,
        묶음배송여부: configSet.config.bundleShipping ? '가능' : '불가능',
        제주배송여부: configSet.config.jejuShipping ? '가능' : '불가능',
        '제주추가배송비(원)': configSet.config.jejuAdditionalFee,
        상세설명HTML: configSet.config.detailHtmlTemplate,
        '마진율(%)': configSet.config.marginRate,
        옵션처리방법: configSet.config.optionHandling === 'single' ? '옵션 묶어서 1개 상품' : '옵션별로 여러 개 상품',
      }

      // 헤더 행 추가
      const headers = Object.keys(configData)
      headers.forEach((header, colIndex) => {
        const cell = worksheet.cell(1, colIndex + 1)
        cell.value(header)
      })

      // 데이터 행 추가
      headers.forEach((header, colIndex) => {
        const cell = worksheet.cell(2, colIndex + 1)
        cell.value(configData[header])
      })

      // 엑셀 파일명 생성
      const timestamp = dayjs().format('YYYYMMDD_HHmmss')
      const defaultFileName = `설정값세트_${configSet.name}_${timestamp}.xlsx`

      // saveAs 다이얼로그 표시
      const result = await dialog.showSaveDialog(mainWindow, {
        title: '설정값 세트 엑셀 파일 저장',
        defaultPath: defaultFileName,
        filters: [
          { name: 'Excel Files', extensions: ['xlsx'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      })

      if (result.canceled) {
        return { success: false, error: '사용자가 저장을 취소했습니다.' }
      }

      const filePath = result.filePath
      if (!filePath) {
        throw new Error('파일 경로가 선택되지 않았습니다.')
      }

      // 파일 저장
      await workbook.toFileAsync(filePath)

      const fileName = path.basename(filePath)
      sendLogToRenderer(`설정값 세트 엑셀 파일 생성 완료: ${fileName}`, 'info')

      return {
        success: true,
        filePath,
        fileName,
      }
    } catch (error) {
      console.error('Config set Excel download failed:', error)
      sendLogToRenderer(`설정값 세트 엑셀 다운로드 실패: ${error.message}`, 'error')
      return { success: false, error: error.message || '설정값 세트 엑셀 다운로드 중 오류가 발생했습니다.' }
    }
  })

  // 설정값 세트 엑셀 업로드 핸들러
  ipcMain.handle('upload-config-set-excel', async (_, arrayBuffer) => {
    try {
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]

      // JSON으로 변환
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      if (jsonData.length < 2) {
        throw new Error('엑셀 파일에 데이터가 충분하지 않습니다.')
      }

      const headers = jsonData[0] as string[]
      const dataRow = jsonData[1] as any[]

      // 헤더 매핑
      const headerMap: { [key: string]: string } = {
        설정값세트명: 'name',
        '납품가능기간(일)': 'deliveryPeriod',
        '견적서유효기간(일)': 'quoteValidityPeriod',
        배송비종류: 'shippingFeeType',
        '배송비(원)': 'shippingFee',
        '반품배송비(원)': 'returnShippingFee',
        묶음배송여부: 'bundleShipping',
        제주배송여부: 'jejuShipping',
        '제주추가배송비(원)': 'jejuAdditionalFee',
        상세설명HTML: 'detailHtmlTemplate',
        '마진율(%)': 'marginRate',
        옵션처리방법: 'optionHandling',
      }

      const configData: any = {}
      headers.forEach((header, index) => {
        const mappedKey = headerMap[header]
        if (mappedKey && dataRow[index] !== undefined) {
          let value = dataRow[index]

          // 특정 필드 타입 변환
          if (
            mappedKey === 'deliveryPeriod' ||
            mappedKey === 'quoteValidityPeriod' ||
            mappedKey === 'shippingFee' ||
            mappedKey === 'returnShippingFee' ||
            mappedKey === 'jejuAdditionalFee' ||
            mappedKey === 'marginRate'
          ) {
            value = Number(value) || 0
          } else if (mappedKey === 'bundleShipping' || mappedKey === 'jejuShipping') {
            value = value === '가능' || value === true || value === 'true'
          } else if (mappedKey === 'shippingFeeType') {
            if (value === '무료') value = 'free'
            else if (value === '유료') value = 'fixed'
            else if (value === '조건부무료') value = 'conditional'
          } else if (mappedKey === 'optionHandling') {
            if (typeof value === 'string') {
              const text = value.trim()
              if (text.includes('묶어서') || text.includes('1개')) {
                value = 'single'
              } else {
                value = 'split'
              }
            } else {
              value = 'split'
            }
          }

          configData[mappedKey] = value
        }
      })

      // 필수 필드 검증
      if (!configData.name) {
        throw new Error('설정값세트명이 필요합니다.')
      }

      // 새로운 설정값 세트 생성
      // 기존 기본설정 가져오기
      const existingSettings = store.get('settings')

      const newConfigSet = {
        id: `config_${Date.now()}`,
        name: configData.name,
        isDefault: false,
        isActive: false,
        config: {
          deliveryPeriod: configData.deliveryPeriod || 'ZD000001', // 3일
          quoteValidityPeriod: configData.quoteValidityPeriod || 'ZD000001', // 7일
          shippingFeeType: configData.shippingFeeType || 'fixed', // 고정배송비
          shippingFee: configData.shippingFee || 3000,
          returnShippingFee: configData.returnShippingFee || 3000,
          bundleShipping: configData.bundleShipping !== undefined ? configData.bundleShipping : true, // 묶음배송여부 true
          jejuShipping: configData.jejuShipping !== undefined ? configData.jejuShipping : true, // 제주배송여부 true
          jejuAdditionalFee: configData.jejuAdditionalFee || 5000,
          detailHtmlTemplate:
            configData.detailHtmlTemplate || existingSettings.detailHtmlTemplate || '<p>상세설명을 입력하세요.</p>',
          marginRate: configData.marginRate || existingSettings.marginRate || 20, // 마진율
          optionHandling: (configData.optionHandling as 'split' | 'single') || 'split',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      sendLogToRenderer(`설정값 세트 업로드 완료: ${newConfigSet.name}`, 'info')

      return {
        success: true,
        configSets: [newConfigSet], // 새로 생성된 설정값 세트 반환
      }
    } catch (error) {
      console.error('Config set Excel upload failed:', error)
      sendLogToRenderer(`설정값 세트 업로드 실패: ${error.message}`, 'error')
      return { success: false, error: error.message || '설정값 세트 업로드 중 오류가 발생했습니다.' }
    }
  })

  // 소싱 데이터 엑셀 다운로드 핸들러
  ipcMain.handle(
    'download-sourcing-excel',
    async (_, { sourcingItems, configSet }: { sourcingItems: any[]; configSet?: ConfigSet }) => {
      try {
        const settings = store.get('settings')

        // ✅ 계정 권한 검사
        const hasPermission = await checkAccountPermission(settings.loginId, '소싱')
        if (!hasPermission) {
          throw new Error('"소싱" 권한이 없습니다. 소싱 기능을 사용할 수 없습니다.')
        }

        // excelMapped 데이터를 평면화하여 사용
        const excelData: ExcelRegistrationData[] = []
        sourcingItems.forEach((item: any) => {
          if (item.excelMapped && Array.isArray(item.excelMapped)) {
            // excelMapped 배열의 각 항목을 개별 행으로 추가
            item.excelMapped.forEach((mappedItem: ExcelRegistrationData) => {
              excelData.push(mappedItem)
            })
          }
        })

        if (excelData.length === 0) {
          throw new Error('다운로드할 데이터가 없습니다.')
        }

        // xlsx-populate 사용하여 워크북 생성
        const XlsxPopulate = require('xlsx-populate') as any
        const workbook = await XlsxPopulate.fromBlankAsync()
        const worksheet = workbook.sheet(0)

        // 헤더와 데이터 설정
        const headers = Object.keys(excelData[0] || {})

        // 참고용 헤더들 정의
        const referenceHeaders = ['구매처', '구매처URL', 'KC문제', '이미지사용여부', '최소구매수량', '원가']

        // 헤더 행 추가
        headers.forEach((header, colIndex) => {
          const cell = worksheet.cell(1, colIndex + 1)
          cell.value(header)
        })

        // 데이터 행 추가 및 설정값 세트 적용
        excelData.forEach((rowData, rowIndex) => {
          headers.forEach((header, colIndex) => {
            const cell = worksheet.cell(rowIndex + 2, colIndex + 1)
            let value = (rowData as any)[header] || ''

            // 설정값 세트가 있으면 해당 값으로 덮어쓰기
            if (configSet) {
              switch (header) {
                case '납품가능기간':
                  const deliveryOption = {
                    ZD000001: '3일',
                    ZD000002: '5일',
                    ZD000003: '7일',
                    ZD000004: '15일',
                    ZD000005: '30일',
                    ZD000006: '45일',
                  }
                  value = deliveryOption[configSet.config.deliveryPeriod]
                  break
                case '견적서 유효기간':
                  const quoteOption = {
                    ZD000001: '7일',
                    ZD000002: '10일',
                    ZD000003: '15일',
                    ZD000004: '30일',
                  }
                  value = quoteOption[configSet.config.quoteValidityPeriod]
                  break
                case '배송비종류':
                  const shippingTypeMap = {
                    free: '무료',
                    fixed: '유료',
                    conditional: '조건부무료',
                  }
                  value = shippingTypeMap[configSet.config.shippingFeeType]
                  break
                case '배송비':
                  value = configSet.config.shippingFee
                  break
                case '반품배송비':
                  value = configSet.config.returnShippingFee
                  break
                case '묶음배송여부':
                  value = configSet.config.bundleShipping ? 'Y' : 'N'
                  break
                case '제주배송여부':
                  value = configSet.config.jejuShipping ? 'Y' : 'N'
                  break
                case '제주추가배송비':
                  value = configSet.config.jejuAdditionalFee
                  break
                case '상세설명HTML':
                  value = configSet.config.detailHtmlTemplate
                  break
              }
            }

            cell.value(value)
          })
        })

        // 참고용 헤더 열들에 전체 열 회색 배경색 적용
        headers.forEach((header, colIndex) => {
          if (referenceHeaders.includes(header)) {
            const columnLetter = String.fromCharCode(65 + colIndex) // A, B, C, ...
            const totalRows = excelData.length + 1 // 헤더 + 데이터 행

            // 열 전체에 스타일 적용 (예: A1:A10)
            const range = worksheet.range(`${columnLetter}1:${columnLetter}${totalRows}`)
            range.style({
              fill: {
                type: 'solid',
                color: 'D3D3D3', // 연한 회색
              },
            })
          }
        })

        // 엑셀 파일명 생성
        const timestamp = dayjs().format('YYYYMMDD_HHmmss')
        const defaultFileName = `소싱데이터_${timestamp}.xlsx`

        // saveAs 다이얼로그 표시
        const result = await dialog.showSaveDialog(mainWindow, {
          title: '소싱 데이터 엑셀 파일 저장',
          defaultPath: defaultFileName,
          filters: [
            { name: 'Excel Files', extensions: ['xlsx'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        })

        if (result.canceled) {
          return { success: false, error: '사용자가 저장을 취소했습니다.' }
        }

        const filePath = result.filePath
        if (!filePath) {
          throw new Error('파일 경로가 선택되지 않았습니다.')
        }

        // 파일 저장
        await workbook.toFileAsync(filePath)

        const fileName = path.basename(filePath)
        sendLogToRenderer(`소싱 데이터 엑셀 파일 생성 완료: ${fileName}`, 'info')

        return {
          success: true,
          filePath,
          fileName,
          recordCount: excelData.length, // 실제 엑셀에 저장된 행 수
        }
      } catch (error) {
        console.error('Sourcing Excel download failed:', error)
        sendLogToRenderer(`소싱 데이터 엑셀 다운로드 실패: ${error.message}`, 'error')
        return { success: false, error: error.message || '소싱 데이터 엑셀 다운로드 중 오류가 발생했습니다.' }
      }
    },
  )
}

async function clearTempFiles(): Promise<void> {
  const tempDir = envConfig.tempDir

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
  // temp 디렉토리 정리
  clearTempFiles().catch(error => console.error(error))

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
