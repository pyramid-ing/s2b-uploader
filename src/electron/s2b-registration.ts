import path from 'node:path'
import * as fsSync from 'fs'
import * as fs from 'fs'
import dayjs from 'dayjs'
import axios from 'axios'
import crypto from 'crypto'
import FileType from 'file-type'
import sharp from 'sharp'
import { S2BBase } from './s2b-base'
import { ExcelRegistrationData, ExcelRawData } from './types/excel'

type SaleType = '물품' | '용역'

const SALE_TYPE_MAP: Record<SaleType, string> = { 물품: '1', 용역: '3' }

const DELIVERY_TYPE_MAP: Record<'무료' | '유료' | '조건부무료', string> = { 무료: '1', 유료: '2', 조건부무료: '3' }

export class S2BRegistration extends S2BBase {
  private baseFilePath: string
  private settings: any
  private dialogErrorMessage: string | null = null
  private imageOptimize: boolean = false

  constructor(
    baseImagePath: string,
    logCallback: (message: string, level?: 'info' | 'warning' | 'error') => void,
    headless: boolean = false,
    settings?: any,
  ) {
    super(logCallback, headless)
    this.baseFilePath = baseImagePath
    this.settings = settings
  }

  public setImageOptimize(optimize: boolean): void {
    this.imageOptimize = optimize
  }

  public async launch(): Promise<void> {
    await super.launch()
    this._setupRegistrationPopupHandlers()
  }

  public async registerProduct(data: ExcelRegistrationData): Promise<void> {
    if (!this.page) throw new Error('브라우저가 초기화되지 않았습니다.')
    this.dialogErrorMessage = null

    const handleRegistrationDialog = async (dialog: any) => {
      const message = dialog.message()
      this._log(`Alert 메시지: ${message}`, 'info')

      switch (dialog.type()) {
        case 'alert':
          if (message.includes('S2B의 "견적정보 등록"은 지방자치단체를 당사자로 하는 계약에 관한 법률 시행령 제30조')) {
            await dialog.accept()
          } else if (
            message.includes('등록대기 상태로 변경되었으며') ||
            message.includes('식품을 등록 할 경우 소비기한은 필수 입력 값입니다')
          ) {
            await dialog.accept()
          } else {
            this.dialogErrorMessage = message
            await dialog.dismiss()
          }
          break
        case 'confirm':
          await dialog.dismiss()
          break
      }
    }
    this.page.on('dialog', handleRegistrationDialog)

    this._log(`상품 등록 시작: ${data.goodsName}`, 'info')
    try {
      await this.page.goto('https://www.s2b.kr/S2BNVendor/rema100.do?forwardName=goRegistView')
      await this.page.waitForSelector('select[name="sale_type"]', { timeout: 10000 })
      this._log('상품 등록 폼 로드 완료', 'info')

      try {
        await this.page.waitForSelector('article.popup.alert', { timeout: 5000 })
        await this.page.evaluate(() => {
          const closeButton = document.querySelector('span.btn_popclose a') as HTMLElement
          if (closeButton) closeButton.click()
        })
      } catch {}

      await this._setBasicInfo(data)
      await this._uploadAllImages(data)
      await this._selectCategory(data)
      await this._setCategoryDetails(data)
      await this._setCertifications(data)
      await this._setKcCertifications(data)
      await this._setOtherAttachments(data)
      await this._setG2bInformation(data.g2bNumber)
      await this._setDeliveryInfo(data)
      await this._setDeliveryFee(data)
      await this._setDetailHtml(data.detailHtml)
      await this._setNaraInformation(data)
      await this._setOtherSiteInformation(data)
      await this._setSalesUnitAndTax(data)
      await this._setReturnExchangeFee(data)
      await this._setAsInfo(data)
      await this._setOriginInfo(data)
      await this._submitRegistration()

      if (this.dialogErrorMessage) {
        this._log(`등록 중 에러 발생: ${this.dialogErrorMessage}`, 'error')
        throw new Error(this.dialogErrorMessage)
      }
      this._log(`✅ 상품 등록 성공: ${data.goodsName}`, 'info')
    } catch (error: any) {
      this._log(`상품 등록 실패: ${error.message}`, 'error')
      throw error
    } finally {
      this.page.off('dialog', handleRegistrationDialog)
    }
  }

