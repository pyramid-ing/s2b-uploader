import type { Product } from '../types/product'
import { createDefaultProduct } from '../types/product'

/**
 * Excel headers in the exact order requested by user for Download.
 */
export const EXCEL_HEADERS = [
  '카테고리1',
  '카테고리2',
  '카테고리3',
  '등록구분',
  '물품명',
  '규격',
  '모델명',
  '제시금액',
  '제조사',
  '소재/재질',
  '재고수량',
  '판매단위',
  '보증기간',
  '납품가능기간',
  '견적서 유효기간',
  '배송비종류',
  '배송비',
  '반품배송비',
  '묶음배송여부',
  '제주배송여부',
  '제주추가배송비',
  '상세설명HTML',
  '기본이미지1',
  '기본이미지2',
  '추가이미지1',
  '추가이미지2',
  '상세이미지',
  '원산지구분',
  '국내원산지',
  '해외원산지',
  'G2B 물품목록번호',
  '배송방법',
  '배송지역',
  '정격전압/소비전력',
  '크기및무게',
  '동일모델출시년월',
  '냉난방면적',
  '제품구성',
  '안전표시',
  '용량',
  '주요사양',
  '소비기한선택',
  '소비기한입력',
  '어린이하차확인장치타입',
  '어린이하차확인장치인증번호',
  '어린이하차확인장치첨부파일',
  '안전확인대상타입',
  '안전확인대상신고번호',
  '안전확인대상첨부파일',
  '조달청계약여부',
  '계약시작일',
  '계약종료일',
  '전화번호',
  '제조사 A/S전화번호',
  '과세여부',
  '어린이제품KC유형',
  '어린이제품KC인증번호',
  '어린이제품KC성적서',
  '전기용품KC유형',
  '전기용품KC인증번호',
  '전기용품KC성적서',
  '생활용품KC유형',
  '생활용품KC인증번호',
  '생활용품KC성적서',
  '방송통신KC유형',
  '방송통신KC인증번호',
  '방송통신KC성적서',
  '여성기업',
  '장애인기업',
  '창업기업',
  '장애인표준사업장',
  '중증장애인생산품',
  '사회적협동조합',
  '우수재활용제품',
  '환경표지',
  '저탄소제품',
  'SW품질인증',
  '신제품인증(NEP)',
  '신제품인증(NET)',
  '녹색기술인증제품',
  '성능인증제품(EPC)',
  '우수조달제품',
  '마을기업',
  '자활기업',
  '협동조합',
  '예비사회적기업',
  '승인관련 요청사항',
  '나라장터등록여부',
  '나라장터등록가격',
  '타사이트등록여부',
  '타사이트등록가격',
  '사이트명',
  '사이트주소',
] as const

/**
 * Mapping configuration: Product Key -> Array of possible Excel column names.
 * The first item in the array is the default header for export (Download).
 */
