import { app, BrowserWindow, dialog, ipcMain, shell, protocol } from 'electron'
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
import { productToExcelData, sourcingItemToProduct } from './types/product'
import { productToMappedExcelRow, parseExcelRowToProduct } from './utils/excelMapper'
import type { Product, SourcingItemPayload } from './types/product'
import { envConfig, supabase } from './envConfig'
import axios from 'axios'

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

async function getCreditsBalanceByS2bId(s2bId: string): Promise<number | null> {
  if (!s2bId) return null

  const { data: accountData, error: accountError } = await supabase
    .from('s2b_accounts')
    .select('profile_id')
    .eq('s2b_id', s2bId)
    .single()

  if (accountError) {
    if (accountError.code === 'PGRST116') {
      return null
    }
    throw new Error(`계정 조회 실패: ${accountError.message}`)
  }

  if (!accountData?.profile_id) return null

  const { data: transactions, error: txError } = await supabase
    .from('credit_transactions')
    .select('type, amount')
    .eq('profile_id', accountData.profile_id)

  if (txError) {
    throw new Error(`크레딧 거래 조회 실패: ${txError.message}`)
  }

  if (!transactions || transactions.length === 0) return 0

  const debitTypes = new Set(['usage', 'use', 'consume', 'debit', 'spend'])
  let balance = 0
  for (const tx of transactions) {
    const amount = Number(tx.amount) || 0
    const type = (tx.type || '').toString().toLowerCase()
    if (debitTypes.has(type)) {
      balance -= amount
    } else {
      balance += amount
    }
  }

  return balance
}

/**
 * 문자열 정리 함수
 * @param value - 정리할 값
 * @returns 정리된 문자열 또는 원래 값
 */