  public async readExcelFile(filePath: string): Promise<ExcelRegistrationData[]> {
    this._log('엑셀 파일 스트림 읽기 시작', 'info')

    const stream = fs.createReadStream(filePath)
    const rawData = await this._readExcelStream(stream)

    return rawData.map((row: ExcelRawData) => {
      const rawSaleType = row['등록구분']?.toString() || '물품'
      const saleTypeText = this._validateSaleType(rawSaleType)

      const rawDeliveryFeeType = row['배송비종류']?.toString() || '무료'
      const deliveryFeeKindText = this._validateDeliveryFeeType(rawDeliveryFeeType)

      const rawDeliveryLimit = row['납품가능기간']?.toString() || '7일'
      const deliveryLimitText = this._validateDeliveryLimit(rawDeliveryLimit)

      return {
        goodsName: row['물품명']?.toString() || '',
        spec: row['규격']?.toString() || '',
        modelName: row['모델명']?.toString() || '',
        estimateAmt: row['제시금액']?.toString() || '',
        factory: row['제조사']?.toString() || '',
        material: row['소재/재질']?.toString() || '',
        remainQnt: row['재고수량']?.toString() || '',
        assure: row['보증기간']?.toString() || '1년',
        returnFee: row['반품배송비']?.toString() || '',
        exchangeFee: row['교환배송비']?.toString() || '',
        estimateValidity: row['견적서 유효기간']?.toString() || '30일',
        g2bNumber: row['G2B 물품목록번호']?.toString(),
        saleTypeText,
        saleType: SALE_TYPE_MAP[saleTypeText],
        category1: row['카테고리1']?.toString().trim() || '',
        category2: row['카테고리2']?.toString().trim() || '',
        category3: row['카테고리3']?.toString().trim() || '',
        deliveryFeeKindText,
        deliveryFeeKind: DELIVERY_TYPE_MAP[deliveryFeeKindText],
        deliveryFee: row['배송비']?.toString() || '',
        deliveryGroupYn: row['묶음배송여부']?.toString() || 'Y',
        jejuDeliveryYn: row['제주배송여부']?.toString() || 'N',
        jejuDeliveryFee: row['제주추가배송비']?.toString(),
        kidsKcType: this._validateKcType(row['어린이제품KC유형']?.toString().trim()) || 'N',
        kidsKcCertId: row['어린이제품KC인증번호']?.toString(),
        kidsKcFile: row['어린이제품KC성적서']?.toString(),
        elecKcType: this._validateKcType(row['전기용품KC유형']?.toString().trim()) || 'N',
        elecKcCertId: row['전기용품KC인증번호']?.toString(),
        elecKcFile: row['전기용품KC성적서']?.toString(),
        dailyKcType: this._validateKcType(row['생활용품KC유형']?.toString().trim()) || 'N',
        dailyKcCertId: row['생활용품KC인증번호']?.toString(),
        dailyKcFile: row['생활용품KC성적서']?.toString(),
        broadcastingKcType: this._validateKcType(row['방송통신KC유형']?.toString().trim()) || 'N',
        broadcastingKcCertId: row['방송통신KC인증번호']?.toString(),
        broadcastingKcFile: row['방송통신KC성적서']?.toString(),
        image1: row['기본이미지1']?.toString(),
        image2: row['기본이미지2']?.toString(),
        addImage1: row['추가이미지1']?.toString(),
        addImage2: row['추가이미지2']?.toString(),
        detailImage: row['상세이미지']?.toString(),
        detailHtml: row['상세설명HTML']?.toString() || '',
        deliveryLimitText,
        deliveryLimit: this._getDeliveryLimitCode(deliveryLimitText),
        originType: row['원산지구분']?.toString() || '국내',
        originLocal: row['국내원산지']?.toString() || '서울',
        originForeign: row['해외원산지']?.toString() || '',
        salesUnit: row['판매단위']?.toString() || '개',
        taxType: row['과세여부']?.toString() || '과세(세금계산서)',
        womanCert: row['여성기업']?.toString() || 'N',
        disabledCompanyCert: row['장애인기업']?.toString() || 'N',
        foundationCert: row['창업기업']?.toString() || 'N',
        disabledCert: row['장애인표준사업장']?.toString() || 'N',
        severalCert: row['중증장애인생산품']?.toString() || 'N',
        cooperationCert: row['사회적협동조합']?.toString() || 'N',
        societyCert: row['우수재활용제품']?.toString() || 'N',
        recycleCert: row['우수재활용제품']?.toString() || 'N',
        environmentCert: row['환경표지']?.toString() || 'N',
        lowCarbonCert: row['저탄소제품']?.toString() || 'N',
        swQualityCert: row['SW품질인증']?.toString() || 'N',
        nepCert: row['신제품인증(NEP)']?.toString() || 'N',
        netCert: row['신제품인증(NET)']?.toString() || 'N',
        greenProductCert: row['녹색기술인증제품']?.toString() || 'N',
        epcCert: row['성능인증제품(EPC)']?.toString() || 'N',
        procureCert: row['우수조달제품']?.toString() || 'N',
        seoulTownCert: row['마을기업']?.toString() || 'N',
        seoulSelfCert: row['자활기업']?.toString() || 'N',
        seoulCollaborationCert: row['협동조합']?.toString() || 'N',
        seoulReserveCert: row['예비사회적기업']?.toString() || 'N',
        childExitCheckerKcType: row['어린이하차확인장치타입']?.toString() || 'N',
        childExitCheckerKcCertId: row['어린이하차확인장치인증번호']?.toString(),
        childExitCheckerKcFile: row['어린이하차확인장치첨부파일']?.toString(),
        safetyCheckKcType: row['안전확인대상타입']?.toString() || 'N',
        safetyCheckKcCertId: row['안전확인대상신고번호']?.toString(),
        safetyCheckKcFile: row['안전확인대상첨부파일']?.toString(),
        naraRegisterYn: row['나라장터등록여부']?.toString().trim() || 'N',
        naraAmt: row['나라장터등록가격']?.toString().trim() || '',
        siteName: row['사이트명']?.toString().trim() || '',
        siteUrl: row['사이트주소']?.toString().trim() || '',
        otherSiteRegisterYn: row['타사이트등록여부']?.toString().trim() || 'N',
        otherSiteAmt: row['타사이트등록가격']?.toString().trim() || '',
        deliveryMethod: this._getDeliveryMethodCode(row['배송방법']?.toString().trim()) || '1',
        deliveryAreas: row['배송지역']?.split(',').map((area: string) => area.trim()) || [],
        asTelephone1: row['전화번호']?.toString() || '',
        asTelephone2: row['제조사 A/S전화번호']?.toString() || '',
        addressCode: row['도로명 코드']?.toString() || '',
        address: row['주소']?.toString() || '',
        addressDetail: row['나머지 주소']?.toString() || '',
        ppsContractYn: row['조달청계약여부']?.toString() || 'N',
        ppsContractStartDate: row['계약시작일'] ? dayjs(row['계약시작일'].toString()).format('YYYYMMDD') : '',
        ppsContractEndDate: row['계약종료일'] ? dayjs(row['계약종료일'].toString()).format('YYYYMMDD') : '',
        selPower: row['정격전압/소비전력']?.toString() || '',
        selWeight: row['크기및무게']?.toString() || '',
        selSameDate: row['동일모델출시년월']?.toString() || '',
        selArea: row['냉난방면적']?.toString() || '',
        selProduct: row['제품구성']?.toString() || '',
        selSafety: row['안전표시']?.toString() || '',
        selCapacity: row['용량']?.toString() || '',
        selSpecification: row['주요사양']?.toString() || '',
        validateRadio: this._getConsumptionPeriodCode(row['소비기한선택']) || '',
        fValidate: row['소비기한입력']?.toString(),
        approvalRequest: row['승인관련 요청사항']?.toString() || '',
      } as ExcelRegistrationData
    })
  }

