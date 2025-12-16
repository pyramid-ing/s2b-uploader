import path from 'node:path'
import * as fsSync from 'fs'
import fs from 'node:fs/promises'
import axios from 'axios'
import dayjs from 'dayjs'
import { pick } from 'lodash'
import { type AiRefinedPayload, fetchAiRefined } from './lib/ai-client'
import { VENDOR_CONFIG, VendorConfig, VendorKey } from './sourcing-config'
import DomeggookScraper from './scrapers/DomeggookScraper'
import DomesinScraper from './scrapers/DomesinScraper'
import CoupangScraper from './scrapers/CoupangScraper'
import S2BSchoolScraper from './scrapers/S2BSchoolScraper'
import type { Scraper } from './scrapers/BaseScraper'
import { S2BBase } from './s2b-base'
import { validateKcByCertNum, KcValidationError } from './kc-validator'
import { envConfig } from './envConfig'
import { ConfigSet, ExcelRegistrationData, TaxType } from './types/excel'

interface SourcingCrawlData {
  url: string
  vendor: VendorKey | null
  name?: string
  productCode?: string
  categories: string[]
  price?: number
  shippingFee?: string
  minPurchase?: number
  imageUsage?: string
  certifications?: { type: string; number: string }[]
  origin?: string
  manufacturer?: string
  options?: { name: string; price?: number; qty?: number }[][]
  mainImages: string[]
  detailImages: string[]
  listThumbnail?: string
  특성?: { label: string; value: string }[]
  downloadDir?: string
}

export class S2BSourcing extends S2BBase {
  private baseFilePath: string
  private settings: any
  private configSet?: ConfigSet

  constructor(
    baseImagePath: string,
    logCallback: (message: string, level?: 'info' | 'warning' | 'error') => void,
    headless: boolean = false,
    settings?: any,
    configSet?: ConfigSet,
  ) {
    super(logCallback, headless)
    this.baseFilePath = baseImagePath
    this.settings = settings
    this.configSet = configSet
  }

  public setConfigSet(configSet?: ConfigSet): void {
    this.configSet = configSet
  }

  public async launch(): Promise<void> {
    await super.launch()
  }

  public async openUrl(url: string): Promise<void> {
    if (!this.page) throw new Error('Browser page not initialized')
    await this.page.goto(url, { waitUntil: 'domcontentloaded' })
  }

  public async collectListFromUrl(
    targetUrl: string,
    options?: { skipGoto?: boolean },
  ): Promise<{ name: string; url: string; price?: number; listThumbnail?: string; vendor?: string }[]> {
    if (!this.page) throw new Error('Browser page not initialized')
    const vendorKey = this._detectVendorByUrl(targetUrl)
    if (!vendorKey) throw new Error('지원하지 않는 사이트 입니다.')
    const vendor: VendorConfig = VENDOR_CONFIG[vendorKey]
    const scraper = this._getScraper(vendorKey)
    if (!scraper) throw new Error('지원하지 않는 사이트 입니다.')
    // 기본적으로는 targetUrl 로 이동하지만,
    // 이미 해당 페이지에 있는 경우(현재페이지 목록 수집 등)에는 이동을 생략할 수 있다.
    if (!options?.skipGoto) {
      await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    }
    return await scraper.collectList(this.page, vendor)
  }

  public async collectS2BFilteredList(params: {
    keyword: string
    minPrice?: number
    maxPrice?: number
    maxCount?: number
    sortCode?: 'RANK' | 'PCAC' | 'CERT' | 'TRUST' | 'DATE' | 'PCDC' | 'REVIEW_COUNT'
    viewCount?: 10 | 20 | 30 | 40 | 50
    pageDelayMs?: number
  }): Promise<{ name: string; url: string; price?: number; listThumbnail?: string; vendor?: string }[]> {
    if (!this.page) throw new Error('Browser page not initialized')
    const vendorKey = VendorKey.학교장터
    const vendor = VENDOR_CONFIG[vendorKey]
    const scraper = this._getScraper(vendorKey)
    if (!scraper?.collectFilteredList) throw new Error('학교장터 필터검색을 지원하지 않습니다.')
    return await scraper.collectFilteredList(this.page, vendor, params, (m, lv) => this._log(m, lv))
  }

