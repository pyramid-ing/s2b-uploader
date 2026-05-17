# S2B Uploader - Technical Documentation

## Project Overview

**S2B Uploader** is an Electron desktop application for automating product uploads to S2B 학교장터 (S2B.kr), a B2B e-commerce platform for school supplies. The app sources products from wholesale sites (도매꾹, 도매의신, 쿠팡, 오너클랜), transforms them via AI, and registers them in bulk via Excel upload with automated CAPTCHA solving.

**Target Users**: Senior entrepreneurs (50+) who pay 350,000 KRW lifetime license for automated sourcing and registration.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐  │
│  │ S2BSourcing │ │S2BRegistra │ │  S2BManagement      │  │
│  │ (Browser)   │ │tion        │ │  (Browser)          │  │
│  └─────────────┘ └─────────────┘ └─────────────────────┘  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐  │
│  │ Scrapers    │ │ ExcelMapper │ │  KC Validator       │  │
│  │ (Domeggook,│ │ (xlsx→DAta)│ │  (n8n webhook)      │  │
│  │  Domesin..)│ │             │ │                     │  │
│  └─────────────┘ └─────────────┘ └─────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              electron-store (encrypted settings)        ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                           │ IPC (ipcMain.handle)
┌─────────────────────────────────────────────────────────────┐
│                  Renderer Process (React 18)                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐  │
│  │ Sourcing │ │ Register │ │Management│ │  Settings   │  │
│  │  Page    │ │  Page    │ │  Page    │ │   Page      │  │
│  └──────────┘ └──────────┘ └──────────┘ └─────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Recoil Stores: sourcingStore, registerStore,         │  │
│  │              permissionStore, pricingStore, logStore  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                    Supabase (rvubjjtdegnxeaablucf)
```

---

## Tech Stack

| Layer              | Technology                                |
| ------------------ | ----------------------------------------- |
| Framework          | Electron 33 (Windows NSIS installer)      |
| Frontend           | React 18 + TypeScript + Webpack           |
| State              | Recoil                                    |
| UI                 | Ant Design 5                              |
| Browser Automation | Patchright (Playwright fork) + Playwright |
| Image Processing   | Sharp 0.32.6                              |
| Excel              | XLSX + xlsx-populate                      |
| Backend            | Supabase (project: rvubjjtdegnxeaablucf)  |
| Auto-update        | electron-updater + GitHub releases        |
| Package Manager    | Yarn                                      |

---

## Core Modules

### 1. Sourcing (`src/electron/s2b-sourcing.ts`)

**Purpose**: Crawl wholesale sites, collect product data, transform to S2B Excel format.

**Supported Vendors**:

- 도매꾹 (`domeggook.com`) - prefix `DMG_`
- 도매의신 (`domesin.com`) - prefix `DSM_`
- 쿠팡 (`coupang.com`) - prefix `CPG_`
- 학교장터 (`s2b.kr`) - prefix `S2B_`
- 오너클랜 (`ownerclan.com`) - prefix `ONC_`

**Scraper Architecture** (`src/electron/scrapers/`):

```
BaseScraper (abstract)
├── DomeggookScraper
├── DomesinScraper
├── CoupangScraper
├── S2BSchoolScraper
└── OwnerClanScraper
```

**AI Pipeline** (for non-학교장터 vendors):

1. OCR detail image via `n8n.pyramid-ing.com/webhook/s2b-ocr`
2. Fetch AI refinement via `fetchAiRefined()` from `lib/ai-client`
3. Validate KC certifications via `kc-validator.ts` → n8n webhook

**Key Methods**:

- `collectNormalizedDetailForProducts()` - Main entry; crawls URLs, applies AI pipeline, maps to Excel
- `_mapToExcelFormat()` - Transforms crawl data + AI output to `ExcelRegistrationData[]`
- `_createProductDir()` - Saves images to `소싱/{vendor}/{date}/{productCode}/`

### 2. Registration (`src/electron/s2b-registration.ts`)

**Purpose**: Automated product registration on S2B.kr via browser.

**Flow**:

1. `launch()` → opens Chrome/Edge
2. `login(id, pw)` → S2B login page
3. `registerProduct(data)` → multi-step form:
   - `_setBasicInfo()` - goodsName, spec, modelName, price
   - `_uploadAllImages()` - main images, additional images, detail image
   - `_selectCategory()` - 3-step category picker
   - `_setCategoryDetails()` - saleType, taxType, etc.
   - `_setCertifications()` - KC certifications (kids, elec, daily, broadcasting)
   - `_setDeliveryInfo()` - delivery areas, period
   - `_setDetailHtml()` - HTML template
   - `_submitRegistration()` - final submit

**CAPTCHA Solving**: If `geminiApiKey` is set, uses Gemini AI to solve security captchas on registration.

**IP Validation**: Before registration, validates current public IP matches `lastRegisteredIp` stored per account (to prevent fraud on school procurement).

### 3. Management (`src/electron/s2b-management.ts`)

**Purpose**: Bulk-extend product management expiration dates via S2B admin interface.

**Flow**: Login → Search products by date/status/query → Batch update `manageStartDate`/`manageEndDate`

### 4. Pricing (`src/electron/s2b-pricing.ts`)

**Purpose**: Update product pricing in bulk via Excel.

---

## Data Flow

### Sourcing → Registration Pipeline

```
1. User opens vendor site via '소싱' tab
2. collectListFromUrl() or collectNormalizedDetailForProducts() crawls
3. Images saved to: {fileDir}/소싱/{vendor}/{YYYYMMDD}/{productCode}/
4. AI pipeline transforms raw crawl → ExcelRegistrationData[]
5. User downloads Excel from '소싱' tab
6. User uploads Excel in '등록' tab
7. start-and-register-products IPC handler:
   a. validateAccount() checks permission + expiry
   b. apply marginRate to calculate 제시금액
   c. for each selected product: registerProduct()
   d. save results to {fileDir}/log/결과_{timestamp}.xlsx
