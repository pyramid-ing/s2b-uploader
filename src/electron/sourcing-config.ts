export enum VendorKey {
  도매꾹 = '도매꾹',
  도매의신 = '도매의신',
}

export interface VendorConfig {
  login_url?: string
  product_list_xpath: string
  product_thumbnail_list_xpath?: string
  product_name_list_xpath: string
  product_price_list_xpath?: string
  product_name_xpath: string
  product_code_xpath?: string
  price_xpath?: string
  price_xpaths?: string[]
  shipping_fee_xpath?: string
  min_purchase_xpath?: string
  image_usage_xpath?: string
  certification_xpath?: string
  hover_price?: boolean
  category_1_xpath?: string
  category_2_xpath?: string
  category_3_xpath?: string
  category_4_xpath?: string
  origin_xpath?: string
  manufacturer_xpath?: string
  fallback_manufacturer?: string
  option1_box_xpath?: string
  option2_box_xpath?: string
  option_xpath?: string[]
  option1_item_xpaths?: string
  option2_item_xpaths?: string
  fixed_spec_xpath?: string
  main_image_xpath?: string
  click_to_load_detail_image?: boolean
  detail_image_button_xpath?: string
  detail_image_xpath?: string
  detail_image_url_prefix?: string | null
  url_mode?: 'relative' | 'absolute'
  custom_url_prefix?: string | null
  additional_info_pairs?: { label_xpath: string; value_xpath: string }[]
  prefix?: string
}