  public async collectNormalizedDetailForUrls(urls: string[], optionHandling?: 'split' | 'single') {
    if (!this.page) throw new Error('Browser page not initialized')
    const outputs: (SourcingCrawlData & { excelMapped?: ExcelRegistrationData[] })[] = []
    for (const url of urls) {
      this._log(`상품 데이터 수집 시작: ${url}`, 'info')
      const { vendorKey, vendor } = this._getVendor(url)
      const scraper = this._getScraper(vendorKey)
      if (scraper && (await scraper.checkLoginRequired(this.page))) {
        throw new Error(
          '로그인이 필요합니다: 로그인 페이지로 이동되었습니다. 소싱 브라우저에서 로그인 후 다시 시도하세요.',
        )
      }
      if (!scraper || !vendorKey || !vendor) {
        throw new Error('지원하지 않는 사이트 입니다.')
      }

      // Vendor-specific navigation hook (e.g. S2B detail flow)
      if (typeof scraper.navigateToDetail === 'function') {
        await scraper.navigateToDetail(this.page, vendor, url)
      } else {
        await this.page.goto(url, { waitUntil: 'domcontentloaded' })
      }

      await scraper.waitBeforeCapture(this.page)
      const basicInfo = await scraper.extractBasicInfo(this.page, vendorKey, vendor)
      if (!basicInfo.name || !basicInfo.name.trim()) {
        throw new Error('크롤링 실패: 상품명(name) 추출에 실패했습니다.')
      }
      const baseName = (basicInfo.name || basicInfo.productCode || 'product').toString()
      const productDir = this._createProductDir(baseName, basicInfo.productCode, vendorKey)
      const savedMainImages = await scraper.collectThumbnails(this.page, vendor, productDir)
      const detailCapturePath = await scraper.collectDetailImage(this.page, vendor, productDir)
      const 특성 = await scraper.collectAdditionalInfo(this.page, vendor)
      const crawlData: SourcingCrawlData = {
        url,
        vendor: vendorKey,
        name: basicInfo.name || undefined,
        productCode: basicInfo.productCode || undefined,
        categories: basicInfo.categories,
        price: basicInfo.price ?? undefined,
        shippingFee: basicInfo.shippingFee || undefined,
        minPurchase: basicInfo.minPurchase,
        imageUsage: basicInfo.imageUsage,
        certifications: basicInfo.certifications,
        origin: basicInfo.origin || undefined,
        manufacturer: basicInfo.manufacturer || undefined,
        options: basicInfo.options,
        mainImages: savedMainImages,
        detailImages: detailCapturePath ? [detailCapturePath] : [],
        downloadDir: productDir,
        특성,
      }

      // 학교장터는 n8n(AI 정제/OCR) 호출 없이 크롤링 데이터 그대로 사용한다.
      // (요청사항: n8n 서버 요청 금지)
      const aiRefined =
        vendorKey === VendorKey.학교장터
          ? this._buildRefinedPayloadWithoutAI(crawlData)
          : await this._refineCrawlWithAI(crawlData)

      // 학교장터는 외부 KC 검증 호출 없이, 상세 화면의 "인증정보" 텍스트를 기반으로 KC 정보를 채운다.
      const kcResolved =
        vendorKey === VendorKey.학교장터
          ? this._determineKcFromS2BFeatures(crawlData.특성)
          : await this._determineKcFromAI(aiRefined)

      const categoryMapped =
        basicInfo.categories && basicInfo.categories.length >= 3
          ? await this._mapCategories(vendorKey || '', basicInfo.categories)
          : {}
      const excelMapped = this._mapToExcelFormat(
        crawlData,
        aiRefined,
        categoryMapped,
        this.configSet?.config
          ? {
              ...this.configSet.config,
              optionHandling: optionHandling || this.configSet.config.optionHandling || 'split',
            }
          : undefined,
        kcResolved,
      )
      outputs.push({ ...crawlData, excelMapped })
    }
    return outputs
  }

  public getCurrentUrl(): string {
    try {
      return this.page?.url() ?? ''
    } catch {
      return ''
    }
  }

  private _detectVendorByUrl(targetUrl: string): VendorKey | null {
    try {
      const host = new URL(targetUrl).hostname
      if (host.includes('domeggook')) return VendorKey.도매꾹
      if (host.includes('domesin')) return VendorKey.도매의신
      if (host.includes('coupang')) return VendorKey.쿠팡
      if (host.includes('s2b.kr')) return VendorKey.학교장터
      return null
    } catch {
      return null
    }
  }

  private _getVendor(url: string): { vendorKey: VendorKey | null; vendor?: VendorConfig } {
    const vendorKey = this._detectVendorByUrl(url)
    const vendor = vendorKey ? VENDOR_CONFIG[vendorKey] : undefined
    return { vendorKey, vendor }
  }

  private _getScraper(vendorKey: VendorKey | null): Scraper | null {
    if (!vendorKey) return null
    switch (vendorKey) {
      case VendorKey.도매꾹:
        return new DomeggookScraper()
      case VendorKey.도매의신:
        return new DomesinScraper()
      case VendorKey.쿠팡:
        return new CoupangScraper()
      case VendorKey.학교장터:
        return new S2BSchoolScraper()
      default:
        return null
    }
  }