```

### Permission System

**Supabase Schema** (inferred from `main.ts`):

```
profiles (id, email, ...)
  └── s2b_accounts (id, s2b_id, profile_id, ...)
        └── subscriptions (profile_id, plan_type, status, period_start, period_end, ...)
              └── products (product_type, name, metadata.permissions, ...)
```

**Permission Keys** (from `metadata.permissions`):

- `소싱` - Use sourcing features
- `상품등록` - Register products
- `판매관리일연장` - Extend management dates

---

## File Structure

```
src/
├── electron/
│   ├── main.ts                    # Entry point, IPC handlers, electron-store
│   ├── s2b-base.ts               # S2BBase: patchright browser wrapper
│   ├── s2b-sourcing.ts            # SourcingOrchestrator
│   ├── s2b-registration.ts        # S2BRegistration (registerProduct)
│   ├── s2b-management.ts          # S2BManagement
│   ├── s2b-pricing.ts             # S2BPricing
│   ├── envConfig.ts               # Supabase client, file paths
│   ├── kc-validator.ts            # KC certification validation
│   ├── sourcing-config.ts         # Vendor configs (urls, prefixes)
│   ├── types/
│   │   ├── excel.ts               # ExcelRegistrationData, ConfigSet types
│   │   ├── product.ts            # Product types
│   │   └── sourcingItems.ts       # SourcingItem types
│   ├── scrapers/
│   │   ├── BaseScraper.ts         # Abstract scraper
│   │   ├── DomeggookScraper.ts
│   │   ├── DomesinScraper.ts
│   │   ├── CoupangScraper.ts
│   │   ├── S2BSchoolScraper.ts
│   │   └── OwnerClanScraper.ts
│   └── lib/
│       ├── ai-client.ts           # AI refinement API client
│       └── gemini-client.ts       # Gemini CAPTCHA solver
└── renderer/
    ├── app.tsx                    # React Router setup
    ├── index.tsx                  # Entry point
    ├── pages/
    │   ├── Sourcing.tsx           # Sourcing UI
    │   ├── Register.tsx           # Excel upload + registration UI
    │   ├── Management.tsx         # Bulk date extension
    │   ├── Pricing.tsx            # Bulk price update
    │   ├── Settings.tsx           # Account + config management
    │   ├── License.tsx            # License info
    │   └── TerminalLog.tsx        # Log viewer
    ├── stores/
    │   ├── sourcingStore.ts       # Sourcing state
    │   ├── registerStore.ts       # Registration state
    │   ├── permissionStore.ts      # Permission/account state
    │   ├── pricingStore.ts
    │   ├── managementStore.ts
    │   └── logStore.ts            # Terminal log buffer
    └── hooks/
        ├── useSourcing.ts
        ├── useRegister.ts
        ├── usePermission.ts
        ├── useManagement.ts
        ├── usePricing.ts
        └── useLog.ts