export const FIELD_MAPPING: Record<keyof Product, string[]> = {
  id: [],
  name: ['물품명', 'name', 'goodsName'],
  spec: ['규격', 'spec'],
  modelName: ['모델명', 'modelName'],
  manufacturer: ['제조사', 'manufacturer', 'factory'],
  material: ['소재/재질', 'material'],
  salesUnit: ['판매단위', 'salesUnit'],
  stockQuantity: ['재고수량', 'stockQuantity', 'remainQnt', 'quantity'],
  price: ['제시금액', 'price', 'estimateAmt', '가격'],
  taxType: ['과세여부', 'taxType'],
  saleType: ['등록구분', 'saleType', 'saleTypeText'],
  warranty: ['보증기간', 'warranty', 'assure'],
  category1: ['카테고리1', 'category1'],
  category2: ['카테고리2', 'category2'],
  category3: ['카테고리3', 'category3'],
  g2bNumber: ['G2B 물품목록번호', 'g2bNumber'],
  deliveryPeriod: ['납품가능기간', 'deliveryPeriod', 'deliveryLimitText'],
  quoteValidity: ['견적서 유효기간', 'quoteValidity', 'estimateValidity'],
  deliveryFeeType: ['배송비종류', 'deliveryFeeType', 'deliveryFeeKindText'],
  deliveryFee: ['배송비', 'deliveryFee'],
  returnFee: ['반품배송비', 'returnFee'],
  bundleShipping: ['묶음배송여부', 'bundleShipping', 'deliveryGroupYn'],
  jejuShipping: ['제주배송여부', 'jejuShipping', 'jejuDeliveryYn'],
  jejuAdditionalFee: ['제주추가배송비', 'jejuAdditionalFee', 'jejuDeliveryFee'],
  deliveryMethod: ['배송방법', 'deliveryMethod'],
  deliveryAreas: ['배송지역', 'deliveryAreas'],
  image1: ['기본이미지1', 'image1'],
  image2: ['기본이미지2', 'image2'],
  addImage1: ['추가이미지1', 'addImage1'],
  addImage2: ['추가이미지2', 'addImage2'],
  detailImage: ['상세이미지', 'detailImage'],
  detailHtml: ['상세설명HTML', 'detailHtml'],
  originType: ['원산지구분', 'originType'],
  originLocal: ['국내원산지', 'originLocal'],
  originForeign: ['해외원산지', 'originForeign'],
  kidsKcType: ['어린이제품KC유형', 'kidsKcType'],
  kidsKcCertId: ['어린이제품KC인증번호', 'kidsKcCertId'],
  kidsKcFile: ['어린이제품KC성적서', 'kidsKcFile'],
  elecKcType: ['전기용품KC유형', 'elecKcType'],
  elecKcCertId: ['전기용품KC인증번호', 'elecKcCertId'],
  elecKcFile: ['전기용품KC성적서', 'elecKcFile'],
  dailyKcType: ['생활용품KC유형', 'dailyKcType'],
  dailyKcCertId: ['생활용품KC인증번호', 'dailyKcCertId'],
  dailyKcFile: ['생활용품KC성적서', 'dailyKcFile'],
  broadcastingKcType: ['방송통신KC유형', 'broadcastingKcType'],
  broadcastingKcCertId: ['방송통신KC인증번호', 'broadcastingKcCertId'],
  broadcastingKcFile: ['방송통신KC성적서', 'broadcastingKcFile'],
  childExitCheckerKcType: ['어린이하차확인장치타입', 'childExitCheckerKcType'],
  childExitCheckerKcCertId: ['어린이하차확인장치인증번호', 'childExitCheckerKcCertId'],
  childExitCheckerKcFile: ['어린이하차확인장치첨부파일', 'childExitCheckerKcFile'],
  safetyCheckKcType: ['안전확인대상타입', 'safetyCheckKcType'],
  safetyCheckKcCertId: ['안전확인대상신고번호', 'safetyCheckKcCertId'],
  safetyCheckKcFile: ['안전확인대상첨부파일', 'safetyCheckKcFile'],
  consumptionPeriodType: ['소비기한선택', 'consumptionPeriodType'],
  consumptionPeriodValue: ['소비기한입력', 'consumptionPeriodValue'],
  ratedPower: ['정격전압/소비전력', 'ratedPower', 'selPower'],
  sizeAndWeight: ['크기및무게', 'sizeAndWeight', 'selWeight'],
  sameModelDate: ['동일모델출시년월', 'sameModelDate', 'selSameDate'],
  coolingHeatingArea: ['냉난방면적', 'coolingHeatingArea', 'selArea'],
  productComposition: ['제품구성', 'productComposition', 'selProduct'],
  safetyMark: ['안전표시', 'safetyMark', 'selSafety'],
  capacity: ['용량', 'capacity', 'selCapacity'],
  mainSpec: ['주요사양', 'mainSpec', 'selSpecification'],
  certWoman: ['여성기업', 'certWoman', 'womanCert'],
  certDisabledCompany: ['장애인기업', 'certDisabledCompany', 'disabledCompanyCert'],
  certFoundation: ['창업기업', 'certFoundation', 'foundationCert'],
  certDisabled: ['장애인표준사업장', 'certDisabled', 'disabledCert'],
  certSevereDisabled: ['중증장애인생산품', 'certSevereDisabled', 'severalCert'],
  certCooperation: ['협동조합', 'certCooperation', 'cooperationCert'],
  certSociety: ['우수재활용제품', 'certSociety', 'societyCert'],
  certRecycle: ['환경표지', 'certRecycle', 'recycleCert'],
  certEnvironment: ['저탄소제품', 'certEnvironment', 'environmentCert'],
  certLowCarbon: ['SW품질인증', 'certLowCarbon', 'lowCarbonCert'],
  certSwQuality: ['신제품인증(NEP)', 'certSwQuality', 'swQualityCert'],
  certNep: ['신제품인증(NET)', 'certNep', 'nepCert'],
  certNet: ['녹색기술인증제품', 'certNet', 'netCert'],
  certGreenProduct: ['성능인증제품(EPC)', 'certGreenProduct', 'greenProductCert'],
  certEpc: ['우수조달제품', 'certEpc', 'epcCert'],
  certProcure: ['마을기업', 'certProcure', 'procureCert'],
  certTown: ['자활기업', 'certTown', 'seoulTownCert'],
  certSelf: ['예비사회적기업', 'certSelf', 'seoulSelfCert'],
  certCollaboration: ['사회적협동조합', 'certCollaboration', 'seoulCollaborationCert'],
  certReserve: ['여성기업', 'certReserve', 'seoulReserveCert'],
  ppsContractYn: ['조달청계약여부', 'ppsContractYn'],
  ppsContractStartDate: ['계약시작일', 'ppsContractStartDate'],
  ppsContractEndDate: ['계약종료일', 'ppsContractEndDate'],
  phone: ['전화번호', 'phone', 'asTelephone1'],
  asPhone: ['제조사 A/S전화번호', 'asPhone', 'asTelephone2'],
  naraRegistered: ['나라장터등록여부', 'naraRegistered', 'naraRegisterYn'],
  naraPrice: ['나라장터등록가격', 'naraPrice', 'naraAmt'],
  otherSiteName: ['사이트명', 'otherSiteName', 'siteName'],
  otherSiteUrl: ['사이트주소', 'otherSiteUrl', 'siteUrl'],
  otherSiteRegistered: ['타사이트등록여부', 'otherSiteRegistered', 'otherSiteRegisterYn'],
  otherSitePrice: ['타사이트등록가격', 'otherSitePrice', 'otherSiteAmt'],
  addressCode: [],
  address: [],
  addressDetail: [],
  approvalRequest: ['승인관련 요청사항', 'approvalRequest'],
  sourceUrl: [],
  listThumbnail: [],
  result: [],
}

