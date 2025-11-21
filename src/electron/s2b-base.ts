import { chromium, type Browser, type BrowserContext, type Page } from 'patchright'
import * as fsSync from 'fs'

export abstract class S2BBase {
  protected browser: Browser | null = null
  protected context: BrowserContext | null = null
  protected page: Page | null = null
  protected executablePath: string
  protected headless: boolean
  protected logCallback: (message: string, level?: 'info' | 'warning' | 'error') => void

  constructor(logCallback: (message: string, level?: 'info' | 'warning' | 'error') => void, headless: boolean = false) {
    this.logCallback = logCallback
    this.headless = headless

    let possiblePaths: string[] = []

    switch (process.platform) {
      case 'darwin':
        possiblePaths = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
        break
      case 'win32':
        possiblePaths = [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        ]
        break
      default:
        possiblePaths = ['/usr/bin/google-chrome']
        break
    }

    this.executablePath = possiblePaths.find(p => fsSync.existsSync(p)) || ''
  }

  protected _log(message: string, level: 'info' | 'warning' | 'error' = 'info') {
    this.logCallback?.(message, level)
  }

  public async launch(): Promise<void> {
    if (this.browser) return

    const commonArgs = ['--no-sandbox', '--disable-setuid-sandbox']

    if (!this.executablePath) {
      throw new Error('Chrome 또는 Edge 실행 파일을 찾지 못했습니다. 설치 후 다시 시도하세요.')
    }

    this.browser = await chromium.launch({
      headless: this.headless,
      executablePath: this.executablePath,
      args: commonArgs,
    })

    this.context = await this.browser.newContext({ viewport: null })
    this.page = await this.context.newPage()
    this.browser.on('disconnected', () => {
      this._log(`${this.constructor.name} 브라우저가 수동으로 닫혔습니다.`, 'warning')
      this.browser = null
      this.context = null
      this.page = null
    })
    this.page.setDefaultNavigationTimeout(30000)
    this.page.setDefaultTimeout(30000)
  }

  public async close(): Promise<void> {
    try {
      await this.page?.close()
    } catch {}
    try {
      await this.context?.close()
    } catch {}
    try {
      await this.browser?.close()
    } catch {}
    this.page = null
    this.context = null
    this.browser = null
  }

  public async login(id: string, password: string): Promise<void> {
    if (!this.page) throw new Error('브라우저가 초기화되지 않았습니다.')

    await this.page.goto('https://www.s2b.kr/S2BNCustomer/Login.do?type=sp&userDomain=')
    await this.page.fill('form[name="vendor_loginForm"] [name="uid"]', id)
    await this.page.fill('form[name="vendor_loginForm"] [name="pwd"]', password)

    let alertMessage = ''
    const alertHandler = (dialog: any) => {
      alertMessage = dialog.message()
      dialog.accept()
    }

    this.page.on('dialog', alertHandler)

    try {
      await this.page.click('form[name="vendor_loginForm"] .btn_login > a')
      await this.page.waitForLoadState('networkidle')

      if (alertMessage) {
        throw new Error(`LOGIN_ERROR_UNKNOWN: ${alertMessage}`)
      }

      const currentUrl = this.page.url()
      if (currentUrl.includes('Login1.do') || currentUrl.includes('Login.do')) {
        throw new Error('LOGIN_ERROR_UNKNOWN: 로그인에 실패했습니다.')
      }
    } catch (error) {
      this.page.off('dialog', alertHandler)
      throw error
    }

    this.page.off('dialog', alertHandler)
  }
}