export const VENDOR_CONFIG: Record<VendorKey, VendorConfig> = {
  [VendorKey.도매꾹]: {
    login_url: 'https://domeggook.com/ssl/member/mem_loginForm.php?back=L21haW4vaW5kZXgucGhw',
    product_list_xpath:
      '//li[starts-with(@id, "li")]/div[1]/a|//li[starts-with(@id, "li")]//a[contains(@href, "?from=lstGen") and contains(@class, "title")]',
    product_name_list_xpath:
      '//li[starts-with(@id, "li")]/div[1]/a|//li[starts-with(@id, "li")]//a[contains(@href, "?from=lstGen") and contains(@class, "title")]',
    product_name_xpath: '//*[@id="lInfoItemTitle"]',
    product_price_list_xpath:
      '//li[starts-with(@id, "li")]//span[contains(@class, "price") or contains(@class, "won") or contains(@class, "amt")]',
    product_code_xpath: '//*[@id="lInfoHeader"]/span[1]',
    price_xpath: '//tr[@class="lInfoAmt"]//div[@class="lItemPrice"]',
    price_xpaths: [
      // 1. 최저가 확인된 경우 (가장 우선)
      '//tr[@class="lInfoAmt"]//div[@class="lItemPrice"]',

      // 2. 즉시할인가 경우 - 할인가 첫 번째 값 (최소값)
      '//tr[@class="lInfoAmt"]//div[@class="lDiscountAmt"]/b[1]',

      // 3. 즉시할인가 경우 - 할인가 범위의 최소값
      '//tr[@class="lInfoAmt"]//div[@class="lDiscountAmt"]/b[contains(text(), "~")]/preceding-sibling::b[1]',

      // 4. 수량범위별 단가 - 가장 왼쪽 첫 번째 단가 (최소 수량 기준)
      '//tr[@class="lInfoAmt"]//table[@id="lAmtSectionTbl"]/tbody/tr[2]/td[@class="lSelected"]',
      '//tr[@class="lInfoAmt"]//table[@id="lAmtSectionTbl"]/tbody/tr[2]/td[1]',

      // 5. 정가 폴백
      '//tr[@class="lInfoAmt"]//div[@class="lNotDiscountAmt"]/b',

      // 6. 기존 XPath 폴백들
      '//*[@id="lInfoBody"]/div[2]/table/tbody/tr[1]/td/div[1]/div',
      '//*[@id="lAmtSectionTbl"]/tbody/tr[2]/td[1]',
    ],
    shipping_fee_xpath: '//*[@id="lInfoBody"]/div[2]/table/tbody/tr[3]/td/div[2]',
    min_purchase_xpath: '//*[@id="lInfoBody"]//tr[contains(@class, "lInfoPurchase")]//b',
    image_usage_xpath:
      '//tr[contains(@class, "lInfoViewSubTr1")]//td[contains(text(), "상세설명 이미지 사용여부")]/following-sibling::td//b',
    certification_xpath:
      '//div[contains(@class, "lTbl")]//label[contains(text(), "인증정보")]/following-sibling::div//ul[@id="lSafetyCert"]//li',
    hover_price: false,
    category_1_xpath: '//*[@id="lPathCat2"]',
    category_2_xpath: '//*[@id="lPathCat3"]/a',
    category_3_xpath: '//*[@id="lPathCat4"]/a',
    category_4_xpath: '//*[@id="lPathCat5"]/a',
    origin_xpath: '//*[@id="lInfoBody"]/div[2]/table/tbody/tr[5]/td',
    manufacturer_xpath: '//*[@id="lInfoViewItemInfoWrap"]/div[2]/div[2]/div[1]/div',
    option1_box_xpath: '//*[@id="lPayInfoBody"]/table/tbody/tr/td/div[1]/div/div/div[1]/button',
    option2_box_xpath: '//*[@id="lPayInfoBody"]/table/tbody/tr/td/div[1]/div/div[2]/div[1]/button',
    option_xpath: [
      '(//div[contains(@class, "pSelectUI")])[1]//ul[contains(@class, "pSelectUIMenu")]/li/button',
      '(//div[contains(@class, "pSelectUI")])[2]//ul[contains(@class, "pSelectUIMenu")]/li/button',
    ],
    fixed_spec_xpath: '//*[@id="lInfoBody"]/div[2]/table/tbody/tr[2]/td',
    main_image_xpath: '//*[@id="lThumbImg"]',
    product_thumbnail_list_xpath: '//li[starts-with(@id, "li")]//a[@class="thumb"]/img',
    click_to_load_detail_image: false,
    detail_image_button_xpath: '',
    detail_image_xpath: '//*[@id="lInfoViewItemContents"]',
    detail_image_url_prefix: null,
    url_mode: 'relative',
    custom_url_prefix: 'https://domeggook.com',
    additional_info_pairs: [
      {
        label_xpath: '//*[@id="lInfoViewItemInfoWrap"]/div[2]/div[1]/div[1]/label',
        value_xpath: '//*[@id="lInfoViewItemInfoWrap"]/div[2]/div[1]/div[1]/div',
      },
      {
        label_xpath: '//*[@id="lInfoViewItemInfoWrap"]/div[2]/div[2]/div[1]/label',
        value_xpath: '//*[@id="lInfoViewItemInfoWrap"]/div[2]/div[2]/div[1]/div',
      },
      {
        label_xpath: '//*[@id="lInfoViewItemInfoWrap"]/div[2]/div[2]/div[2]/label',
        value_xpath: '//*[@id="lInfoViewItemInfoWrap"]/div[2]/div[2]/div[2]/div',
      },
      // 추가 테이블 구조(반응형) 대응
      {
        label_xpath: '//*[@id="lInfoViewItemInfoWrap"]//div[contains(@class, "lTblCellLabel")]',
        value_xpath:
          '//*[@id="lInfoViewItemInfoWrap"]//div[contains(@class, "lTblCellLabel")]/following-sibling::div[contains(@class, "lTblCell")]',
      },
    ],
    prefix: 'DMK_',
  },
  [VendorKey.도매의신]: {
    login_url: 'https://www.domesin.com/index.html?p=member/login_form.html',
    // 상품 목록 페이지에서 상품 링크 추출
    product_list_xpath: '//*[@id="listfrm"]/table/tbody/tr/td/div[2]/a',
    // 상품 목록 페이지에서 상품명 추출
    product_name_list_xpath: '//*[@id="listfrm"]/table/tbody/tr/td/div[5]/a[@class="itemname"]',
    // 상품 상세 페이지에서 상품명 추출 (새로운 구조) - 상품명은 별도 영역에 있음
    product_name_xpath: '//h1[@class="item_title"] | //div[@class="item_title"] | //title',
    // 상품 목록 페이지에서 가격 추출
    product_price_list_xpath: '//*[@id="listfrm"]/table/tbody/tr/td/div[4]//span[@class="amount_text"]',
    // 상품 상세 페이지에서 상품코드 추출 (새로운 구조)
    product_code_xpath: '//table[@class="item_view_tb"]//tr[td[contains(text(), "상품코드")]]/td[2]',
    // 상품 목록 페이지에서 썸네일 이미지 추출
    product_thumbnail_list_xpath: '//*[@id="listfrm"]/table/tbody/tr/td/div[2]/a/img',
    // 카테고리 정보 추출 (새로운 구조)
    category_1_xpath: '//select[@name="cate1"]/option[@selected]',
    category_2_xpath: '//select[@name="cate2"]/option[@selected]',
    category_3_xpath: '//select[@name="cate3"]/option[@selected]',
    category_4_xpath: '//select[@name="cate4"]/option[@selected]',
    // 상품 상세 페이지에서 가격 추출 (새로운 구조)
    price_xpath: '//table[@class="item_view_tb"]//tr[td[contains(text(), "판매가")]]//span[@class="amount_text"]',
    // 배송비 정보 추출 (새로운 구조)
    shipping_fee_xpath: '//table[@class="item_view_tb"]//tr[td[contains(text(), "배송유형")]]/td[2]',
    // 원산지 정보 추출 (새로운 구조)
    origin_xpath: '//table[@class="item_view_tb"]//tr[td[contains(text(), "원산지")]]/td[2]',
    // 제조사 정보 추출 (새로운 구조)
    manufacturer_xpath: '//table[@class="item_view_tb"]//tr[td[contains(text(), "제조사")]]/td[2]',
    fallback_manufacturer: '(주)머니로드',
    // 옵션 정보 추출 - 새로운 구조에 맞게 수정 (색상, 두께, 사이즈 등)
    option1_box_xpath:
      '//table[@class="item_view_tb"]//tr[td[contains(text(), "색상") or contains(text(), "두께") or contains(text(), "옵션")]]/td[2]/select[@id="option_select_1"]',
    option1_item_xpaths:
      '//table[@class="item_view_tb"]//tr[td[contains(text(), "색상") or contains(text(), "두께") or contains(text(), "옵션")]]/td[2]/select[@id="option_select_1"]/option[position()>1]',
    option2_box_xpath:
      '//table[@class="item_view_tb"]//tr[td[contains(text(), "사이즈") or contains(text(), "옵션")]]/td[2]/select[@id="option_select_2"]',
    option2_item_xpaths:
      '//table[@class="item_view_tb"]//tr[td[contains(text(), "사이즈") or contains(text(), "옵션")]]/td[2]/select[@id="option_select_2"]/option[position()>1]',
    option_xpath: [
      '//table[@class="item_view_tb"]//tr[td[contains(text(), "색상") or contains(text(), "두께") or contains(text(), "옵션")]]/td[2]/select[@id="option_select_1"]/option[position()>1]',
      '//table[@class="item_view_tb"]//tr[td[contains(text(), "사이즈") or contains(text(), "옵션")]]/td[2]/select[@id="option_select_2"]/option[position()>1]',
    ],
    // 메인 이미지 추출 (새로운 구조)
    main_image_xpath: '//img[@id="mainimg"]',
    // 상세 이미지 영역 추출 (새로운 구조)
    detail_image_xpath: '//div[@id="alink1"]/following-sibling::div[1]',
    // 추가 정보 추출 (새로운 구조) - 더 정확한 매칭
    additional_info_pairs: [
      {
        label_xpath: '//table[@class="item_view_tb"]//tr[td[1] and td[2]]/td[1]',
        value_xpath: '//table[@class="item_view_tb"]//tr[td[1] and td[2]]/td[2]',
      },
      {
        label_xpath: '//table[@class="item_view_tb"]//tr[td[3] and td[4]]/td[3]',
        value_xpath: '//table[@class="item_view_tb"]//tr[td[3] and td[4]]/td[4]',
      },
    ],
    // URL 처리 설정
    url_mode: 'relative',
    custom_url_prefix: 'https://www.domesin.com',
    prefix: 'DOM_',
  },
}

export function normalizeUrl(url: string, vendor: VendorConfig): string {
  if (!url) return url
  if (vendor.url_mode === 'relative' && vendor.custom_url_prefix) {
    if (url.startsWith('/')) return `${vendor.custom_url_prefix}${url}`
  }
  return url
}