function sanitizeString(value: any): string {
  if (value === null || value === undefined) {
    return ''
  }
  return String(value)
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // 제어 문자 제거 (\b 등)
    .replace(/\u00A0/g, ' ')
    .trim()
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

interface StoreSchema {
  settings: {
    fileDir: string
    excelPath: string
    loginId: string
    loginPw: string
    accounts?: S2BLoginAccount[]
    activeAccountId?: string
    registrationDelay: string
    registrationDelayMin: string
    registrationDelayMax: string
    imageOptimize: boolean
    headless: boolean
    marginRate: number
    detailHtmlTemplate: string
    useAIForSourcing?: boolean
    categoryExcelPath?: string
  }
  configSets: any[]
  activeConfigSetId: string | null
  products: Product[]
}

type DeliveryAreaPresetMode = 'nationwide' | 'custom'

interface S2BLoginAccount {
  id: string
  name?: string
  loginId: string
  loginPw: string
  lastRegisteredIp?: string
  deliveryAreaPresetMode?: DeliveryAreaPresetMode
  deliveryAreas?: string[]
}

const VALID_DELIVERY_AREAS = [
  '강원',
  '경기',
  '경남',
  '경북',
  '광주',
  '대구',
  '대전',
  '부산',
  '서울',
  '울산',
  '인천',
  '전남',
  '전북',
  '제주',
  '충남',
  '충북',
  '세종',
] as const

function normalizeAccountList(settings: Partial<StoreSchema['settings']> | undefined): S2BLoginAccount[] {
  const rawAccounts = Array.isArray(settings?.accounts) ? settings?.accounts : []

  const normalized = rawAccounts
    .map((account: any, index: number) => {
      const loginId = typeof account?.loginId === 'string' ? account.loginId.trim() : ''
      const loginPw = typeof account?.loginPw === 'string' ? account.loginPw : ''
      if (!loginId || !loginPw) return null

      const filteredAreas = Array.isArray(account?.deliveryAreas)
        ? account.deliveryAreas
            .map((area: any) => (typeof area === 'string' ? area.trim() : ''))
            .filter((area: string) => VALID_DELIVERY_AREAS.includes(area as (typeof VALID_DELIVERY_AREAS)[number]))
        : []

      const deliveryAreaPresetMode: DeliveryAreaPresetMode =
        account?.deliveryAreaPresetMode === 'custom' && filteredAreas.length > 0 ? 'custom' : 'nationwide'
      const lastRegisteredIp = typeof account?.lastRegisteredIp === 'string' ? account.lastRegisteredIp.trim() : ''

      return {
        id:
          typeof account?.id === 'string' && account.id.trim()
            ? account.id.trim()
            : `account-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        name: typeof account?.name === 'string' ? account.name.trim() : '',
        loginId,
        loginPw,
        lastRegisteredIp,
        deliveryAreaPresetMode,
        deliveryAreas: deliveryAreaPresetMode === 'custom' ? filteredAreas : [],
      } as S2BLoginAccount
    })
    .filter(Boolean) as S2BLoginAccount[]

  if (normalized.length > 0) return normalized

  const legacyLoginId = typeof settings?.loginId === 'string' ? settings.loginId.trim() : ''
  const legacyLoginPw = typeof settings?.loginPw === 'string' ? settings.loginPw : ''
  if (legacyLoginId && legacyLoginPw) {
    return [
      {
        id: 'legacy-default',
        name: '기본 계정',
        loginId: legacyLoginId,
        loginPw: legacyLoginPw,
        lastRegisteredIp: '',
        deliveryAreaPresetMode: 'nationwide',
        deliveryAreas: [],
      },
    ]
  }

  return []
}

function normalizeSettings(settings: Partial<StoreSchema['settings']> | undefined): StoreSchema['settings'] {
  const base = (store?.get?.('settings') || {}) as Partial<StoreSchema['settings']>
  const merged = { ...base, ...(settings || {}) }
  const accounts = normalizeAccountList(merged)
  const activeAccountIdCandidate = typeof merged.activeAccountId === 'string' ? merged.activeAccountId : ''
  const activeAccount = accounts.find(account => account.id === activeAccountIdCandidate) || accounts[0]

  return {
    ...(merged as any),
    fileDir: typeof merged.fileDir === 'string' ? merged.fileDir : '',
    excelPath: typeof merged.excelPath === 'string' ? merged.excelPath : '',
    loginId: activeAccount?.loginId || '',
    loginPw: activeAccount?.loginPw || '',
    accounts,
    activeAccountId: activeAccount?.id || '',
    registrationDelay: typeof merged.registrationDelay === 'string' ? merged.registrationDelay : '',
    registrationDelayMin: typeof merged.registrationDelayMin === 'string' ? merged.registrationDelayMin : '',
    registrationDelayMax: typeof merged.registrationDelayMax === 'string' ? merged.registrationDelayMax : '',
    imageOptimize: Boolean(merged.imageOptimize),
    headless: Boolean(merged.headless),
    marginRate: typeof merged.marginRate === 'number' ? merged.marginRate : 20,
    detailHtmlTemplate:
      typeof merged.detailHtmlTemplate === 'string' ? merged.detailHtmlTemplate : '<p>상세설명을 입력하세요.</p>',
    useAIForSourcing: Boolean(merged.useAIForSourcing),
    categoryExcelPath: typeof merged.categoryExcelPath === 'string' ? merged.categoryExcelPath : '',
  }
}

function getSelectedAccount(settings: StoreSchema['settings'], accountId?: string | null): S2BLoginAccount | null {
  const accounts = normalizeAccountList(settings)
  if (accounts.length === 0) return null
  if (accountId) {
    const matched = accounts.find(account => account.id === accountId)
    if (matched) return matched
  }
  return accounts.find(account => account.id === settings.activeAccountId) || accounts[0]
}

function applyAccountDeliveryPreset(data: ExcelRegistrationData, account: S2BLoginAccount): ExcelRegistrationData {
  if (account.deliveryAreaPresetMode === 'custom' && account.deliveryAreas && account.deliveryAreas.length > 0) {
    return { ...data, deliveryAreas: [...account.deliveryAreas] }
  }
  return { ...data, deliveryAreas: ['전국'] }
}

function isValidIpv4(value: string): boolean {
  const ipv4Pattern = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
  return ipv4Pattern.test(value.trim())
}

async function fetchCurrentPublicIp(): Promise<string> {
  const endpoints = [
    { url: 'https://api.ipify.org?format=json', parser: (data: any) => String(data?.ip || '').trim() },
    { url: 'https://ifconfig.me/ip', parser: (data: any) => String(data || '').trim() },
  ]

  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(endpoint.url, {
        timeout: 5000,
        responseType: endpoint.url.includes('ipify') ? 'json' : 'text',
      })
      const ip = endpoint.parser(response.data)
      if (isValidIpv4(ip)) return ip
    } catch (error) {
      console.warn(`공인 IP 조회 실패 (${endpoint.url}):`, (error as any)?.message || error)
    }
  }

  throw new Error('공인 IP를 확인하지 못했습니다. 네트워크 상태를 확인해주세요.')
}

// Store 인스턴스 생성
const store = new Store<StoreSchema>({
  defaults: {
    settings: {
      fileDir: '',
      excelPath: '',
      loginId: '',
      loginPw: '',
      accounts: [],
      activeAccountId: '',
      registrationDelay: '',
      registrationDelayMin: '',
      registrationDelayMax: '',
      imageOptimize: false,
      headless: false,
      marginRate: 20,
      detailHtmlTemplate: '<p>상세설명을 입력하세요.</p>',
      useAIForSourcing: false,
      categoryExcelPath: '',
    },
    configSets: [],
    activeConfigSetId: null,
    products: [],
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
      const rawData = await registration.readExcelFile(resolvedExcelPath)

      const products: Product[] = rawData.map(row => parseExcelRowToProduct(row))

      return products
    } catch (error) {
      console.error('Error loading Excel data:', error)
      sendLogToRenderer(`엑셀 로드 실패: ${error.message || '알 수 없는 오류'}`, 'error')
      throw error
    }
  })

  // ---- Product CRUD IPC handlers (서버에서 데이터 관리) ----

  ipcMain.handle('get-products', () => {
    return store.get('products') || []
  })

  ipcMain.handle('save-products', async (_, { products: newProducts }: { products: Product[] }) => {
    const existing = (store.get('products') || []) as Product[]
    const existingIds = new Set(existing.map(p => p.id))
    const toAdd = newProducts.filter(p => !existingIds.has(p.id))
    const updated = [...existing, ...toAdd]
    store.set('products', updated)
    return updated
  })

  ipcMain.handle('update-product', async (_, { product }: { product: Product }) => {
    const existing = (store.get('products') || []) as Product[]
    const updated = existing.map(p => (p.id === product.id ? product : p))
    store.set('products', updated)
    return updated
  })

  ipcMain.handle('delete-products', async (_, { ids }: { ids: string[] }) => {
    const existing = (store.get('products') || []) as Product[]
    const idSet = new Set(ids)
    const updated = existing.filter(p => !idSet.has(p.id))
    store.set('products', updated)
    return updated
  })

  ipcMain.handle('clear-products', async () => {
    store.set('products', [])
    return []
  })

  // ---- Excel Bulk Operations (Download & Modify) ----
  ipcMain.handle('download-register-excel', async () => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
        title: '상품 목록 엑셀 다운로드',
        defaultPath: '등록상품목록.xlsx',
        filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }],
      })

      if (canceled || !filePath) return { success: false, cancelled: true }

      const allStoredProducts = (store.get('products') || []) as Product[]
      const excelData = allStoredProducts.map(p => {
        return productToMappedExcelRow(p)
      })

      const worksheet = XLSX.utils.json_to_sheet(excelData)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, '상품목록')
      XLSX.writeFile(workbook, filePath)

      return { success: true, filePath }
    } catch (error) {
      console.error('Failed to download excel:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('download-sample-excel', async () => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
        title: '샘플 엑셀 다운로드',
        defaultPath: 'S2B_상품등록_샘플.xlsx',
        filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
      })

      if (canceled || !filePath) return { success: false, cancelled: true }

      const samplePath = app.isPackaged
        ? path.join(process.resourcesPath, 'files', 'sample_registration.xlsx')
        : path.join(__dirname, '../../files', 'sample_registration.xlsx')

      if (!fsSync.existsSync(samplePath)) {
        throw new Error('샘플 파일을 찾을 수 없습니다.')
      }

      fsSync.copyFileSync(samplePath, filePath)

      return { success: true, filePath }
    } catch (error) {
      console.error('Failed to download sample excel:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('modify-excel-data', async (_, { excelPath }: { excelPath: string }) => {
    try {
      const workbook = XLSX.readFile(excelPath)
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) throw new Error('시트를 찾을 수 없습니다')
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '', blankrows: false }) as any[]

      const existingProducts = (store.get('products') || []) as Product[]

      let modifyCount = 0

      const updatedProducts = existingProducts.map(p => {
        const row = jsonData.find(r => (r.productId || r.id || r.상품ID) === p.id)
        if (!row) return p

        modifyCount++

        return parseExcelRowToProduct(row, p)
      })

      store.set('products', updatedProducts)

      return { success: true, count: modifyCount, products: updatedProducts }
    } catch (error) {
      console.error('Error modifying excel:', error)
      throw error
    }
  })

  // ---- Sourcing → Product Conversion (서버에서 변환) ----

  ipcMain.handle('convert-sourcing-to-products', async (_, { items }: { items: SourcingItemPayload[] }) => {
    const products = items.filter(item => item.isCollected).map(item => sourcingItemToProduct(item))
    return products
  })

  // ---- Product Registration (기존 핸들러 수정) ----

  ipcMain.handle(
    'start-and-register-products',
    async (_, { productIds, accountId }: { productIds: string[]; accountId?: string }) => {
      const allStoredProducts = (store.get('products') || []) as Product[]
      const idSet = new Set(productIds)
      const allProducts: ExcelRegistrationData[] = allStoredProducts.map(p => {
        const excelData = productToExcelData(p)
        excelData.selected = idSet.has(p.id)
        return excelData
      })
      const selectedProducts = allProducts.filter(p => p.selected)
      isCancelled = false // ✅ 시작 시 중단 상태 초기화

      try {
        sendLogToRenderer('자동화 시작', 'info')

        const settings = normalizeSettings(store.get('settings'))
        const selectedAccount = getSelectedAccount(settings, accountId)
        if (!selectedAccount) {
          throw new Error('사용할 계정이 설정되지 않았습니다. 설정에서 계정을 추가해주세요.')
        }
        const currentPublicIp = await fetchCurrentPublicIp()
        sendLogToRenderer(`현재 공인 IP 확인: ${currentPublicIp}`, 'info')
        const expectedIp = String(selectedAccount.lastRegisteredIp || '').trim()
        if (expectedIp) {
          if (!isValidIpv4(expectedIp)) {
            throw new Error(`저장된 마지막 등록 IP 형식이 올바르지 않습니다: ${expectedIp}`)
          }
          if (currentPublicIp !== expectedIp) {
            const confirmResult = await dialog.showMessageBox(mainWindow || undefined, {
              type: 'warning',
              title: '사업자 IP 확인',
              message: '현재 컴퓨터 IP와 마지막 등록 IP가 다릅니다.',
              detail: `사업자: ${selectedAccount.name || selectedAccount.loginId}\n현재 IP: ${currentPublicIp}\n마지막 등록 IP: ${expectedIp}\n\n계속 진행하시겠습니까?`,
              buttons: ['취소', '계속 진행'],
              defaultId: 0,
              cancelId: 0,
              noLink: true,
            })

            if (confirmResult.response !== 1) {
              throw new Error(
                `사업자 IP 사전 체크 취소: 현재 IP(${currentPublicIp})와 마지막 등록 IP(${expectedIp})가 다릅니다.`,
              )
            }

            sendLogToRenderer(
              `사업자 IP 불일치 확인 후 계속 진행 (현재: ${currentPublicIp}, 마지막: ${expectedIp})`,
              'warning',
            )
          }
          sendLogToRenderer(
            `사업자 IP 사전 체크 통과 (사업자: ${selectedAccount.name || selectedAccount.loginId})`,
            'info',
          )
        } else {
          sendLogToRenderer(
            `사업자 IP 사전 체크 스킵 (사업자: ${selectedAccount.name || selectedAccount.loginId}, 마지막 등록 IP 없음)`,
            'warning',
          )
        }

        registration = new S2BRegistration(settings.fileDir, sendLogToRenderer, settings.headless)

        await registration.launch()

        await registration.login(selectedAccount.loginId, selectedAccount.loginPw)
        sendLogToRenderer(`로그인 성공 (ID: ${selectedAccount.loginId})`, 'info')

        registration.setImageOptimize(settings.imageOptimize)
        sendLogToRenderer(`이미지 최적화 설정: ${settings.imageOptimize}`, 'info')

        const deliveryPresetLabel =
          selectedAccount.deliveryAreaPresetMode === 'custom' && selectedAccount.deliveryAreas?.length
            ? `지역선택(${selectedAccount.deliveryAreas.join(', ')})`
            : '전국'
        sendLogToRenderer(`배송가능지역 preset 적용: ${deliveryPresetLabel}`, 'info')

        // ✅ 계정 유효성 및 권한 검사
        const hasPermission = await checkAccountPermission(selectedAccount.loginId, '상품등록')
        if (!hasPermission) {
          throw new Error('"상품등록" 권한이 없습니다. 상품 등록이 불가능합니다.')
        }

        const legacyDelay = Number(settings.registrationDelay)
        const minDelayRaw = Number(settings.registrationDelayMin)
        const maxDelayRaw = Number(settings.registrationDelayMax)
        const fallbackDelay = Number.isFinite(legacyDelay) ? legacyDelay : 0
        const minDelay = Number.isFinite(minDelayRaw) ? minDelayRaw : fallbackDelay
        const maxDelay = Number.isFinite(maxDelayRaw) ? maxDelayRaw : fallbackDelay
        const lowerDelay = Math.max(0, Math.min(minDelay, maxDelay))
        const upperDelay = Math.max(0, Math.max(minDelay, maxDelay))
        // selectedProducts는 이미 위에서 필터링됨
        let successCount = 0
        let failCount = 0

        for (let i = 0; i < selectedProducts.length; i++) {
          if (isCancelled) {
            sendLogToRenderer('상품 등록이 사용자에 의해 중단되었습니다.', 'warning')
            break
          }

          const product = selectedProducts[i]

          try {
            // ✅ 상품 등록 전 데이터 정리
            const sanitizedProduct = sanitizeProductData(product)
            const productWithPreset = applyAccountDeliveryPreset(sanitizedProduct, selectedAccount)

            // estimateAmt(제시금액): 0이거나 없으면 기본값 보정
            if (!productWithPreset.estimateAmt || productWithPreset.estimateAmt === '0') {
              productWithPreset.estimateAmt = '0'
            }

            // remainQnt(재고수량): 없으면 기본값 보정
            if (!productWithPreset.remainQnt || productWithPreset.remainQnt === '0') {
              productWithPreset.remainQnt = '9999'
            }

            // 필수 필드 기본값 보정 (데이터가 ExcelRegistrationData 형태로 이미 제공됨)
            if (!productWithPreset.kidsKcType) productWithPreset.kidsKcType = 'N'
            if (!productWithPreset.elecKcType) productWithPreset.elecKcType = 'N'
            if (!productWithPreset.dailyKcType) productWithPreset.dailyKcType = 'N'
            if (!productWithPreset.broadcastingKcType) productWithPreset.broadcastingKcType = 'N'
            if (!productWithPreset.childExitCheckerKcType) productWithPreset.childExitCheckerKcType = 'N'
            if (!productWithPreset.safetyCheckKcType) productWithPreset.safetyCheckKcType = 'N'
            if (!productWithPreset.deliveryGroupYn) productWithPreset.deliveryGroupYn = 'Y'
            if (!productWithPreset.jejuDeliveryYn) productWithPreset.jejuDeliveryYn = 'N'
            if (!productWithPreset.deliveryFeeKindText) productWithPreset.deliveryFeeKindText = '무료'
            if (!productWithPreset.deliveryFee) productWithPreset.deliveryFee = '0'
            if (!productWithPreset.salesUnit) productWithPreset.salesUnit = '개'
            if (!productWithPreset.taxType) productWithPreset.taxType = '과세(세금계산서)'
            if (!productWithPreset.saleTypeText) productWithPreset.saleTypeText = '물품'
            if (!productWithPreset.assure) productWithPreset.assure = '1년'
            if (!productWithPreset.estimateValidity) productWithPreset.estimateValidity = '7일'
            if (!productWithPreset.originType) productWithPreset.originType = '국내'
            if (!productWithPreset.originLocal) productWithPreset.originLocal = ''
            if (!productWithPreset.originForeign) productWithPreset.originForeign = ''

            // readExcelFile과 동일한 검증 및 코드 변환
            const SALE_TYPE_CODE: Record<string, string> = { 물품: '1', 용역: '3' }
            const DELIVERY_FEE_CODE: Record<string, string> = { 무료: '1', 유료: '2', 조건부무료: '3' }
            const DELIVERY_LIMIT_CODE: Record<string, string> = {
              '3일': 'ZD000001',
              '5일': 'ZD000002',
              '7일': 'ZD000003',
              '15일': 'ZD000004',
              '30일': 'ZD000005',
              '45일': 'ZD000006',
            }
            const DELIVERY_METHOD_CODE: Record<string, string> = { 택배: '1', 직배송: '2', '우편 또는 등기': '3' }
            const VALID_DELIVERY_LIMITS = ['3일', '5일', '7일', '15일', '30일', '45일']
            const VALID_SALE_TYPES = ['물품', '용역']
            const VALID_DELIVERY_FEE_TYPES = ['무료', '유료', '조건부무료']

            // saleTypeText 검증 → saleType 코드 변환
            if (!VALID_SALE_TYPES.includes(productWithPreset.saleTypeText)) {
              productWithPreset.saleTypeText = '물품'
            }
            productWithPreset.saleType = SALE_TYPE_CODE[productWithPreset.saleTypeText] || '1'

            // deliveryFeeKindText 검증 → deliveryFeeKind 코드 변환
            if (!VALID_DELIVERY_FEE_TYPES.includes(productWithPreset.deliveryFeeKindText)) {
              productWithPreset.deliveryFeeKindText = '무료'
            }
            productWithPreset.deliveryFeeKind = DELIVERY_FEE_CODE[productWithPreset.deliveryFeeKindText] || '1'

            // deliveryLimitText 검증 → deliveryLimit 코드 변환
            if (!VALID_DELIVERY_LIMITS.includes(productWithPreset.deliveryLimitText || '')) {
              productWithPreset.deliveryLimitText = '7일'
            }
            productWithPreset.deliveryLimit = DELIVERY_LIMIT_CODE[productWithPreset.deliveryLimitText] || 'ZD000003'

            // deliveryMethod 코드 변환 (텍스트로 들어온 경우)
            if (productWithPreset.deliveryMethod && DELIVERY_METHOD_CODE[productWithPreset.deliveryMethod]) {
              productWithPreset.deliveryMethod = DELIVERY_METHOD_CODE[productWithPreset.deliveryMethod]
            } else if (!productWithPreset.deliveryMethod) {
              productWithPreset.deliveryMethod = '1'
            }

            // 필수 필드 검증
            const missingFields: string[] = []
            if (!productWithPreset.category1) missingFields.push('카테고리1')
            if (!productWithPreset.category2) missingFields.push('카테고리2')
            if (!productWithPreset.category3) missingFields.push('카테고리3')
            if (!productWithPreset.goodsName) missingFields.push('물품명')
            if (!productWithPreset.spec) missingFields.push('규격')
            if (!productWithPreset.modelName) missingFields.push('모델명')
            if (!productWithPreset.estimateAmt) missingFields.push('제시금액')
            if (!productWithPreset.material) missingFields.push('소재/재질')
            if (!productWithPreset.factory) missingFields.push('제조사')
            if (!productWithPreset.remainQnt) missingFields.push('재고수량')
            if (!productWithPreset.salesUnit) missingFields.push('판매단위')
            if (!productWithPreset.assure) missingFields.push('보증기간')
            if (!productWithPreset.deliveryLimitText) missingFields.push('납품가능기간')
            if (!productWithPreset.deliveryFeeKindText) missingFields.push('배송비종류')
            if (
              productWithPreset.deliveryFee === undefined ||
              productWithPreset.deliveryFee === null ||
              productWithPreset.deliveryFee === ''
            )
              missingFields.push('배송비')
            if (
              productWithPreset.returnFee === undefined ||
              productWithPreset.returnFee === null ||
              productWithPreset.returnFee === ''
            )
              missingFields.push('반품배송비')
            if (!productWithPreset.deliveryGroupYn) missingFields.push('묶음배송여부')
            if (!productWithPreset.jejuDeliveryYn) missingFields.push('제주배송여부')
            if (
              productWithPreset.jejuDeliveryFee === undefined ||
              productWithPreset.jejuDeliveryFee === null ||
              productWithPreset.jejuDeliveryFee === ''
            )
              missingFields.push('제주추가배송비')
            if (!productWithPreset.detailHtml) missingFields.push('상세설명HTML')
            if (!productWithPreset.image1) missingFields.push('기본이미지1')
            if (!productWithPreset.detailImage) missingFields.push('상세이미지')
            if (!productWithPreset.originType) missingFields.push('원산지구분')
            if (productWithPreset.originType === '국내' && !productWithPreset.originLocal)
              missingFields.push('국내원산지')
            if (productWithPreset.originType === '국외' && !productWithPreset.originForeign)
              missingFields.push('해외원산지')
            if (!productWithPreset.deliveryMethod) missingFields.push('배송방법')
            if (!productWithPreset.deliveryAreas || productWithPreset.deliveryAreas.length === 0)
              missingFields.push('배송지역')

            if (missingFields.length > 0) {
              throw new Error(`상품등록전 필수 필드를 입력해야합니다: ${missingFields.join(', ')}`)
            }

            await registration.registerProduct(productWithPreset)
            product.result = '성공' // ✅ 성공한 경우 결과 업데이트
            successCount += 1
          } catch (error) {
            if (error.message && isIgnorableError(error.message)) {
              // ✅ 무시할 에러
              console.warn(`무시된 에러: ${error.message}`)
              product.result = '성공'
              successCount += 1
            } else {
              // ✅ 사용자에게 보여줘야 하는 에러만 처리
              sendLogToRenderer(`상품 등록 실패: ${product.goodsName} - ${error.message}`, 'error')
              product.result = error.message || '알 수 없는 에러' // ✅ 실패한 경우 결과 업데이트
              failCount += 1
            }
          }

          // ✅ 설정된 등록 간격만큼 대기
          if (i < selectedProducts.length - 1) {
            const delay = upperDelay > lowerDelay ? lowerDelay + Math.random() * (upperDelay - lowerDelay) : lowerDelay

            if (delay > 0) {
              const delayText = Number.isInteger(delay) ? delay.toString() : delay.toFixed(2)
              sendLogToRenderer(`다음 상품 등록까지 ${delayText}초 대기 중...`, 'info')
              await new Promise(resolve => setTimeout(resolve, delay * 1000))
            }
          }
        }

        const updatedAccounts = (settings.accounts || []).map(account =>
          account.id === selectedAccount.id ? { ...account, lastRegisteredIp: currentPublicIp } : account,
        )
        store.set('settings', normalizeSettings({ ...settings, accounts: updatedAccounts }))
        sendLogToRenderer(
          `사업자 마지막 등록 IP 저장: ${selectedAccount.name || selectedAccount.loginId} -> ${currentPublicIp}`,
          'info',
        )

        // 등록 결과를 Product 저장소에 반영
        const storedProducts = (store.get('products') || []) as Product[]
        const productResultMap = new Map<string, string>()
        const selectedStoredProducts = allStoredProducts.filter(sp => idSet.has(sp.id))
        selectedProducts.forEach((p, idx) => {
          if (idx < selectedStoredProducts.length) {
            productResultMap.set(selectedStoredProducts[idx].id, p.result || '')
          }
        })
        const updatedProducts = storedProducts.map(p =>
          productResultMap.has(p.id) ? { ...p, result: productResultMap.get(p.id) || '' } : p,
        )
        store.set('products', updatedProducts)

        return {
          success: failCount === 0 && !isCancelled,
          cancelled: isCancelled,
          successCount,
          failCount,
          totalCount: selectedProducts.length,
          productResults: allProducts.map(product => product.result || ''),
          error: failCount > 0 ? `${failCount}개 상품 등록 실패` : undefined,
        }
      } catch (error) {
        sendLogToRenderer(`에러 발생: ${error.message}`, 'error')
        console.error(error)

        return {
          success: false,
          error: error.message || 'Unknown error occurred.',
          productResults: allProducts.map(product => product.result || ''),
        }
      } finally {
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

  ipcMain.handle('get-credits', async (_, { s2bId }) => {
    try {
      const balance = await getCreditsBalanceByS2bId(s2bId)
      return { balance }
    } catch (error: any) {
      console.error('크레딧 조회 실패:', error)
      return { balance: null }
    }
  })

  ipcMain.handle('get-current-public-ip', async () => {
    try {
      const ip = await fetchCurrentPublicIp()
      return { success: true, ip }
    } catch (error: any) {
      return { success: false, ip: '', error: error?.message || '공인 IP 조회 실패' }
    }
  })

  // 설정 불러오기
  ipcMain.handle('get-settings', () => {
    try {
      const settings = normalizeSettings(store.get('settings'))
      return settings
    } catch (error) {
      console.error('Error loading settings:', error)
      throw error
    }
  })

  // 설정 저장하기
  ipcMain.handle('save-settings', async (_, settings) => {
    try {
      const prev = normalizeSettings(store.get('settings'))
      const merged = normalizeSettings({ ...prev, ...(settings || {}) })
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

  // 일반 파일 선택 다이얼로그 (이미지 등)
  ipcMain.handle('select-file', async () => {
    if (!mainWindow) return null

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      title: '파일 선택',
    })

    return result.canceled ? null : result.filePaths[0]
  })

  // 엑셀 파일 읽기 (범용)
  ipcMain.handle('read-excel-raw', async (_, filePath: string) => {
    try {
      let finalPath = filePath
      if (filePath && !path.isAbsolute(filePath)) {
        // 상대 경로일 경우 앱 실행 경로 기준으로 변환
        finalPath = path.join(app.getAppPath(), filePath)
      }

      if (!fsSync.existsSync(finalPath)) {
        console.error(`Excel file not found at: ${finalPath}`)
        return []
      }

      const workbook = XLSX.readFile(finalPath)
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      return XLSX.utils.sheet_to_json(sheet, { defval: '' })
    } catch (error) {
      console.error('Error reading excel raw:', error)
      return []
    }
  })

  // S2B 카테고리 엑셀 읽기 (기본 경로 고정)
  ipcMain.handle('get-s2b-categories-raw', async () => {
    try {
      const finalPath = path.join(app.getAppPath(), 'files/s2b_categories.xlsx')

      if (!fsSync.existsSync(finalPath)) {
        console.error(`S2B Category file not found at: ${finalPath}`)
        return []
      }

      const workbook = XLSX.readFile(finalPath)
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      return XLSX.utils.sheet_to_json(sheet, { defval: '' })
    } catch (error) {
      console.error('Error reading S2B categories raw:', error)
      return []
    }
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

  ipcMain.handle(
    'update-pricing',
    async (
      _: unknown,
      params: {
        startDate: string
        endDate: string
        statusDateRange?: { start: string; end: string }
        registrationStatus: string
        searchQuery: string
        priceChangePercent: number
        roundingBase?: 1 | 10 | 100 | 1000 | 10000
        roundingMode?: 'ceil' | 'floor' | 'round' | 'halfDown'
      },
    ) => {
      const {
        startDate,
        endDate,
        statusDateRange,
        registrationStatus,
        searchQuery,
        priceChangePercent,
        roundingBase = 10,
        roundingMode = 'round',
      } = params
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

        await pricing.updatePricingForRange(
          registrationStatus,
          searchQuery,
          priceChangePercent,
          startDate,
          endDate,
          { base: roundingBase, mode: roundingMode },
          statusDateRange,
        )

        return { success: true, message: '상품 가격이 성공적으로 변경되었습니다.' }
      } catch (error) {
        sendLogToRenderer(`에러 발생: ${error.message}`, 'error')
        return { success: false, error: error.message || 'Unknown error occurred.' }
      } finally {
        await pricing?.close()
      }
    },
  )

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
  // 로컬 파일 경로를 renderer에서 로드하기 위한 프로토콜 등록
  protocol.registerFileProtocol('local-resource', (request, callback) => {
    const url = request.url.replace(/^local-resource:\/\//, '')
    try {
      return callback(decodeURIComponent(url))
    } catch (error) {
      console.error('Failed to register protocol:', error)
      return callback('')
    }
  })

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