```

---

## Supabase Integration

**Project ID**: `rvubjjtdegnxeaablucf`

**Tables**:

- `profiles` - User profiles
- `s2b_accounts` - S2B.kr account mappings (`s2b_id`, `profile_id`)
- `subscriptions` - Active subscriptions (`profile_id`, `plan_type`, `period_start`, `period_end`)
- `products` - Product catalog with `metadata.permissions` array
- `credit_transactions` - Credit balance tracking (`profile_id`, `type`, `amount`)

**Auth Flow**: Anonymous access via `anonKey`. Account validity checked via `getAccountInfo()` which joins s2b_accounts → subscriptions → products.

**Dashboard**: https://supabase.com/dashboard/project/rvubjjtdegnxeaablucf

**Connection Check**:

- Project URL in code: `src/electron/envConfig.ts` → `https://rvubjjtdegnxeaablucf.supabase.co`
- REST endpoint without API key should return `401`.
- REST endpoint with the app anon key should be able to query `products?select=id&limit=1`.

### Supabase Account Operations

#### 새 계정 추가 방법

계정이 여러 개일 때:

1. `v_s2b_ids`에 먼저 1개만 등록한다.
2. 실행 후 생성된 `profile_id`를 확인한다.
3. 나머지 계정을 같은 프로필로 묶어야 하면 `v_profile_id`에 그 값을 입력해서 다시 실행한다.

#### 신규등록

