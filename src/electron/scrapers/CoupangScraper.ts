import type { Page } from 'patchright'
import path from 'node:path'
import * as fsSync from 'fs'
import dayjs from 'dayjs'
import { VendorConfig, VendorKey } from '../sourcing-config'
import type { ExtractedBasicInfo } from './BaseScraper'
import { BaseScraper } from './BaseScraper'
import { envConfig } from '../envConfig'

/**
 * 쿠팡용 Scraper
 * - 목록: 현재 페이지(검색/리스트 페이지)에서 DOM 기반으로 수집
 * - 상세: 상품 상세 페이지에서 기본 정보만 최소한으로 수집
 *   (기존 도매꾹/도매의신과 동일한 인터페이스를 맞추기 위한 용도)
 */
export class CoupangScraper extends BaseScraper {
  public vendorKey: VendorKey = VendorKey.쿠팡

  /**
   * 검색/카테고리 결과 목록 수집
   */
  async collectList(
    page: Page,
    _vendor: VendorConfig,
  ): Promise<{ name: string; url: string; price?: number; listThumbnail?: string; vendor?: string }[]> {
    // 쿠팡 검색/카테고리 페이지 DOM 구조 기반
    await page.waitForSelector('#product-list', { timeout: 5000 })

    const items = await page.$$eval('li[class^="ProductUnit_productUnit"]', nodes => {
      const results: {
        name: string
        url: string
        price?: number
        listThumbnail?: string
        vendor?: string
      }[] = []

      for (const li of nodes as HTMLElement[]) {
        // 광고 표시 제외: 내부에 class^=AdMark_ 요소가 있으면 skip
        const hasAd = !!li.querySelector('[class^="AdMark_"]')
        if (hasAd) continue

        const anchor = li.querySelector('a') as HTMLAnchorElement | null
        const nameEl = li.querySelector('[class^="ProductUnit_productName"]') as HTMLElement | null
        const priceEls = li.querySelectorAll('[class^="PriceArea_priceArea"] .fw-font-bold') as NodeListOf<HTMLElement>
        const imageEl = li.querySelector('[class^="ProductUnit_productImage"] img') as HTMLImageElement | null

        const title = (nameEl?.textContent || '').trim()

        // 가격 요소들을 순회하며 정규표현식에 매칭되는 첫 번째 가격 추출
        let price = 0
        for (const priceEl of Array.from(priceEls)) {
          const priceText = priceEl.textContent || ''
          const priceMatch = priceText.match(/\d{1,3}(,\d{3})*원/)
          if (priceMatch) {
            price = parseInt(priceMatch[0].replace(/[^\d]/g, ''), 10)
            break
          }
        }

        let href = anchor?.getAttribute('href') || ''
        if (href && href.startsWith('//')) href = `https:${href}`
        else if (href && href.startsWith('/')) href = `https://www.coupang.com${href}`

        let imageUrl = ''
        if (imageEl) {
          imageUrl = imageEl.getAttribute('src') || imageEl.getAttribute('data-src') || ''
          if (imageUrl) {
            // 320x320ex를 1000x1000ex로 변경하여 고해상도 이미지 가져오기
            imageUrl = imageUrl.replace(/320x320ex/g, '1000x1000ex')
          }
        }

        if (!title || !href) continue

        results.push({
          name: title,
          url: href,
          price: price || undefined,
          listThumbnail: imageUrl || undefined,
          vendor: '쿠팡',
        })
      }

      return results
    })

    return items
  }

  /**
   * 기본 정보 수집
   */
  async extractBasicInfo(page: Page, _vendorKey: VendorKey, _vendor: VendorConfig): Promise<ExtractedBasicInfo> {
    // 제목
    let name: string | null = null
    try {
      await page.waitForSelector('h1.product-title', { timeout: 5000 })
      const titleElement = await page.$('h1.product-title')
      const title = (await titleElement?.textContent())?.trim()
      if (title) name = title
    } catch {
      name = '상품 제목'
    }

    // 가격
    let price: number | null = null
    try {
      const priceElement = await page.$('.final-price-amount')
      const priceText = (await priceElement?.textContent()) || ''
      const digits = priceText.replace(/[^\d]/g, '')
      if (digits) price = parseInt(digits, 10)
    } catch {
      price = null
    }

    // 카테고리 (상단 네비게이션 기반, 없으면 빈 배열)
    const categories: string[] = await page
      .$$eval('.breadcrumb a, .breadcrumb span', nodes =>
        Array.from(nodes)
          .map(n => (n.textContent || '').trim())
          .filter(Boolean),
      )
      .catch(() => [])

    return {
      name,
      productCode: null,
      price,
      shippingFee: null,
      minPurchase: undefined,
      imageUsage: undefined,
      certifications: undefined,
      origin: null,
      manufacturer: null,
      categories,
      options: undefined,
    }
  }

