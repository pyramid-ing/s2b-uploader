import type { Page } from 'playwright'
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

  collectImages(page: Page, vendor: VendorConfig, productDir?: string): Promise<ImageCollectResult>

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

  abstract collectImages(page: Page, vendor: VendorConfig, productDir?: string): Promise<ImageCollectResult>

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
}
