export enum VendorKey {
  도매꾹 = '도매꾹',
  도매신 = '도매신',
}

export interface VendorConfig {
  login_url?: string
  product_list_xpath: string
  product_name_list_xpath: string
  product_price_list_xpath?: string
  product_name_xpath: string
  product_code_xpath?: string
  price_xpath?: string
  price_xpaths?: string[]
  shipping_fee_xpath?: string
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
  fallback_prefix?: string
  fallback_sheet?: string
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
    price_xpath: '//*[@id="lInfoBody"]/div[2]/table/tbody/tr[1]/td/div[1]/div',
    price_xpaths: [
      '//*[@id="lInfoBody"]/div[2]/table/tbody/tr[1]/td/div[1]/div',
      '//*[@id="lAmtSectionTbl"]/tbody/tr[2]/td[1]',
    ],
    shipping_fee_xpath: '//*[@id="lInfoBody"]/div[2]/table/tbody/tr[3]/td/div[2]',
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
    ],
    fallback_prefix: 'DMG',
    fallback_sheet: 'DMG',
  },
  [VendorKey.도매신]: {
    login_url: 'https://www.domesin.com/index.html?p=member/login_form.html',
    product_list_xpath: '//*[@id="listfrm"]/table/tbody/tr/td/div[2]/a',
    product_name_list_xpath: '//*[@id="listfrm"]/table/tbody/tr/td/div[5]/a',
    product_name_xpath: '/html/body/table[3]/tbody/tr/td/div[7]',
    product_price_list_xpath: '//*[@id="listfrm"]/table/tbody/tr/td/div[4]//span',
    product_code_xpath: '/html/body/table[3]/tbody/tr/td/table[1]/tbody/tr/td[2]/table/tbody/tr[1]/td[2]',
    category_1_xpath: '/html/body/table[3]/tbody/tr/td/div[1]/select[1]',
    category_2_xpath: '/html/body/table[3]/tbody/tr/td/div[1]/select[2]',
    category_3_xpath: '/html/body/table[3]/tbody/tr/td/div[1]/select[3]',
    category_4_xpath: '/html/body/table[3]/tbody/tr/td/div[1]/select[4]',
    price_xpath: '/html/body/table[3]/tbody/tr/td/table[1]/tbody/tr/td[2]/table/tbody/tr[2]/td[2]/span',
    shipping_fee_xpath:
      '/html/body/table[3]/tbody/tr/td/table[1]/tbody/tr/td[2]/table/tbody/tr[4]/td/table/tbody/tr[1]/td[2]',
    origin_xpath:
      '/html/body/table[3]/tbody/tr/td/table[1]/tbody/tr/td[2]/table/tbody/tr[4]/td/table/tbody/tr[4]/td[4]',
    manufacturer_xpath:
      '/html/body/table[3]/tbody/tr/td/table[1]/tbody/tr/td[2]/table/tbody/tr[4]/td/table/tbody/tr[4]/td[2]',
    fallback_manufacturer: '(주)머니로드',
    option1_box_xpath: '/html/body/table[3]/tbody/tr/td/table[1]/tbody/tr/td[2]/table/tbody/tr[11]/td[2]/select',
    option1_item_xpaths:
      '/html/body/table[3]/tbody/tr/td/table[1]/tbody/tr/td[2]/table/tbody/tr[11]/td[2]/select/option[position()>1]',
    option2_box_xpath: '/html/body/table[3]/tbody/tr/td/table[1]/tbody/tr/td[2]/table/tbody/tr[12]/td[2]/select',
    option2_item_xpaths:
      '/html/body/table[3]/tbody/tr/td/table[1]/tbody/tr/td[2]/table/tbody/tr[12]/td[2]/select/option[position()>1]',
    option_xpath: [
      '/html/body/table[3]/tbody/tr/td/table[1]/tbody/tr/td[2]/table/tbody/tr[11]/td[2]/select/option[position()>1]',
      '/html/body/table[3]/tbody/tr/td/table[1]/tbody/tr/td[2]/table/tbody/tr[12]/td[2]/select/option[position()>1]',
    ],
    main_image_xpath: '//*[@id="mainimg"]',
    detail_image_xpath: '/html/body/table[3]/tbody/tr/td/div[9]',
    additional_info_pairs: [
      {
        label_xpath:
          '/html/body/table[3]/tbody/tr/td/table[1]/tbody/tr/td[2]/table/tbody/tr[4]/td/table/tbody/tr[2]/td[1]',
        value_xpath:
          '/html/body/table[3]/tbody/tr/td/table[1]/tbody/tr/td[2]/table/tbody/tr[4]/td/table/tbody/tr[2]/td[2]',
      },
      {
        label_xpath:
          '/html/body/table[3]/tbody/tr/td/table[1]/tbody/tr/td[2]/table/tbody/tr[4]/td/table/tbody/tr[5]/td[1]',
        value_xpath:
          '/html/body/table[3]/tbody/tr/td/table[1]/tbody/tr/td[2]/table/tbody/tr[4]/td/table/tbody/tr[5]/td[2]',
      },
    ],
    fallback_prefix: 'DMS',
    fallback_sheet: 'DMS',
  },
}

export function normalizeUrl(url: string, vendor: VendorConfig): string {
  if (!url) return url
  if (vendor.url_mode === 'relative' && vendor.custom_url_prefix) {
    if (url.startsWith('/')) return `${vendor.custom_url_prefix}${url}`
  }
  return url
}