```sql
DO $$
DECLARE
  v_s2b_ids TEXT[] := ARRAY[
    'wlsduq29'
  ];
  v_plan_type TEXT := 'PERMANENT_BASIC';

  v_profile_id UUID := NULL;

  v_email TEXT := NULL;
  v_phone TEXT := '';
  v_name  TEXT := '';

  v_note_1 TEXT := '크몽_영원한봄비3464';
  v_note_2 TEXT := NULL;

  v_period_start TIMESTAMPTZ := '2026-03-31 00:00:00+09'::timestamptz;
  v_period_end   TIMESTAMPTZ := '2100-03-12 23:59:59+09'::timestamptz;

  v_product_id UUID;
  v_s2b_id TEXT;
  v_effective_profile_id UUID;
  v_is_new_profile BOOLEAN;
  v_subscription_id UUID;
BEGIN
  SELECT id INTO v_product_id
  FROM public.products
  WHERE product_type = 'subscription'
    AND metadata->>'plan_code' = v_plan_type
    AND active = true
  LIMIT 1;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Product not found for plan_type: %', v_plan_type;
  END IF;

  IF v_profile_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_profile_id) THEN
      RAISE EXCEPTION 'Profile not found for profile_id: %', v_profile_id;
    END IF;
    RAISE NOTICE 'Using provided profile_id for ALL s2b_ids: %', v_profile_id;
  END IF;

  FOREACH v_s2b_id IN ARRAY v_s2b_ids LOOP
    v_is_new_profile := false;
    v_subscription_id := NULL;

    IF v_profile_id IS NULL THEN
      SELECT profile_id INTO v_effective_profile_id
      FROM public.s2b_accounts
      WHERE s2b_id = v_s2b_id
      LIMIT 1;

      IF v_effective_profile_id IS NULL THEN
        INSERT INTO public.profiles (user_id, email, phone, name)
        VALUES (NULL, v_email, v_phone, v_name)
        RETURNING id INTO v_effective_profile_id;

        v_is_new_profile := true;
        RAISE NOTICE '[%] New profile created: %', v_s2b_id, v_effective_profile_id;
      ELSE
        RAISE NOTICE '[%] Existing profile found: %', v_s2b_id, v_effective_profile_id;
      END IF;
    ELSE
      v_effective_profile_id := v_profile_id;
    END IF;

    IF NOT v_is_new_profile
       AND (v_email IS NOT NULL OR v_phone IS NOT NULL OR v_name IS NOT NULL)
    THEN
      UPDATE public.profiles
      SET
        email = COALESCE(v_email, profiles.email),
        phone = COALESCE(v_phone, profiles.phone),
        name  = COALESCE(v_name,  profiles.name),
        updated_at = now()
      WHERE id = v_effective_profile_id;
    END IF;

    INSERT INTO public.s2b_accounts (s2b_id, profile_id, notes1, notes2)
    VALUES (v_s2b_id, v_effective_profile_id, v_note_1, v_note_2)
    ON CONFLICT (s2b_id) DO UPDATE
    SET
      profile_id = COALESCE(EXCLUDED.profile_id, s2b_accounts.profile_id),
      notes1     = COALESCE(EXCLUDED.notes1,     s2b_accounts.notes1),
      notes2     = COALESCE(EXCLUDED.notes2,     s2b_accounts.notes2),
      updated_at = now();

    IF v_is_new_profile THEN
      UPDATE public.subscriptions
      SET status = 'inactive', updated_at = now()
      WHERE profile_id = v_effective_profile_id AND status = 'active';

      INSERT INTO public.subscriptions (
        profile_id,
        plan_type,
        product_id,
        status,
        period_start,
        period_end
      )
      VALUES (
        v_effective_profile_id,
        v_plan_type,
        v_product_id,
        'active',
        v_period_start,
        v_period_end
      )
      RETURNING id INTO v_subscription_id;

      RAISE NOTICE '[%] Subscription created: % (product_id=%)', v_s2b_id, v_subscription_id, v_product_id;
    ELSE
      RAISE NOTICE '[%] Subscription not created: existing profile connected', v_s2b_id;
    END IF;

    RAISE NOTICE '[%] Summary -> profile_id=%, plan_type=%', v_s2b_id, v_effective_profile_id, v_plan_type;
  END LOOP;

  RAISE NOTICE '=== DONE: processed % s2b_ids ===', COALESCE(array_length(v_s2b_ids, 1), 0);
END $$;
```

#### 삭제 - 고립 프로필만 함께 삭제

```sql
DO $$
DECLARE
  v_s2b_ids TEXT[] := ARRAY[
    'wlsduq72'
  ];

  v_s2b_id TEXT;
  v_target_profile_id UUID;
BEGIN
  FOREACH v_s2b_id IN ARRAY v_s2b_ids LOOP
    SELECT profile_id INTO v_target_profile_id
    FROM public.s2b_accounts
    WHERE s2b_id = v_s2b_id;

    IF v_target_profile_id IS NOT NULL THEN
      DELETE FROM public.s2b_accounts WHERE s2b_id = v_s2b_id;
      RAISE NOTICE '[%] s2b_account deleted', v_s2b_id;

      IF NOT EXISTS (SELECT 1 FROM public.s2b_accounts WHERE profile_id = v_target_profile_id) THEN
        DELETE FROM public.subscriptions WHERE profile_id = v_target_profile_id;
        DELETE FROM public.profiles WHERE id = v_target_profile_id;

        RAISE NOTICE '[%] Profile and Subscriptions also removed (No other accounts linked)', v_s2b_id;
      ELSE
        RAISE NOTICE '[%] Profile kept (linked to other s2b_ids)', v_s2b_id;
      END IF;
    ELSE
      RAISE NOTICE '[%] No account found to delete', v_s2b_id;
    END IF;
  END LOOP;
END $$;
```