  /**
   * 썸네일(기본/추가 이미지) 저장
   */
  async collectThumbnails(page: Page, _vendor: VendorConfig, productDir?: string): Promise<string[]> {
    let imageUrls: string[] = await page
      .$$eval('.product-image li img', nodes =>
        Array.from(nodes)
          .map(n => (n as HTMLImageElement).src || (n as HTMLImageElement).getAttribute('data-src') || '')
          .filter(Boolean),
      )
      .catch(() => [])

    // 이미지가 여전히 없다면 바로 반환
    if (imageUrls.length === 0) {
      return []
    }

    const normalized = Array.from(
      new Set(
        imageUrls.map(url => {
          let processed = url
          if (processed.startsWith('//')) processed = `https:${processed}`
          else if (!processed.startsWith('http')) processed = `https://${processed}`
          return processed.replace(/48x48ex|320x320ex/g, '1000x1000ex')
        }),
      ),
    )

    const targetDir = productDir || path.join(envConfig.downloadsPath, dayjs().format('YYYYMMDD'))
    if (!fsSync.existsSync(targetDir)) fsSync.mkdirSync(targetDir, { recursive: true })

    const savedMainImages: string[] = []
    const thumbnailNames = ['기본이미지1.jpg', '기본이미지2.jpg', '추가이미지1.jpg', '추가이미지2.jpg']
    for (let i = 0; i < Math.min(4, normalized.length); i++) {
      const buf = await this.downloadToBuffer(normalized[i])
      if (!buf) continue
      const outPath = path.join(targetDir, thumbnailNames[i])
      await this.saveJpg(buf, outPath, 90)
      savedMainImages.push(outPath)
    }

    return savedMainImages
  }

  /**
   * 상세 이미지(페이지 캡처) 저장
   */
  async collectDetailImage(page: Page, _vendor: VendorConfig, productDir?: string): Promise<string | null> {
    try {
      // 1) 상세 영역(.product-detail-content)까지 먼저 스크롤
      try {
        await page.evaluate(() => {
          const detailContent = document.querySelector('.product-detail-content')
          if (detailContent) {
            detailContent.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        })
        await page.waitForTimeout(800)
      } catch {}

      // 2) 상세이미지 추출 준비:
      //    .product-detail-content 내부에서 자신의 텍스트(text())에 "상품정보 더보기"를 직접 포함한
      //    가장 가까운(직접 텍스트를 가진) 엘리먼트만 선택해서 클릭
      const seeMoreBtn = await page.$(
        'xpath=//div[contains(@class,"product-detail-content")]//*[contains(normalize-space(text()),"상품정보 더보기")]',
      )
      if (seeMoreBtn) {
        await seeMoreBtn.click()
        await page.waitForTimeout(1500) // 상세 내용 로딩 대기
      }

      const targetDir = productDir || path.join(envConfig.downloadsPath, dayjs().format('YYYYMMDD'))
      if (!fsSync.existsSync(targetDir)) fsSync.mkdirSync(targetDir, { recursive: true })

      const outPath = path.join(targetDir, `상세이미지.jpg`)
      // 상품 상세 내용이 담긴 주요 영역(.product-detail-content-inside)을 우선 캡처,
      // 없으면 body 전체를 폴백으로 사용
      const contentLocator = page.locator('.product-detail-content-inside')
      let locatorToCapture = contentLocator
      try {
        const count = await contentLocator.count()
        if (!count) {
          locatorToCapture = page.locator('body')
        }
      } catch {
        locatorToCapture = page.locator('body')
      }

      await this.screenshotWithHiddenFixedElements(page, locatorToCapture.first(), { path: outPath })
      return outPath
    } catch {
      return null
    }
  }

  /**
   * 추가 정보 (현재는 미수집)
   */
  async collectAdditionalInfo(
    _page: Page,
    _vendor: VendorConfig,
  ): Promise<{ label: string; value: string }[] | undefined> {
    return undefined
  }

  /**
   * 로그인 필요 여부
   * - 쿠팡 소싱은 로그인 없이도 가능하므로 기본적으로 false 반환
   */
  async checkLoginRequired(_page: Page): Promise<boolean> {
    return false
  }
}

export default CoupangScraper