  private _setupRegistrationPopupHandlers(): void {
    if (!this.context) return
    this.context.on('page', async newPage => {
      const url = newPage.url()
      if (url.includes('certificateInfo_pop.jsp')) {
        await newPage.close()
      } else if (url.includes('mygPreviewerThumb.jsp')) {
        try {
          await newPage.waitForSelector('#MpreviewerImg', { timeout: 20000 })
          const resizeStatus = await newPage.evaluate(() => {
            const iframe = document.querySelector('#MpreviewerImg iframe') as HTMLIFrameElement
            if (!iframe) return null
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
            if (!iframeDoc) return null
            const statusElement = iframeDoc.querySelector('#reSizeStatus')
            return statusElement?.textContent?.trim() || null
          })
          if (resizeStatus === 'pass') {
            await newPage.close()
          }
        } catch {
          await newPage.close()
        }
      } else if (url.includes('rema100_statusWaitPopup.jsp')) {
        try {
          await newPage.waitForSelector('[onclick^="fnConfirm("]', { timeout: 5000 })
          await newPage.evaluate(() => {
            const confirmButton = document.querySelector('[onclick^="fnConfirm(\'1\')"]')
            if (confirmButton instanceof HTMLElement) confirmButton.click()
          })
        } catch {
          await newPage.close()
        }
      }
    })
  }