#### 종료일 연장

```sql
DO $$
DECLARE
  v_s2b_ids TEXT[] := ARRAY['kiki01052'];
  v_new_period_end TIMESTAMPTZ := '2100-03-12 23:59:59+09'::timestamptz;

  v_s2b_id TEXT;
  v_profile_id UUID;
  v_updated_count INT := 0;
BEGIN
  FOREACH v_s2b_id IN ARRAY v_s2b_ids LOOP
    SELECT profile_id INTO v_profile_id
    FROM public.s2b_accounts
    WHERE s2b_id = v_s2b_id;

    IF v_profile_id IS NULL THEN
      RAISE NOTICE '[경고] s2b_id: % 를 찾을 수 없어 건너뜁니다.', v_s2b_id;
      CONTINUE;
    END IF;

    UPDATE public.subscriptions
    SET
      period_end = v_new_period_end,
      updated_at = now()
    WHERE profile_id = v_profile_id
      AND status = 'active';

    IF FOUND THEN
      v_updated_count := v_updated_count + 1;
      RAISE NOTICE '[성공] s2b_id: % (Profile: %) 의 기간이 % 까지 연장되었습니다.',
                   v_s2b_id, v_profile_id, v_new_period_end;
    ELSE
      RAISE NOTICE '[알림] s2b_id: % 에 연결된 활성 구독(active)이 없습니다.', v_s2b_id;
    END IF;
  END LOOP;

  RAISE NOTICE '--- 처리 완료: 총 %건 업데이트됨 ---', v_updated_count;
END $$;
```

#### 삭제 - profile_id 기준 전체 삭제 옵션

```sql
DO $$
DECLARE
  v_s2b_id TEXT := 'wlsduqwls';
  v_user_id UUID := NULL;
  v_delete_profile BOOLEAN := true;

  v_profile_id UUID;
  v_deleted_subscriptions INTEGER := 0;
  v_deleted_s2b_accounts INTEGER := 0;
  v_deleted_profiles INTEGER := 0;
BEGIN
  IF v_s2b_id IS NOT NULL THEN
    SELECT profile_id INTO v_profile_id
    FROM public.s2b_accounts
    WHERE s2b_id = v_s2b_id
    LIMIT 1;

    IF v_profile_id IS NULL THEN
      RAISE EXCEPTION 'S2B account not found for s2b_id: %', v_s2b_id;
    END IF;
  ELSIF v_user_id IS NOT NULL THEN
    SELECT id INTO v_profile_id
    FROM public.profiles
    WHERE user_id = v_user_id
    LIMIT 1;

    IF v_profile_id IS NULL THEN
      RAISE EXCEPTION 'Profile not found for user_id: %', v_user_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Either v_s2b_id or v_user_id must be provided';
  END IF;

  RAISE NOTICE 'Found profile_id: %', v_profile_id;

  DELETE FROM public.subscriptions
  WHERE profile_id = v_profile_id;
  GET DIAGNOSTICS v_deleted_subscriptions = ROW_COUNT;
  RAISE NOTICE 'Deleted % subscription(s)', v_deleted_subscriptions;

  DELETE FROM public.s2b_accounts
  WHERE profile_id = v_profile_id;
  GET DIAGNOSTICS v_deleted_s2b_accounts = ROW_COUNT;
  RAISE NOTICE 'Deleted % s2b_account(s)', v_deleted_s2b_accounts;

  IF v_delete_profile THEN
    DELETE FROM public.profiles
    WHERE id = v_profile_id;
    GET DIAGNOSTICS v_deleted_profiles = ROW_COUNT;
    RAISE NOTICE 'Deleted % profile(s)', v_deleted_profiles;
  ELSE
    RAISE NOTICE 'Profile kept (v_delete_profile = false)';
  END IF;

  RAISE NOTICE '=== Deletion Summary ===';
  RAISE NOTICE 'Profile ID: %', v_profile_id;
  RAISE NOTICE 'Subscriptions deleted: %', v_deleted_subscriptions;
  RAISE NOTICE 'S2B accounts deleted: %', v_deleted_s2b_accounts;
  RAISE NOTICE 'Profiles deleted: %', v_deleted_profiles;
END $$;
```