/**
 * For Download: Creates a row object with keys in order of EXCEL_HEADERS
 */
export function productToMappedExcelRow(product: Product) {
  const row: any = {
    productId: product.id,
  }

  for (const header of EXCEL_HEADERS) {
    const key = Object.keys(FIELD_MAPPING).find(k => FIELD_MAPPING[k as keyof Product][0] === header) as keyof Product
    if (key) {
      const value = product[key]
      if (typeof value === 'boolean') {
        row[header] = value ? 'Y' : 'N'
      } else if (key === 'deliveryAreas' && Array.isArray(value)) {
        row[header] = value.join(',')
      } else {
        row[header] = value ?? ''
      }
    } else {
      row[header as any] = ''
    }
  }

  return row
}

/**
 * For Registration or Modify: Maps an Excel row to a Product object.
 */
export function parseExcelRowToProduct(row: any, baseProduct?: Product): Product {
  const product = baseProduct ? { ...baseProduct } : createDefaultProduct()

  for (const key in FIELD_MAPPING) {
    const possibleHeaders = FIELD_MAPPING[key as keyof Product]
    if (!possibleHeaders || possibleHeaders.length === 0) continue

    const foundHeader = possibleHeaders.find(h => row[h] !== undefined && row[h] !== null)

    if (foundHeader !== undefined) {
      const rawValue = row[foundHeader]
      if (rawValue === undefined || rawValue === null || (typeof rawValue === 'string' && rawValue.trim() === '')) {
        continue
      }

      const keyType = typeof product[key as keyof Product]

      if (keyType === 'boolean') {
        // @ts-ignore
        product[key] = String(rawValue).trim().toUpperCase() === 'Y' || rawValue === true
      } else if (key === 'deliveryAreas') {
        // @ts-ignore
        product[key] = String(rawValue)
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      } else if (keyType === 'number') {
        const num = parseFloat(String(rawValue).replace(/[^0-9.-]/g, ''))
        // @ts-ignore
        product[key] = isNaN(num) ? 0 : num
      } else {
        // @ts-ignore
        product[key] = String(rawValue).trim()
      }
    }
  }

  return product
}