  private async _setBasicInfo(data: ExcelRegistrationData): Promise<void> {
    await this.page!.selectOption('select[name="sale_type"]', SALE_TYPE_MAP[data.saleTypeText] || '1')
    await this.page!.fill('input[name="f_goods_name"]', data.goodsName)
    await this.page!.fill('input[name="f_size"]', data.spec)
    await this.page!.evaluate(() => {
      const el = document.querySelector('input[name="f_assure"]') as HTMLInputElement
      if (el) el.value = ''
    })
    await this.page!.fill('input[name="f_assure"]', data.assure)
    if (data.modelName) {
      await this.page!.check('input[name="f_model_yn"][value="N"]')
      await this.page!.fill('input[name="f_model"]', data.modelName)
    }
    await this.page!.fill('input[name="f_estimate_amt"]', data.estimateAmt)
    await this.page!.fill('input[name="f_factory"]', data.factory)
    await this.page!.fill('input[name="f_material"]', data.material)
    await this.page!.fill('input[name="f_remain_qnt"]', data.remainQnt)
    await this.page!.evaluate((code: string) => {
      const select = document.querySelector('select[name="f_delivery_limit"]') as HTMLSelectElement
      if (select) {
        select.value = code
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, data.deliveryLimit)
    if (data.approvalRequest) {
      await this.page!.fill('input[name="f_memo"]', data.approvalRequest)
    }
    if (data.estimateValidity) {
      const validityMap: { [key: string]: string } = {
        '30일': 'ZD000004',
        '15일': 'ZD000003',
        '10일': 'ZD000002',
        '7일': 'ZD000001',
      }
      const optionValue = validityMap[data.estimateValidity]
      if (optionValue) await this.page!.selectOption('select[name="f_estimate_validate_code"]', optionValue)
    }
  }

  private async _setG2bInformation(g2bNumber: string): Promise<void> {
    if (!g2bNumber) return
    await this.page!.fill('input[name="f_uid2"]', g2bNumber)
    await this.page!.click('a[href^="javascript:fnCheckApiG2B();"]')
    await this.page!.waitForSelector('#apiData', { timeout: 10000 })
  }

  private async _setReturnExchangeFee(data: ExcelRegistrationData): Promise<void> {
    if (data.returnFee) {
      await this.page!.evaluate(() => {
        const el = document.querySelector('input[name="f_return_fee"]') as HTMLInputElement
        if (el) el.value = ''
      })
      await this.page!.fill('input[name="f_return_fee"]', data.returnFee)
    }
    if (data.exchangeFee) {
      await this.page!.evaluate(() => {
        const el = document.querySelector('input[name="f_exchange_fee"]') as HTMLInputElement
        if (el) el.value = ''
      })
      await this.page!.fill('input[name="f_exchange_fee"]', data.exchangeFee)
    }
  }

  private async _setOriginInfo(data: ExcelRegistrationData): Promise<void> {
    const HOME_DIVI_MAP: Record<'국내' | '국외', string> = { 국내: '1', 국외: '2' }
    const homeValue = HOME_DIVI_MAP[data.originType] || '1'
    await this.page!.check(`input[name="f_home_divi"][value="${homeValue}"]`)
    if (data.originType === '국내' && data.originLocal) {
      await this.page!.evaluate(localName => {
        const select = document.querySelector('#select_home_01') as HTMLSelectElement
        const options = Array.from(select.options)
        const option = options.find(opt => opt.text.includes(localName))
        if (option) {
          select.value = option.value
          select.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }, data.originLocal)
    } else if (data.originType === '국외' && data.originForeign) {
      await this.page!.evaluate(foreignName => {
        const select = document.querySelector('#select_home_02') as HTMLSelectElement
        const options = Array.from(select.options)
        const option = options.find(opt => opt.text.includes(foreignName))
        if (option) {
          select.value = option.value
          select.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }, data.originForeign)
    }
  }

  private async _setDeliveryFee(data: ExcelRegistrationData): Promise<void> {
    const deliveryType = DELIVERY_TYPE_MAP[data.deliveryFeeKindText] || '1'
    await this.page!.check(`input[name="f_delivery_fee_kind"][value="${deliveryType}"]`)
    if (deliveryType === '2' && data.deliveryFee) {
      await this.page!.fill('input[name="f_delivery_fee1"]', data.deliveryFee)
    }
    await this.page!.check(`input[name="f_delivery_group_yn"][value="${data.deliveryGroupYn}"]`)
    if (data.jejuDeliveryYn === 'Y') {
      await this.page!.check('input[name="f_jeju_delivery_yn"]')
      if (data.jejuDeliveryFee) await this.page!.fill('input[name="f_jeju_delivery_fee"]', data.jejuDeliveryFee)
    }
  }

  private async _setSalesUnitAndTax(data: ExcelRegistrationData): Promise<void> {
    await this.page!.evaluate(unitText => {
      const select = document.querySelector('select[name="f_credit"]') as HTMLSelectElement
      const options = Array.from(select.options)
      const option = options.find(opt => opt.text === unitText)
      if (option) {
        select.value = option.value
        select.dispatchEvent(new Event('change', { bubbles: true }))
      } else {
        throw new Error(`판매단위 "${unitText}"를 찾을 수 없습니다.`)
      }
    }, data.salesUnit)
    await this.page!.evaluate(taxText => {
      const select = document.querySelector('select[name="f_tax_method"]') as HTMLSelectElement
      const options = Array.from(select.options)
      const option = options.find(opt => opt.text === taxText)
      if (option) {
        select.value = option.value
        select.dispatchEvent(new Event('change', { bubbles: true }))
      } else {
        throw new Error(`과세유형 "${taxText}"를 찾을 수 없습니다.`)
      }
    }, data.taxType)
  }

  private async _selectCategory(data: ExcelRegistrationData): Promise<void> {
    await this.page!.selectOption('select[name="sale_type"]', SALE_TYPE_MAP[data.saleTypeText] || '1')
    await this.page!.evaluate(categoryText => {
      const select = document.querySelector('select[name="f_category_code1"]') as HTMLSelectElement
      const options = Array.from(select.options)
      const option = options.find(opt => opt.text === categoryText)
      if (option) {
        select.value = option.value
        const event = new Event('change', { bubbles: true })
        select.dispatchEvent(event)
      }
    }, data.category1)
    await this.page!.evaluate(categoryText => {
      const select = document.querySelector('select[name="f_category_code2"]') as HTMLSelectElement
      const options = Array.from(select.options)
      const option = options.find(opt => opt.text === categoryText)
      if (option) {
        select.value = option.value
        const event = new Event('change', { bubbles: true })
        select.dispatchEvent(event)
      }
    }, data.category2)
    await this.page!.evaluate(categoryText => {
      const select = document.querySelector('select[name="f_category_code3"]') as HTMLSelectElement
      const options = Array.from(select.options)
      const option = options.find(opt => opt.text === categoryText)
      if (option) {
        select.value = option.value
        const event = new Event('change', { bubbles: true })
        select.dispatchEvent(event)
      }
    }, data.category3)
  }

  private async _setCategoryDetails(data: ExcelRegistrationData): Promise<void> {
    if (data.validateRadio) {
      await this.page!.check(`input[name="validateRadio"][value="${data.validateRadio}"]`)
      if (data.validateRadio === 'date' && data.fValidate)
        await this.page!.fill('input[name="f_validate"]', data.fValidate)
    }
    if (data.selPower) await this.page!.fill('input[name="f_sel_power"]', data.selPower)
    if (data.selWeight) await this.page!.fill('input[name="f_sel_weight"]', data.selWeight)
    if (data.selSameDate) await this.page!.fill('input[name="f_sel_samedate"]', data.selSameDate)
    if (data.selArea) await this.page!.fill('input[name="f_sel_area"]', data.selArea)
    if (data.selProduct) await this.page!.fill('input[name="f_sel_product"]', data.selProduct)
    if (data.selSafety) await this.page!.fill('input[name="f_sel_safety"]', data.selSafety)
    if (data.selCapacity) await this.page!.fill('input[name="f_sel_capacity"]', data.selCapacity)
    if (data.selSpecification) await this.page!.fill('input[name="f_sel_specification"]', data.selSpecification)
  }

  private async _setCertifications(data: ExcelRegistrationData): Promise<void> {
    const certFields = [
      { name: 'f_woman_cert', value: data.womanCert },
      { name: 'f_disabledCompany_cert', value: data.disabledCompanyCert },
      { name: 'f_foundation_cert', value: data.foundationCert },
      { name: 'f_disabled_cert', value: data.disabledCert },
      { name: 'f_several_cert', value: data.severalCert },
      { name: 'f_cooperation_cert', value: data.cooperationCert },
      { name: 'f_society_cert', value: data.societyCert },
      { name: 'f_recycle_cert', value: data.recycleCert },
      { name: 'f_environment_cert', value: data.environmentCert },
      { name: 'f_lowCarbon_cert', value: data.lowCarbonCert },
      { name: 'f_swQuality_cert', value: data.swQualityCert },
      { name: 'f_nep_cert', value: data.nepCert },
      { name: 'f_net_cert', value: data.netCert },
      { name: 'f_greenProduct_cert', value: data.greenProductCert },
      { name: 'f_epc_cert', value: data.epcCert },
      { name: 'f_procure_cert', value: data.procureCert },
      { name: 'f_seoulTown_cert', value: data.seoulTownCert },
      { name: 'f_seoulSelf_cert', value: data.seoulSelfCert },
      { name: 'f_seoulCollaboration_cert', value: data.seoulCollaborationCert },
      { name: 'f_seoulReserve_cert', value: data.seoulReserveCert },
    ]
    for (const cert of certFields) {
      if (cert.value === 'Y') await this.page!.check(`input[name="${cert.name}"][value="Y"]`)
    }
  }

  private async _setDetailHtml(html: string): Promise<void> {
    const se2Frame = this.page!.frameLocator('iframe[src*="SmartEditor2Skin.html"]')
    await se2Frame.locator('.se2_to_html').click()
    await new Promise(r => setTimeout(r, 500))
    await se2Frame.locator('.se2_input_htmlsrc').fill(html)
    await se2Frame.locator('.se2_to_editor').click()
  }

  private async _setKcCertifications(data: ExcelRegistrationData): Promise<void> {
    await this.page!.check(`input[name="kidsKcUseGubunChk"][value="${data.kidsKcType}"]`)
    if (data.kidsKcType === 'Y' && data.kidsKcCertId) {
      await this.page!.fill('#kidsKcCertId', data.kidsKcCertId)
      await this.page!.click('a[href="JavaScript:KcCertRegist(\'kids\');"]')
    } else if (data.kidsKcType === 'F' && data.kidsKcFile) {
      await this._uploadFile('#f_kcCertKidsImg_file', data.kidsKcFile)
    }
    await this.page!.check(`input[name="elecKcUseGubunChk"][value="${data.elecKcType}"]`)
    if (data.elecKcType === 'Y' && data.elecKcCertId) {
      await this.page!.fill('#elecKcCertId', data.elecKcCertId)
      await this.page!.click('a[href="JavaScript:KcCertRegist(\'elec\');"]')
    } else if (data.elecKcType === 'F' && data.elecKcFile) {
      await this._uploadFile('#f_kcCertElecImg_file', data.elecKcFile)
    }
    await this.page!.check(`input[name="dailyKcUseGubunChk"][value="${data.dailyKcType}"]`)
    if (data.dailyKcType === 'Y' && data.dailyKcCertId) {
      await this.page!.fill('#dailyKcCertId', data.dailyKcCertId)
      await this.page!.click('a[href="JavaScript:KcCertRegist(\'daily\');"]')
    } else if (data.dailyKcType === 'F' && data.dailyKcFile) {
      await this._uploadFile('#f_kcCertDailyImg_file', data.dailyKcFile)
    }
    await this.page!.check(`input[name="broadcastingKcUseGubunChk"][value="${data.broadcastingKcType}"]`)
    if (data.broadcastingKcType === 'Y' && data.broadcastingKcCertId) {
      await this.page!.fill('#broadcastingKcCertId', data.broadcastingKcCertId)
      await this.page!.click('a[href="JavaScript:KcCertRegist(\'broadcasting\');"]')
    } else if (data.broadcastingKcType === 'F' && data.broadcastingKcFile) {
      await this._uploadFile('#f_kcCertBroadcastingImg_file', data.broadcastingKcFile)
    }
  }

  private async _setOtherAttachments(data: ExcelRegistrationData): Promise<void> {
    await this.page!.check(`input[name="childexitcheckerKcUseGubunChk"][value="${data.childExitCheckerKcType}"]`)
    if (data.childExitCheckerKcType === 'Y' && data.childExitCheckerKcCertId) {
      await this.page!.fill('#childexitcheckerKcCertId', data.childExitCheckerKcCertId)
      await this.page!.click('a[href="JavaScript:KcCertRegist(\'childexitchecker\');"]')
    } else if (data.childExitCheckerKcType === 'F' && data.childExitCheckerKcFile) {
      await this._uploadFile('#f_kcCertChildExitCheckerImg_file', data.childExitCheckerKcFile)
    }
    await this.page!.check(`input[name="safetycheckKcUseGubunChk"][value="${data.safetyCheckKcType}"]`)
    if (data.safetyCheckKcType === 'Y' && data.safetyCheckKcCertId) {
      await this.page!.fill('#safetycheckKcCertId', data.safetyCheckKcCertId)
    } else if (data.safetyCheckKcType === 'F' && data.safetyCheckKcFile) {
      await this._uploadFile('#f_kcCertSafetycheckImg_file', data.safetyCheckKcFile)
    }
  }

  private async _uploadAllImages(data: ExcelRegistrationData): Promise<void> {
    if (data.image1) {
      await this._uploadFile('#f_img1_file', data.image1, '#f_img1_file_size_ck')
      await new Promise(r => setTimeout(r, 5000))
    }
    if (data.image2) {
      await this._uploadFile('#f_img2_file', data.image2, '#f_img2_file_size_ck')
      await new Promise(r => setTimeout(r, 5000))
    }
    if (data.addImage1) {
      await this._uploadFile('#f_img3_file', data.addImage1, '#f_img3_file_size_ck')
      await new Promise(r => setTimeout(r, 5000))
    }
    if (data.addImage2) {
      await this._uploadFile('#f_img4_file', data.addImage2, '#f_img4_file_size_ck')
      await new Promise(r => setTimeout(r, 5000))
    }
    if (data.detailImage) {
      await this._uploadFile('#f_goods_explain_img_file', data.detailImage, '#f_goods_explain_img_file_size_ck')
      await new Promise(r => setTimeout(r, 5000))
    }
    await this._verifyImageUploads()
  }

  private async _verifyImageUploads(): Promise<void> {
    const imageInputs = ['f_img1', 'f_img2', 'f_img3', 'f_img4', 'f_goods_explain_img']
    for (const inputName of imageInputs) {
      await this.page!.inputValue(`input[name="${inputName}"]`).catch(() => '')
    }
  }

  private async _uploadFile(inputSelector: string, filePathOrUrl: string, statusSelector?: string): Promise<void> {
    const imageTypeMap: { [key: string]: string } = {
      '#f_img1_file': '기본이미지1',
      '#f_img2_file': '기본이미지2',
      '#f_img3_file': '추가이미지1',
      '#f_img4_file': '추가이미지2',
      '#f_goods_explain_img_file': '상세이미지',
    }
    const imageType = imageTypeMap[inputSelector] || '이미지'
    this._log(`${imageType} 업로드 시작: ${filePathOrUrl}`, 'info')
    let filePath: string
    const tempDir = path.join(this.baseFilePath, 'temp')
    if (!fsSync.existsSync(tempDir)) fsSync.mkdirSync(tempDir)
    if (filePathOrUrl.startsWith('http')) {
      const url = new URL(filePathOrUrl)
      const originalFileName = path.basename(url.pathname) || `image.jpg`
      let counter = 1
      let fileName = originalFileName
      filePath = path.join(tempDir, fileName)
      while (fsSync.existsSync(filePath)) {
        const nameWithoutExt = path.parse(originalFileName).name
        const ext = path.parse(originalFileName).ext
        fileName = `${nameWithoutExt}_${counter}${ext}`
        filePath = path.join(tempDir, fileName)
        counter++
      }
      const response = await axios.get(filePathOrUrl, { responseType: 'stream' })
      const writer = fsSync.createWriteStream(filePath)
      response.data.pipe(writer)
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve)
        writer.on('error', reject)
      })
      if (!fsSync.existsSync(filePath)) throw new Error(`외부 이미지를 찾을 수 없습니다: ${filePathOrUrl}`)
      const fileTypeResult = await FileType.fromFile(filePath)
      if (!fileTypeResult || !fileTypeResult.mime.startsWith('image/'))
        throw new Error(`외부 파일이 이미지가 아닙니다: ${filePathOrUrl}`)
    } else {
      if (path.isAbsolute(filePathOrUrl)) filePath = filePathOrUrl
      else filePath = path.join(this.baseFilePath, filePathOrUrl)
      if (!fsSync.existsSync(filePath)) throw new Error(`로컬 이미지를 찾을 수 없습니다: ${filePath}`)
      const fileTypeResult = await FileType.fromFile(filePath)
      if (!fileTypeResult || !fileTypeResult.mime.startsWith('image/'))
        throw new Error(`로컬 파일이 이미지가 아닙니다: ${filePath}`)
    }
    let type: 'thumb' | 'detail' = 'detail'
    if (['#f_img1_file', '#f_img2_file', '#f_img3_file', '#f_img4_file'].includes(inputSelector)) type = 'thumb'
    let sharpInstance = sharp(filePath)
    if (type === 'thumb')
      sharpInstance = sharpInstance
        .resize(262, 262, { fit: 'cover' })
        .resize(1000, 1000, { fit: 'inside', withoutEnlargement: true })
    else sharpInstance = sharpInstance.resize(680, null as any, { withoutEnlargement: true })
    const quality = this.imageOptimize ? 70 : 100
    sharpInstance = sharpInstance.jpeg({ quality })
    const tempFilePath = path.join(tempDir, `${crypto.randomUUID()}.jpg`)
    await sharpInstance.toFile(tempFilePath)
    filePath = tempFilePath
    const inputElement = this.page!.locator(inputSelector)
    if ((await inputElement.count()) > 0) {
      await inputElement.setInputFiles(filePath)
      if (statusSelector) {
        await this.page!.waitForFunction(
          (selector: string) => {
            const element = document.querySelector(selector)
            return element && element.textContent?.trim() === '이미지 용량 확인 완료'
          },
          statusSelector,
          { timeout: 20000 },
        )
      }
    } else {
      throw new Error(`Input element not found for selector: ${inputSelector}`)
    }
  }

  private async _setAsInfo(data: ExcelRegistrationData): Promise<void> {
    if (data.asTelephone1) await this.page!.fill('input[name="f_as_telephone1"]', data.asTelephone1)
    if (data.asTelephone2) await this.page!.fill('input[name="f_as_telephone2"]', data.asTelephone2)
    if (data.addressCode) await this.page!.fill('input[name="f_address_code"]', data.addressCode)
    if (data.address) await this.page!.fill('input[name="f_address"]', data.address)
    if (data.addressDetail) await this.page!.fill('input[name="f_address_detail"]', data.addressDetail)
  }

  private async _setDeliveryInfo(data: ExcelRegistrationData): Promise<void> {
    if (data.deliveryMethod) await this.page!.check(`input[name="f_delivery_method"][value="${data.deliveryMethod}"]`)
    const VALID_DELIVERY_AREAS = [
      '강원',
      '경기',
      '경남',
      '경북',
      '광주',
      '대구',
      '대전',
      '부산',
      '서울',
      '울산',
      '인천',
      '전남',
      '전북',
      '제주',
      '충남',
      '충북',
      '세종',
    ]
    if (data.deliveryAreas?.length > 0) {
      const filteredAreas = data.deliveryAreas.filter((area: string) => area.trim() !== '')
      if (filteredAreas.length === 0 || data.deliveryAreas.includes('전국')) {
        await this.page!.check('input[name="delivery_area"][value="1"]')
      } else {
        const invalidAreas = filteredAreas.filter((area: string) => !VALID_DELIVERY_AREAS.includes(area))
        if (invalidAreas.length > 0)
          throw new Error(`${invalidAreas.join(', ')}는 유효하지않은 지역입니다. 유효한 지역을 확인하고 입력해주세요.`)
        await this.page!.check('input[name="delivery_area"][value="2"]')
        for (const area of filteredAreas) {
          await this.page!.evaluate(areaName => {
            const checkboxes = document.querySelectorAll('#area1 input[type="checkbox"]')
            checkboxes.forEach(checkbox => {
              const label = (checkbox.nextSibling as any)?.textContent?.trim()
              if (label === areaName) {
                ;(checkbox as HTMLInputElement).checked = true
              }
            })
          }, area)
        }
      }
    } else {
      await this.page!.check('input[name="delivery_area"][value="1"]')
    }
  }

  private async _setNaraInformation(data: ExcelRegistrationData): Promise<void> {
    if (data.naraRegisterYn) await this.page!.check(`input[name="f_nara_register_yn"][value="${data.naraRegisterYn}"]`)
    if (data.naraAmt) await this.page!.fill('input[name="f_nara_amt"]', data.naraAmt)
    if (data.siteName) await this.page!.fill('input[name="f_site_name"]', data.siteName)
    if (data.siteUrl) await this.page!.fill('input[name="f_site_url"]', data.siteUrl)
  }

  private async _setOtherSiteInformation(data: ExcelRegistrationData): Promise<void> {
    if (data.otherSiteRegisterYn)
      await this.page!.check(`input[name="f_site_register_yn"][value="${data.otherSiteRegisterYn}"]`)
    if (data.otherSiteAmt) await this.page!.fill('input[name="f_site_amt"]', data.otherSiteAmt)
  }

  private async _submitRegistration(): Promise<void> {
    const isChecked = await this.page!.isChecked('#uprightContract')
    if (!isChecked) await this.page!.check('#uprightContract')
    await this.page!.click('a[href="javascript:register(\'1\');"]')
    await new Promise(r => setTimeout(r, 5000))
    if (this.dialogErrorMessage) throw new Error(this.dialogErrorMessage)
  }

  private async _readExcelStream(stream: fs.ReadStream): Promise<ExcelRawData[]> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })
      stream.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks)
          const XLSX = require('xlsx')
          const workbook = XLSX.read(buffer, {
            type: 'buffer',
            cellNF: false,
            cellHTML: false,
            cellFormula: false,
            sheetStubs: false,
            bookDeps: false,
            bookFiles: false,
            bookProps: false,
            bookSheets: false,
            bookVBA: false,
          })
          const sheetName = workbook.SheetNames[0]
          if (!sheetName) throw new Error('시트를 찾을 수 없습니다')
          const worksheet = workbook.Sheets[sheetName]
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '', blankrows: false })
          resolve(jsonData as ExcelRawData[])
        } catch (error) {
          reject(error)
        }
      })
      stream.on('error', error => {
        reject(error)
      })
    })
  }

  private _validateSaleType(value: string): '물품' | '용역' {
    if (value === '물품' || value === '용역') return value
    return '물품'
  }

  private _validateDeliveryFeeType(value: string): '무료' | '유료' | '조건부무료' {
    if (value === '무료' || value === '유료' || value === '조건부무료') return value
    return '무료'
  }

  private _validateDeliveryLimit(value: string): '3일' | '5일' | '7일' | '15일' | '30일' | '45일' {
    if (value.endsWith('일') && ['3일', '5일', '7일', '15일', '30일', '45일'].includes(value)) return value as any
    return '7일'
  }

  private _validateKcType(value: string): string {
    const KC_TYPE_MAP: Record<string, string> = {
      Y: 'Y',
      F: 'F',
      N: 'N',
      인증번호등록: 'Y',
      '공급자적합성확인 시험성적서등록': 'F',
      인증표시대상아님: 'N',
    }
    return KC_TYPE_MAP[value] || 'N'
  }

  private _getDeliveryLimitCode(value: string): string {
    const DELIVERY_LIMIT_MAP: Record<string, string> = {
      '3일': 'ZD000001',
      '5일': 'ZD000002',
      '7일': 'ZD000003',
      '15일': 'ZD000004',
      '30일': 'ZD000005',
      '45일': 'ZD000006',
    }
    return DELIVERY_LIMIT_MAP[value] || 'ZD000003'
  }

  private _getDeliveryMethodCode(value: string): string {
    const DELIVERY_METHOD_MAP: Record<string, string> = { 택배: '1', 직배송: '2', '우편 또는 등기': '3' }
    return DELIVERY_METHOD_MAP[value] || '1'
  }

  private _getConsumptionPeriodCode(value: string): string {
    const CONSUMPTION_PERIOD_MAP: Record<string, string> = {
      '제품에 별도 표시': '제품에 별도 표시',
      '제조일로부터 1년': '제조일로부터 1년',
      '상세설명에 별도표시': '상세설명에 별도표시',
      '제조일/가공일로부터 14일 이내 물품 발송': '제조일/가공일로부터 14일 이내 물품 발송',
      직접입력: 'date',
    }
    return CONSUMPTION_PERIOD_MAP[value] || ''
  }
}