#### 포인트 충전

```sql
BEGIN;

DO $$
DECLARE
  v_s2b_id text := '카톡_기분이태도';
  v_description text := '체험: AI이용권 20회';
  v_amount int := 20;
  v_profile_id uuid;
BEGIN
  SELECT a.profile_id
  INTO v_profile_id
  FROM public.s2b_accounts a
  WHERE a.s2b_id = v_s2b_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 's2b_account_not_found';
  END IF;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile_id_not_set_for_s2b_id';
  END IF;

  INSERT INTO public.credit_transactions (
    type,
    amount,
    description,
    reference_id,
    profile_id
  )
  VALUES (
    'charge',
    v_amount,
    v_description,
    NULL,
    v_profile_id
  );
END $$;

COMMIT;
```

---

## Key Configuration

**electron-store** (encrypted with `s2b-uploader-secret-key`):

```typescript
interface Settings {
  fileDir: string          // Base download directory
  excelPath: string       // Last used Excel file
  accounts: S2BLoginAccount[]  // Multiple S2B accounts
  activeAccountId: string
  registrationDelayMin/Max // Random delay between registrations
  imageOptimize: boolean   // Sharp optimization
  headless: boolean       // Hide browser
  marginRate: number       // Price markup %
  geminiApiKey?: string    // For CAPTCHA solving
  useAIForSourcing: boolean
  thumbnailSize: number    // 240 default
  detailImageWidth: number // 680 default
  typeDelay: number       // Keyboard input delay
}
```

---

## Known Technical Debt / Issues

1. **Legacy login fields**: `loginId`/`loginPw` in settings predate multi-account support; `normalizeSettings()` migrates to `accounts[]` array.

2. **KC validation relies on n8n webhook**: `validateKcByCertNum()` calls external n8n service; failure here cascades to sourcing.

3. **No retry logic for network failures**: Browser automation (`patchright`) has no robust retry with exponential backoff.

4. **Image path stored as string**: Full paths saved in Excel; moving files breaks Excel→UI mapping.

5. **S2B login session management**: Sessions stored in browser context; no explicit session refresh handling.

6. **的学校장터 is excluded from AI pipeline**: S2B products use `_buildRefinedPayloadWithoutAI()` - simpler but less refined data.

---

## Building & Release

```bash
# Development
yarn start              # webpack dev server + electron
yarn debug             # with Node inspector

# Production
yarn build             # compile TypeScript
yarn package           # electron-builder (outputs to release/)
yarn package-win       # Windows NSIS installer + auto-publish to GitHub releases
```

**Release flow**: `release:patch` bumps version, pushes tags → GitHub Actions triggers `package-win --publish=always`.

---

## Environment Variables / Secrets

| Key                 | Location                       | Purpose                                       |
| ------------------- | ------------------------------ | --------------------------------------------- |
| `SUPABASE_URL`      | Hardcoded in `envConfig.ts`    | `https://rvubjjtdegnxeaablucf.supabase.co`    |
| `SUPABASE_ANON_KEY` | Hardcoded in `envConfig.ts`    | Anonymous API key                             |
| `GEMINI_API_KEY`    | User-provided in settings      | CAPTCHA solving                               |
| `KC_AUTH_KEY`       | Hardcoded in `kc-validator.ts` | `c953b79d-7da6-4cde-8086-bc866fcb5d27`        |
| `N8N_OCR_WEBHOOK`   | Hardcoded in `s2b-sourcing.ts` | `https://n8n.pyramid-ing.com/webhook/s2b-ocr` |
