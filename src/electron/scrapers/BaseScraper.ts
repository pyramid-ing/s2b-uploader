import type { Page } from 'playwright'
import type { VendorConfig, VendorKey } from '../sourcing-config'

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
    targetUrl: string,
    vendor: VendorConfig,
  ): Promise<{ name: string; url: string; price?: number; listThumbnail?: string }[]>

  extractBasicInfo(page: Page, vendorKey: VendorKey, vendor: VendorConfig): Promise<ExtractedBasicInfo>

  collectImages(page: Page, vendor: VendorConfig, productDir?: string): Promise<ImageCollectResult>

  collectAdditionalInfo(page: Page, vendor: VendorConfig): Promise<{ label: string; value: string }[] | undefined>
}
