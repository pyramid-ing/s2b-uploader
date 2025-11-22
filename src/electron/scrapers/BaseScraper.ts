import type { Page } from 'patchright'
import type { VendorConfig } from '../sourcing-config'
import { VendorKey } from '../sourcing-config'
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

  /**
   * 상세 이미지 캡처 전에 호출되는 공통 훅
   * - 기본 구현: 쿠팡일 때만 네트워크 아이들 상태까지 대기
   * - 필요 시 각 Scraper에서 override 가능
   */
  waitBeforeCapture(page: Page): Promise<void>
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

  public async waitBeforeCapture(page: Page): Promise<void> {
    // 기본 동작: 쿠팡 상세 페이지일 때만 네트워크 아이들까지 대기
    if (this.vendorKey === VendorKey.쿠팡) {
      await page.waitForLoadState('networkidle')
    }
  }

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
   * 세로로 매우 긴 영역을 여러 구간으로 나눠 캡처한 뒤 하나의 이미지로 이어붙이는 헬퍼 함수
   * - 크롬/크로미움의 단일 스크린샷 높이 제한(약 16k px)을 우회하기 위한 용도
   * - locator가 가리키는 영역 전체를 세로 방향으로 이어붙인 이미지를 outPath에 저장
   * - 페이지 전체 기준 좌표계(page top-left 기준)로 clip을 계산
   */
  protected async screenshotLongElement(
    page: Page,
    locator: any,
    outPath: string,
    segmentHeight: number = 4000,
  ): Promise<string> {
    // JPEG 포맷 한계(단일 축 최대 약 65535px)를 넘는 경우를 방어하기 위해
    // 먼저 원본 해상도로 합성한 뒤, 최종 캔버스 크기를 metadata로 다시 읽어서
    // 필요할 때만 리사이즈(축소)한다.
    const MAX_JPEG_DIMENSION = 65000

    const elementHandle = await locator.elementHandle()

    // 0) 페이지를 최상단으로 스크롤 (sticky 헤더/바 등이 최소 상태일 때 기준 좌표 계산)
    await page.evaluate(() => {
      window.scrollTo(0, 0)
    })
    await page.waitForTimeout(500)

    // 페이지 최상단 기준 좌표계로 요소 박스 계산
    const box = await page.evaluate(el => {
      const rect = (el as HTMLElement).getBoundingClientRect()
      const scrollX = window.scrollX
      const scrollY = window.scrollY
      return {
        x: rect.left + scrollX,
        y: rect.top + scrollY,
        width: rect.width,
        height: rect.height,
      }
    }, elementHandle)

    if (!box || box.width <= 0 || box.height <= 0) {
      await locator.screenshot({ path: outPath })
      return outPath
    }

    // 페이지 전체 크기 (scrollWidth/scrollHeight 기준)
    const pageSize = await page.evaluate(() => {
      const doc = document.documentElement
      return {
        width: doc.scrollWidth,
        height: doc.scrollHeight,
      }
    })

    const startX = Math.max(0, Math.floor(box.x))
    const startY = Math.max(0, Math.floor(box.y))
    const maxWidth = pageSize.width - startX
    const totalHeight = Math.min(box.height, pageSize.height - startY)
    const width = Math.min(Math.floor(box.width), Math.max(1, maxWidth))

    const buffers: Buffer[] = []
    let capturedHeight = 0

    while (capturedHeight < totalHeight) {
      const remaining = totalHeight - capturedHeight
      const currentHeight = Math.min(segmentHeight, remaining)
      if (currentHeight <= 0) break

      const buffer = (await page.screenshot({
        fullPage: true, // 페이지 전체 렌더링 기준으로 clip 적용
        clip: {
          x: startX,
          y: startY + capturedHeight,
          width,
          height: currentHeight,
        },
      })) as Buffer

      buffers.push(buffer)
      capturedHeight += currentHeight
    }

    // 세그먼트들을 하나의 긴 이미지로 합치기
    let offsetTop = 0
    let maxSegmentWidth = width
    const composites: { input: Buffer; top: number; left: number }[] = []

    for (const buf of buffers) {
      const meta = await sharp(buf).metadata()
      const h = meta.height ?? segmentHeight
      const w = meta.width ?? width

      composites.push({ input: buf, top: Math.round(offsetTop), left: 0 })
      offsetTop += h

      // 실제 버퍼들의 최대 폭 기준으로 캔버스 폭을 맞춰줌
      if (w > maxSegmentWidth) {
        maxSegmentWidth = w
      }
    }

    const totalOutHeight = Math.round(offsetTop) || Math.ceil(totalHeight)

    // 1차: 원본 해상도로 하나의 캔버스에 합성 (raw 버퍼 + info 반환)
    const base = sharp({
      create: {
        width: maxSegmentWidth,
        height: totalOutHeight,
        channels: 3,
        background: '#ffffff',
      },
    }).composite(composites)

    const { data: mergedBuffer, info } = await base.raw().toBuffer({ resolveWithObject: true })

    const mergedWidth = info.width
    const mergedHeight = info.height
    const channels = info.channels

    // 2차: 실제 최종 캔버스 크기(info 기반)를 사용해 JPEG 한계 초과 시 리사이즈
    let pipeline = sharp(mergedBuffer, {
      raw: {
        width: mergedWidth,
        height: mergedHeight,
        channels,
      },
    })

    if (mergedWidth > MAX_JPEG_DIMENSION || mergedHeight > MAX_JPEG_DIMENSION) {
      const widthScale = MAX_JPEG_DIMENSION / mergedWidth
      const heightScale = MAX_JPEG_DIMENSION / mergedHeight
      const scale = Math.min(widthScale, heightScale, 1)

      const targetWidth = Math.max(1, Math.floor(mergedWidth * scale))
      const targetHeight = Math.max(1, Math.floor(mergedHeight * scale))

      pipeline = pipeline.resize({
        width: targetWidth,
        height: targetHeight,
        fit: 'inside',
      })
    }

    await pipeline.jpeg({ quality: 90 }).toFile(outPath)

    return outPath
  }
}
