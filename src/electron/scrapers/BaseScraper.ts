import type { Page } from 'patchright'
import type { VendorConfig, VendorKey } from '../sourcing-config'
import axios from 'axios'
import sharp from 'sharp'

export interface ExtractedBasicInfo {
  name: string | null
  productCode: string | null
  price: number | null
  shippingFee: string | null
  minPurchase?: number
  imageUsage?: string
  certifications?: { type: string; number: string }[]
  origin: string | null
  manufacturer: string | null
  categories: string[]
  options?: { name: string; price?: number; qty?: number }[][]
}

export interface ImageCollectResult {
  savedMainImages: string[]
  detailCapturePath: string | null
}

export interface Scraper {
  vendorKey: VendorKey

  collectList(
    page: Page,
    vendor: VendorConfig,
  ): Promise<{ name: string; url: string; price?: number; listThumbnail?: string }[]>

  extractBasicInfo(page: Page, vendorKey: VendorKey, vendor: VendorConfig): Promise<ExtractedBasicInfo>

  collectThumbnails(page: Page, vendor: VendorConfig, productDir?: string): Promise<string[]>

  collectDetailImage(page: Page, vendor: VendorConfig, productDir?: string): Promise<string | null>

  collectAdditionalInfo(page: Page, vendor: VendorConfig): Promise<{ label: string; value: string }[] | undefined>

  checkLoginRequired(page: Page): Promise<boolean>
}

export abstract class BaseScraper implements Scraper {
  abstract vendorKey: VendorKey

  abstract collectList(
    page: Page,
    vendor: VendorConfig,
  ): Promise<{ name: string; url: string; price?: number; listThumbnail?: string }[]>

  abstract extractBasicInfo(page: Page, vendorKey: VendorKey, vendor: VendorConfig): Promise<ExtractedBasicInfo>

  abstract collectThumbnails(page: Page, vendor: VendorConfig, productDir?: string): Promise<string[]>

  abstract collectDetailImage(page: Page, vendor: VendorConfig, productDir?: string): Promise<string | null>

  abstract collectAdditionalInfo(
    page: Page,
    vendor: VendorConfig,
  ): Promise<{ label: string; value: string }[] | undefined>

  abstract checkLoginRequired(page: Page): Promise<boolean>

  protected async downloadToBuffer(url: string): Promise<Buffer | null> {
    try {
      const res = await axios.get(url, { responseType: 'arraybuffer' })
      return Buffer.from(res.data)
    } catch {
      return null
    }
  }

  protected async saveJpg(buffer: Buffer, outPath: string, quality: number = 90): Promise<string> {
    await sharp(buffer).jpeg({ quality }).toFile(outPath)
    return outPath
  }

  /**
   * fixed 요소들을 임시로 숨기고 캡처 후 복원하는 헬퍼 함수
   */
  protected async screenshotWithHiddenFixedElements(
    page: Page,
    locator: any,
    screenshotOptions: { path: string },
  ): Promise<void> {
    // 타겟 요소로 스크롤하여 fixed 요소들이 동적으로 처리되도록 함
    await locator.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500) // 스크롤 완료 대기

    // fixed 요소들을 임시로 숨기기
    await page.evaluate(() => {
      const fixedElements = document.querySelectorAll('*')
      const hiddenElements: { element: HTMLElement; originalDisplay: string }[] = []

      for (const el of fixedElements) {
        const htmlEl = el as HTMLElement
        const computedStyle = window.getComputedStyle(htmlEl)
        if (computedStyle.position === 'fixed' || computedStyle.position === 'sticky') {
          hiddenElements.push({
            element: htmlEl,
            originalDisplay: htmlEl.style.display || '',
          })
          htmlEl.style.display = 'none'
        }
      }

      // 전역 변수로 저장해서 나중에 복원할 수 있도록 함
      ;(window as any).__hiddenFixedElements = hiddenElements
    })

    // 캡처 실행
    await locator.screenshot(screenshotOptions)
  }
}