  private _sanitizeFileName(name: string): string {
    const replaced = name.replace(/[\\/:*?"<>|\n\r\t]/g, ' ').trim()
    return replaced.slice(0, 80) || 'product'
  }

  private _ensureDir(dirPath: string): void {
    if (!fsSync.existsSync(dirPath)) fsSync.mkdirSync(dirPath, { recursive: true })
  }

  private _createProductDir(baseName: string, productCode?: string, vendorKey?: VendorKey): string {
    const dateDir = dayjs().format('YYYYMMDD')

    // 상품코드가 있으면 상품코드 기반으로 폴더명 생성, 없으면 기존 방식 사용
    let folderName: string
    if (productCode && productCode.trim()) {
      // 채널별 접두사 추가 (설정에서 가져오기)
      const prefix = this._getVendorPrefix(vendorKey)
      folderName = `${prefix}${productCode.trim()}`
    } else {
      // 상품코드가 없으면 기존 방식 (상품명 기반)
      const safeName = this._sanitizeFileName(baseName)
      folderName = `${safeName}_${Date.now()}`
    }

    const dir = path.join(this.baseFilePath, 'downloads', dateDir, folderName)
    this._ensureDir(dir)
    return dir
  }

  private _getVendorPrefix(vendorKey?: VendorKey): string {
    if (!vendorKey) return 'UNK_'

    const vendor = VENDOR_CONFIG[vendorKey]
    return vendor?.prefix || 'UNK_'
  }

  private async _refineCrawlWithAI(data: SourcingCrawlData): Promise<AiRefinedPayload> {
    const payload = pick(data, [
      'name',
      'shippingFee',
      'imageUsage',
      'origin',
      'manufacturer',
      'options',
      'certifications',
      '특성',
    ])

    const s2bId = this.settings?.loginId

    // 1) OCR 시작
    this._log('OCR 시작', 'info')
    const ocrText = await this._runDetailImageOcr(data.detailImages?.[0])
    // 2) OCR 완료 (성공/실패 여부와 관계없이, 시도 자체는 끝난 시점)
    this._log('OCR 완료', 'info')

    // 3) AI 정제 시작
    this._log(`AI 정제 시작: ${data.name ?? ''}`, 'info')
    const aiRefined = await fetchAiRefined({
      ...payload,
      s2b_id: s2bId,
      ocr_text: ocrText,
    })
    // 4) AI 정제 완료
    this._log(`AI 정제 완료: ${data.name ?? ''}`, 'info')
    return aiRefined
  }

  private _buildRefinedPayloadWithoutAI(data: SourcingCrawlData): AiRefinedPayload {
    const name = (data.name || '').toString().trim()

    const originText = (data.origin || '').toString().trim()
    const isDomestic =
      originText.includes('국내') ||
      originText.includes('대한민국') ||
      originText.includes('한국') ||
      originText.toLowerCase().includes('korea')

    const featurePairs: { label: string; value: string }[] = Array.isArray(data.특성)
      ? data.특성
          .map(v => ({ label: (v?.label ?? '').toString().trim(), value: (v?.value ?? '').toString().trim() }))
          .filter(v => v.label || v.value)
      : []

    const pickByLabel = (label: string): string | undefined => {
      const found = featurePairs.find(p => p.label === label)
      return found?.value?.trim() || undefined
    }

    // 모델명 / 규격: 요청사항대로 " / " 기준
    const modelName =
      pickByLabel('모델명') ||
      (() => {
        const raw = pickByLabel('모델명 / 규격')
        if (!raw) return undefined
        return raw
          .split('/')
          .map(v => v.trim())
          .filter(Boolean)[0]
      })() ||
      '상세설명참고'

    const spec =
      pickByLabel('규격') ||
      (() => {
        const raw = pickByLabel('모델명 / 규격')
        if (!raw) return undefined
        const parts = raw
          .split('/')
          .map(v => v.trim())
          .filter(Boolean)
        if (parts.length <= 1) return undefined
        return parts.slice(1).join(' / ')
      })()

    const materialValue = pickByLabel('소재 / 재질') || pickByLabel('소재/재질') || '상세설명참고'

    // 인증번호는 페이지에서 제공되는 KC 표기/인증번호 텍스트에서만 단순 추출 (검증 호출 없음)
    const textPool = featurePairs.map(p => `${p.label}: ${p.value}`)
    const certificationNumbers = Array.from(
      new Set(
        textPool
          .flatMap(s => {
            const matches = s.match(/\b(?:R-[A-Z0-9-]+|R-[A-Z]-[A-Z0-9-]+|MSIP-[A-Z0-9-]+|KCC-[A-Z0-9-]+)\b/gi) || []
            const bracketed = s.match(/\[([A-Za-z0-9-]{6,})\]/g) || []
            return [...matches, ...bracketed.map(v => v.replace(/^\[/, '').replace(/\]$/, ''))].map(v => v.trim())
          })
          .filter(Boolean),
      ),
    )

    // Excel 규격에 들어가야 하므로 spec를 제일 앞에 두고, 너무 길어지지 않게 최소만 넣는다.
    const features: string[] = []
    if (spec) features.push(spec)
    if (materialValue && materialValue !== '상세설명참고') features.push(`소재/재질: ${materialValue}`)

    return {
      물품명: name || '상품명',
      모델명: modelName,
      '소재/재질': materialValue,
      원산지구분: isDomestic ? '국내' : '국외',
      국내원산지: isDomestic ? originText : '',
      해외원산지: isDomestic ? '' : originText,
      certificationNumbers,
      이미지사용여부: '모름',
      options: [],
      특성: features,
    }
  }

  private _determineKcFromS2BFeatures(features?: { label: string; value: string }[]): {
    kids?: { type: 'Y' | 'F' | 'N'; certNum?: string }
    elec?: { type: 'Y' | 'F' | 'N'; certNum?: string }
    daily?: { type: 'Y' | 'F' | 'N'; certNum?: string }
    broadcasting?: { type: 'Y' | 'F' | 'N'; certNum?: string }
    issue: boolean
    issuesText: string
  } {
    const defaultBucket: { type: 'Y' | 'F' | 'N'; certNum?: string } = { type: 'N', certNum: '' }
    const result = {
      kids: { ...defaultBucket },
      elec: { ...defaultBucket },
      daily: { ...defaultBucket },
      broadcasting: { ...defaultBucket },
      issue: false,
      issuesText: '',
    }

    const pairs = Array.isArray(features) ? features : []
    const get = (label: string) => (pairs.find(p => p?.label === label)?.value ?? '').toString().trim()

    const parseBucket = (label: string): { type: 'Y' | 'F' | 'N'; certNum?: string } => {
      const v = get(label)
      if (!v) return { ...defaultBucket }
      if (v.includes('비대상')) return { type: 'N', certNum: '' }
      const bracket = v.match(/\[([A-Za-z0-9-]{6,})\]/)
      if (bracket?.[1]) return { type: 'Y', certNum: bracket[1] }
      // 대상인데 번호가 없는 케이스는 Y로 두고 번호는 비움
      return { type: 'Y', certNum: '' }
    }

    result.kids = parseBucket('어린이제품 인증정보')
    result.elec = parseBucket('전기용품 인증정보')
    result.daily = parseBucket('생활용품 인증정보')
    // 라벨에 <br>가 포함될 수 있어 "방송통신기자재"로 시작하는 라벨을 찾아서 처리
    const broadcastingLabel =
      pairs.find(p => (p?.label ?? '').toString().includes('방송통신기자재'))?.label ||
      '방송통신기자재 적합성평가인증정보'
    const broadcastingValue = (pairs.find(p => p?.label === broadcastingLabel)?.value ?? '').toString().trim()
    if (broadcastingValue) {
      if (broadcastingValue.includes('비대상')) result.broadcasting = { type: 'N', certNum: '' }
      else {
        const bracket = broadcastingValue.match(/\[([A-Za-z0-9-]{6,})\]/)
        result.broadcasting = bracket?.[1] ? { type: 'Y', certNum: bracket[1] } : { type: 'Y', certNum: '' }
      }
    }

    return result
  }

  private async _runDetailImageOcr(detailImagePath?: string): Promise<string | undefined> {
    try {
      const fileBuffer = await fs.readFile(detailImagePath)
      const g: any = globalThis as any
      if (!g.FormData || !g.Blob) {
        this._log('현재 런타임에서 FormData/Blob 을 지원하지 않아 OCR을 건너뜁니다.', 'warning')
        return undefined
      }

      const formData = new g.FormData()
      const blob = new g.Blob([fileBuffer])
      formData.append('image', blob, path.basename(detailImagePath))

      const response = await axios.post<{ text?: string }>('https://n8n.pyramid-ing.com/webhook/s2b-ocr', formData)

      if (!response || response.status < 200 || response.status >= 300) {
        this._log(`OCR 요청 실패: ${response?.status} ${response?.statusText}`, 'warning')
        return undefined
      }

      const result = response.data as { ocrText?: string }
      const text = result?.ocrText?.trim()
      if (!text) {
        this._log('OCR 결과가 비어 있습니다.', 'warning')
        return undefined
      }

      return text
    } catch (error: any) {
      this._log(`OCR 처리 중 오류: ${error?.message || String(error)}`, 'warning')
      return undefined
    }
  }

  private async _determineKcFromAI(aiRefined: AiRefinedPayload): Promise<{
    kids?: { type: 'Y' | 'F' | 'N'; certNum?: string }
    elec?: { type: 'Y' | 'F' | 'N'; certNum?: string }
    daily?: { type: 'Y' | 'F' | 'N'; certNum?: string }
    broadcasting?: { type: 'Y' | 'F' | 'N'; certNum?: string }
    issue: boolean
    issuesText: string
  }> {
    const kcAuthKey = 'c953b79d-7da6-4cde-8086-bc866fcb5d27'

    const defaultBucket: { type: 'Y' | 'F' | 'N'; certNum?: string } = { type: 'N' }
    const result: {
      kids: { type: 'Y' | 'F' | 'N'; certNum?: string }
      elec: { type: 'Y' | 'F' | 'N'; certNum?: string }
      daily: { type: 'Y' | 'F' | 'N'; certNum?: string }
      broadcasting: { type: 'Y' | 'F' | 'N'; certNum?: string }
      issue: boolean
      issuesText: string
    } = {
      kids: { ...defaultBucket },
      elec: { ...defaultBucket },
      daily: { ...defaultBucket },
      broadcasting: { ...defaultBucket },
      issue: false,
      issuesText: '',
    }

    const detectBucket = (num: string, detail: any): 'kids' | 'elec' | 'daily' | 'broadcasting' => {
      const n = (num || '').toUpperCase().trim()
      if (n.startsWith('R-') || n.includes('MSIP') || n.includes('KCC')) return 'broadcasting'
      const div: string = String(detail?.certDiv || '').trim()
      if (div.includes('어린이')) return 'kids'
      if (div.includes('전기')) return 'elec'
      // 기타는 생활용품으로 분류
      return 'daily'
    }

    const numbers: string[] = Array.isArray(aiRefined?.certificationNumbers)
      ? (aiRefined.certificationNumbers as any[]).map(v => (v ?? '').toString().trim()).filter(Boolean)
      : []

    let failed = 0
    const errorByBucket: Partial<Record<'kids' | 'elec' | 'daily' | 'broadcasting', { num: string; msg: string }>> = {}
    for (const num of numbers) {
      try {
        const detail = await validateKcByCertNum(kcAuthKey, num)
        const bucket = detectBucket(num, detail)
        if (!result[bucket].certNum) {
          result[bucket] = { type: 'Y', certNum: num }
        }
        this._log(`KC 검증 성공(${bucket}): ${num}`, 'info')
      } catch (err: any) {
        failed++
        const bucketOnFail = detectBucket(num, undefined)
        const msg = err instanceof KcValidationError ? err.statusText || err.message : err?.message
        if (msg && !errorByBucket[bucketOnFail]) errorByBucket[bucketOnFail] = { num, msg }
        this._log(`KC 검증 실패(AI 추출): ${num}${msg ? ` - ${msg}` : ''}`, 'warning')
      }
    }

    result.issue = failed > 0
    if (result.issue) {
      const parts: string[] = []
      if (errorByBucket.kids) parts.push(`[${errorByBucket.kids.num}] 어린이제품: ${errorByBucket.kids.msg}`)
      if (errorByBucket.daily) parts.push(`[${errorByBucket.daily.num}] 생활용품: ${errorByBucket.daily.msg}`)
      if (errorByBucket.broadcasting)
        parts.push(`[${errorByBucket.broadcasting.num}] 방송통신: ${errorByBucket.broadcasting.msg}`)
      if (errorByBucket.elec) parts.push(`[${errorByBucket.elec.num}] 전기용품: ${errorByBucket.elec.msg}`)
      result.issuesText = parts.join(' / ')
    }

    return result
  }

  private async _mapCategories(
    vendor: string,
    categories: string[],
  ): Promise<{ targetCategory1?: string; targetCategory2?: string; targetCategory3?: string; g2bCode?: string }> {
    try {
      const excelPath = path.join(envConfig.filesPath, 'S2B_Sourcing_category_mapper.xlsx')
      if (!fsSync.existsSync(excelPath)) {
        this._log('카테고리 매핑 엑셀 파일을 찾을 수 없습니다.', 'warning')
        return {}
      }
      const XLSX = await import('xlsx')
      const workbook = XLSX.readFile(excelPath)
      const sheetName = vendor
      if (!workbook.Sheets[sheetName]) {
        this._log(`${vendor} 시트를 찾을 수 없습니다.`, 'warning')
        return {}
      }
      const worksheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[]
      const headerRow = data.find(
        (row: any[]) => row.includes('크롤링_1차') && row.includes('크롤링_2차') && row.includes('크롤링_3차'),
      )
      if (!headerRow) {
        this._log('카테고리 매핑 헤더를 찾을 수 없습니다.', 'warning')
        return {}
      }
      const headerIndex = data.indexOf(headerRow)
      const crawling1Index = (headerRow as any[]).indexOf('크롤링_1차')
      const crawling2Index = (headerRow as any[]).indexOf('크롤링_2차')
      const crawling3Index = (headerRow as any[]).indexOf('크롤링_3차')
      const crawling4Index = (headerRow as any[]).indexOf('크롤링_4차')
      const category1Index = (headerRow as any[]).indexOf('1차카테고리')
      const category2Index = (headerRow as any[]).indexOf('2차카테고리')
      const category3Index = (headerRow as any[]).indexOf('3차카테고리')
      const g2bIndex = (headerRow as any[]).indexOf('G2B')
      for (let i = headerIndex + 1; i < data.length; i++) {
        const row = data[i] as any[]
        if (
          row[crawling1Index] === categories[0] &&
          row[crawling2Index] === categories[1] &&
          row[crawling3Index] === categories[2] &&
          (categories.length < 4 || row[crawling4Index] === categories[3])
        ) {
          return {
            targetCategory1: row[category1Index],
            targetCategory2: row[category2Index],
            targetCategory3: row[category3Index],
            g2bCode: row[g2bIndex],
          }
        }
      }
      this._log(`카테고리 매핑을 찾을 수 없습니다: ${categories.join(' > ')}`, 'warning')
      return {}
    } catch (error: any) {
      this._log(`카테고리 매핑 실패: ${error.message}`, 'error')
      return {}
    }
  }

  private _mapToExcelFormat(
    rawData: SourcingCrawlData,
    aiRefined: AiRefinedPayload,
    categoryMapped: any,
    config?: ConfigSet['config'],
    kcResolved?: {
      kids?: { type: 'Y' | 'F' | 'N'; certNum?: string }
      elec?: { type: 'Y' | 'F' | 'N'; certNum?: string }
      daily?: { type: 'Y' | 'F' | 'N'; certNum?: string }
      broadcasting?: { type: 'Y' | 'F' | 'N'; certNum?: string }
      issue: boolean
      issuesText?: string
    },
  ): ExcelRegistrationData[] {
    const optionHandling: 'split' | 'single' = config?.optionHandling || 'split'
    const MAX_SPEC_LEN = 50
    const originalPrice = rawData.price || 0
    const isSchoolS2b = rawData.vendor === VendorKey.학교장터

    const pickFeatureValue = (label: string): string => {
      if (!isSchoolS2b) return ''
      const pairs = rawData.특성 || []
      const found = Array.isArray(pairs) ? pairs.find(p => p?.label === label) : undefined
      return (found?.value ?? '').toString().trim()
    }

    const normalizeTaxType = (raw: string): TaxType => {
      const t = (raw || '').replace(/\s+/g, '').trim()
      // 학교장터 상세: "과세(세금계산서)" 그대로 오거나, "면세"로 오는 케이스를 처리
      if (t.includes('면세')) return '면세'
      return '과세(세금계산서)'
    }

    const deliveryOption: Record<string, string> = {
      ZD000001: '3일',
      ZD000002: '5일',
      ZD000003: '7일',
      ZD000004: '15일',
      ZD000005: '30일',
      ZD000006: '45일',
    }

    const quoteOption: Record<string, string> = {
      ZD000001: '7일',
      ZD000002: '10일',
      ZD000003: '15일',
      ZD000004: '30일',
    }

    const shippingTypeMap: Record<'free' | 'fixed' | 'conditional', '무료' | '유료' | '조건부무료'> = {
      free: '무료',
      fixed: '유료',
      conditional: '조건부무료',
    }
    const effectiveConfig: ConfigSet['config'] = config || {
      deliveryPeriod: 'ZD000001', // 3일
      quoteValidityPeriod: 'ZD000001', // 7일
      shippingFeeType: 'fixed',
      shippingFee: 3000,
      returnShippingFee: 3500,
      bundleShipping: true,
      jejuShipping: true,
      jejuAdditionalFee: 5000,
      detailHtmlTemplate: '<p>상세설명을 입력하세요.</p>',
      marginRate: 20,
      optionHandling: 'split',
    }
    const marginRate = effectiveConfig.marginRate ?? 20

    // 공통: aiRefined['특성']과 최소구매수량을 기반으로 규격 문자열을 만드는 함수
    // - prefix: 규격 앞에 붙는 문자열 (길이 계산에 포함)
    // - maxLen: 최대 길이 (없으면 제한 없음)
    const buildFeatureSpec = (prefix: string, maxLen?: number): string => {
      const limit = typeof maxLen === 'number' ? maxLen : Number.POSITIVE_INFINITY

      const features = Array.isArray(aiRefined['특성'])
        ? aiRefined['특성'].map((info: any) => (info ?? '').toString().trim()).filter((v: string) => v.length > 0)
        : []

      let featurePart = ''
      for (const feature of features) {
        const nextFeaturePart = featurePart ? `${featurePart}, ${feature}` : feature
        const candidateFull = prefix ? `${prefix}${nextFeaturePart}` : nextFeaturePart
        if (candidateFull.length > limit) break
        featurePart = nextFeaturePart
      }

      const minPurchase = rawData.minPurchase || 1
      if (minPurchase > 1) {
        const minText = featurePart
          ? `${featurePart}, 최소구매수량: ${minPurchase}개`
          : `최소구매수량: ${minPurchase}개`
        const candidateFull = prefix ? `${prefix}${minText}` : minText
        if (candidateFull.length <= limit) {
          featurePart = minText
        }
      }

      return featurePart
    }

    // 기본 상품 정보 (규격은 기존 로직을 buildFeatureSpec 으로 통합)
    const baseProduct: ExcelRegistrationData = {
      KC문제: kcResolved?.issuesText || '',
      이미지사용여부: aiRefined.이미지사용여부 || '', // 참고용
      원가: originalPrice, // 참고용
      최소구매수량: rawData.minPurchase || 1, // 참고용
      구매처: String(rawData.vendor || ''), // 참고용
      구매처URL: rawData.url || '', // 참고용
      'G2B 물품목록번호': categoryMapped.g2bCode || '',
      카테고리1: categoryMapped.targetCategory1 || '',
      카테고리2: categoryMapped.targetCategory2 || '',
      카테고리3: categoryMapped.targetCategory3 || '',
      등록구분: '물품',
      물품명: aiRefined.물품명 || rawData.name || '',
      규격: buildFeatureSpec(''),
      모델명: aiRefined.모델명 || '상세설명참고',
      제조사: rawData.manufacturer || '상세설명참고',
      '소재/재질': aiRefined['소재/재질'] || '상세설명참고',
      판매단위: '개',
      보증기간: '1년',
      납품가능기간: (deliveryOption[effectiveConfig.deliveryPeriod] || '3일') as any,
      '견적서 유효기간': quoteOption[effectiveConfig.quoteValidityPeriod] || '',
      배송비종류: shippingTypeMap[effectiveConfig.shippingFeeType] || '유료',
      배송비: effectiveConfig.shippingFee,
      반품배송비: effectiveConfig.returnShippingFee,
      묶음배송여부: effectiveConfig.bundleShipping ? 'Y' : 'N',
      제주배송여부: effectiveConfig.jejuShipping ? 'Y' : 'N',
      제주추가배송비: effectiveConfig.jejuAdditionalFee,
      상세설명HTML: effectiveConfig.detailHtmlTemplate,
      기본이미지1: rawData.mainImages?.[0] || '',
      기본이미지2: rawData.mainImages?.[1] || '',
      추가이미지1: rawData.mainImages?.[2] || '',
      추가이미지2: rawData.mainImages?.[3] || '',
      상세이미지: rawData.detailImages?.[0] || '',
      원산지구분: aiRefined.원산지구분 || '국내',
      국내원산지: aiRefined.국내원산지 || '',
      해외원산지: aiRefined.해외원산지 || '',
      배송방법: '택배',
      배송지역: '',
      '정격전압/소비전력': '',
      크기및무게: '',
      동일모델출시년월: '',
      냉난방면적: '',
      제품구성: '',
      안전표시: '',
      용량: '',
      주요사양: '',
      소비기한선택: '제품에 별도 표시',
      소비기한입력: '',
      어린이하차확인장치타입: 'N',
      어린이하차확인장치인증번호: '',
      어린이하차확인장치첨부파일: '',
      안전확인대상타입: 'N',
      안전확인대상신고번호: '',
      안전확인대상첨부파일: '',
      조달청계약여부: 'N',
      계약시작일: '',
      계약종료일: '',
      전화번호: '',
      '제조사 A/S전화번호': '',
      과세여부: isSchoolS2b ? normalizeTaxType(pickFeatureValue('과세유무')) : '과세(세금계산서)',
      어린이제품KC유형: kcResolved?.kids?.type || 'N',
      어린이제품KC인증번호: kcResolved?.kids?.certNum || '',
      어린이제품KC성적서: '',
      전기용품KC유형: kcResolved?.elec?.type || 'N',
      전기용품KC인증번호: kcResolved?.elec?.certNum || '',
      전기용품KC성적서: '',
      생활용품KC유형: kcResolved?.daily?.type || 'N',
      생활용품KC인증번호: kcResolved?.daily?.certNum || '',
      생활용품KC성적서: '',
      방송통신KC유형: kcResolved?.broadcasting?.type || 'N',
      방송통신KC인증번호: kcResolved?.broadcasting?.certNum || '',
      방송통신KC성적서: '',
    }

    // 학교장터: 부가정보 탭(group_dtail01) 값을 엑셀 필드에 최대한 매핑
    if (isSchoolS2b) {
      const v1 = pickFeatureValue('정격전압/소비전력')
      if (v1) (baseProduct as any)['정격전압/소비전력'] = v1
      const v2 = pickFeatureValue('크기 및 무게')
      if (v2) (baseProduct as any).크기및무게 = v2
      const v3 = pickFeatureValue('동일모델출시일')
      if (v3) (baseProduct as any).동일모델출시년월 = v3
      const v4 = pickFeatureValue('제품구성')
      if (v4) (baseProduct as any).제품구성 = v4
      const v5 = pickFeatureValue('안전표시(주의,경고)')
      if (v5) (baseProduct as any).안전표시 = v5
      const v6 = pickFeatureValue('용량')
      if (v6) (baseProduct as any).용량 = v6
      const v7 = pickFeatureValue('주요사양')
      if (v7) (baseProduct as any).주요사양 = v7
    }
    // 옵션 처리 방법에 따른 분기
    // - 옵션이 1개뿐인 경우는 "옵션이 없는 상품"과 동일하게 처리한다.
    if (aiRefined.options && aiRefined.options.length > 1) {
      switch (optionHandling) {
        case 'single': {
          // 여러 옵션 중 "가장 비싼 옵션"을 기준으로 가격 산정
          const maxOptionExtraPrice = Math.max(...aiRefined.options.map((o: any) => Number(o?.price) || 0), 0)
          const singleBasePrice = originalPrice + maxOptionExtraPrice

          const optionNames = aiRefined.options.map((o: any) => o?.name).filter(Boolean)
          const optionText = optionNames.length > 0 ? optionNames.join(', ') : ''
          const mergedSpec = (() => {
            const optionPart = optionText ? `옵션: ${optionText}` : ''
            const prefixForFeature = optionPart ? `${optionPart} / ` : ''

            const featurePart = buildFeatureSpec(prefixForFeature, MAX_SPEC_LEN)

            if (optionPart && featurePart) return `${optionPart} / ${featurePart}`
            if (optionPart && optionPart.length <= MAX_SPEC_LEN) return optionPart
            if (featurePart) return featurePart
            return ''
          })()

          // 한 줄 옵션 표기 시 물품명 끝에 "(옵션택1)" 추가
          const singleProductName = `${baseProduct.물품명} (옵션택1)`

          return [
            {
              ...baseProduct,
              물품명: singleProductName,
              규격: mergedSpec,
              제시금액: Math.ceil((singleBasePrice * (1 + marginRate / 100)) / 100) * 100,
              재고수량: 9999,
            } as ExcelRegistrationData,
          ]
        }
        case 'split':
        default: {
          // 방어 로직: 알 수 없는 값이면 기본 split 방식 사용
          return aiRefined.options.map((option: any) => {
            const optionName = (option?.name ?? '').toString()
            const prefixForFeature = optionName ? `${optionName}, ` : ''
            const featurePart = buildFeatureSpec(prefixForFeature, MAX_SPEC_LEN)

            let specText = ''

            if (optionName && featurePart) specText = `${optionName}, ${featurePart}`
            else if (optionName && optionName.length <= MAX_SPEC_LEN) specText = optionName
            else if (featurePart) specText = featurePart
            else specText = ''

            return {
              ...baseProduct,
              물품명: baseProduct.물품명,
              규격: specText,
              제시금액: Math.ceil(((originalPrice + (option.price || 0)) * (1 + marginRate / 100)) / 100) * 100,
              재고수량: Math.min(option.qty || 9999, 9999),
            } as ExcelRegistrationData
          })
        }
      }
    }

    // 옵션이 없는 경우: 기존 규격 그대로 사용
    return [
      {
        ...baseProduct,
        제시금액: Math.ceil((originalPrice * (1 + marginRate / 100)) / 100) * 100,
        재고수량: 9999,
      } as ExcelRegistrationData,
    ]
  }
}
