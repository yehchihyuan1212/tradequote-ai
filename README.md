# TradeQuote AI

國貿詢價自動報價系統。自動讀取 Gmail 未讀信件、用本地 LLM 分析客戶意圖與需求、依照 Price Settings 的成本結構算出各 Incoterms 條件的報價金額，並產生可直接寄出的報價信草稿。

## 核心流程

```
Gmail 未讀信件
   → AI 分析（意圖、公司、聯絡人、品項、數量、目的地、貿易條件）
   → 比對商品資料庫、依 Price Settings 計算 EXW/FCA/FOB/CFR/CIF/CPT/CIP 報價
   → 產生報價信草稿
   → 送回 Gmail 草稿匣
```

**設計原則：金額一律由 Python 算，AI 只負責讀信。** 所有價格公式都在 `app/services/pricing_service.py` 用固定四則運算完成；語言模型（`app/services/ai_service.py`）只負責把一封信轉成結構化 JSON（公司、聯絡人、品項、目的地、貿易條件…），完全不碰數字。維護時如果報價金額算錯，去看 `pricing_service.py`；如果擷取的公司名/目的地不對，才是 `ai_service.py` 的提示詞需要調整。

## 目錄

**快速開始**
- [技術棧](#技術棧)
- [事前準備](#事前準備)
- [安裝](#安裝)
- [啟動系統](#啟動系統)
- [資料庫](#資料庫)

**程式碼導覽**
- [專案結構總覽](#專案結構總覽)
- [`app/database.py` — 資料庫連線](#appdatabasepy--資料庫連線)
- [`app/models.py` — 資料表結構](#appmodelspy--資料表結構)
- [`app/main.py` — API 路由與商業邏輯](#appmainpy--api-路由與商業邏輯)
  - [私有輔助函式](#私有輔助函式底線開頭不是路由)
  - [路由分區](#路由分區)
- [`app/services/ai_service.py` — AI 擷取邏輯](#appservicesai_servicepy--ai-擷取邏輯)
- [`app/services/pricing_service.py` — 報價計算公式](#appservicespricing_servicepy--報價計算公式)
- [`app/services/draft_service.py` — 回覆信模板](#appservicesdraft_servicepy--回覆信模板)
- [`app/services/gmail_service.py` — Gmail API 存取](#appservicesgmail_servicepy--gmail-api-存取)
- [前端結構](#前端結構)
- [`ingest.py` 與 `seed.py`](#ingestpy-與-seedpy)

**參考資料**
- [支援的貿易條件（Incoterms 2020）](#支援的貿易條件incoterms-2020)
- [常見維護情境](#常見維護情境)

## 技術棧

- **後端**：FastAPI + SQLAlchemy 2.0 + SQLite
- **前端**：React 19 + Vite + Tailwind CSS
- **AI**：Ollama 本地模型（預設 `qwen3.5:4b`），信件分析完全在本機執行，資料不出機器
- **Email**：Gmail API（OAuth）

## 事前準備

1. **Python 3.12+** 與 [uv](https://docs.astral.sh/uv/)
2. **Node.js**（跑前端 Vite）
3. **Ollama**，並先拉好模型：
   ```bash
   ollama pull qwen3.5:4b
   ```
4. **Gmail API 憑證**：至 [Google Cloud Console](https://console.cloud.google.com/) 建立 OAuth 用戶端，下載後存成專案根目錄的 `credentials.json`。第一次執行會跳出瀏覽器登入授權，成功後會在根目錄產生 `token.json`（之後自動使用，過期會自動刷新）。

## 安裝

```bash
# 後端套件
uv sync

# 前端套件
cd frontend
npm install
```

## 啟動系統

**後端**（專案根目錄）：
```bash
uv run uvicorn app.main:app --reload --port 8000
```

**前端**（`frontend/` 目錄）：
```bash
npm run dev
```

前端預設會在 `http://localhost:5173`，透過 `http://<host>:8000/api` 呼叫後端（見 `frontend/src/api.js` 第一行的 `BASE`）。

## 資料庫

SQLite 檔案 `tradequote.db`，第一次啟動後端時（`init_db()` 會呼叫 `Base.metadata.create_all`）或執行 `seed.py` 時自動建立。

**重建資料庫**（會清空所有資料，重新灌入預設商品/報價設定/運費表）：
```bash
rm tradequote.db
uv run python seed.py
uv run python ingest.py   # 手動觸發第一次抓信（也可以直接用前端「Sync inbox」按鈕）
```

> 注意：`seed.py` 只會在資料庫是空的時候寫入預設資料；重建後 Price Settings（利潤率、運費、保費等）會回到程式碼裡的預設值，之前透過 Settings 頁面調整過的數字需要重新設定。

---

## 專案結構總覽

```
app/
  database.py                DB engine / session
  models.py                  9 張資料表定義（SQLAlchemy 2.0 declarative）
  main.py                    所有 /api/* 路由 + 商業邏輯（最大的檔案，1000+ 行）
  services/
    ai_service.py            Ollama 提示詞與信件擷取邏輯
    pricing_service.py       Incoterms 報價計算公式
    draft_service.py         報價信 / 各類回覆信模板
    gmail_service.py         Gmail API 存取（讀信、建草稿、寄信）
frontend/
  src/App.jsx                所有頁面元件（單一檔案，2000+ 行）
  src/api.js                 呼叫後端 API 的 fetch 封裝
  src/main.jsx                React 進入點
  src/index.css               Tailwind 設定
ingest.py                    獨立腳本，等同「Sync inbox」的命令列版本
seed.py                      資料庫初始資料（商品、運費表、Price Settings 預設值）
credentials.json / token.json  Gmail OAuth 憑證（不要 commit 進 git）
```

以下逐一說明每個檔案在做什麼、什麼情況下要去改它。

---

<a id="appdatabasepy--資料庫連線"></a>
## `app/database.py` — 資料庫連線

```python
engine = create_engine("sqlite:///tradequote.db")
SessionLocal = sessionmaker(bind=engine)
```

就三件事：建立 SQLite 連線、`init_db()` 依 `models.py` 的定義建表、`get_db()` 給 FastAPI 的 `Depends()` 用（每個請求一個 session，處理完自動關閉）。**平常不太需要動這個檔案**，除非要換資料庫（例如換成 PostgreSQL）才需要改 `create_engine` 那行。

<a id="appmodelspy--資料表結構"></a>
## `app/models.py` — 資料表結構

9 張表，關聯如下：

```
Customer ──< Email ──1:1── Inquiry ──1:1── Quotation ──< QuotationItem
                              │                 │
                              └──────1:1──────Draft
Product（獨立，被 QuotationItem / Quotation 參照）
PriceSetting（全域設定，只會有一列）
Freight（目的地 → 運費，多列）
```

| 表 | 用途 | 常改動的欄位 |
|---|---|---|
| `Customer` | 客戶（依公司名/聯絡人/信箱去重複，見 `_resolve_customer`） | — |
| `Product` | 商品主檔（SKU、單價、MOQ、交期、別名） | 新增產品直接在 Products 頁面新增，或改 `seed.py` |
| `PriceSetting` | **全域**報價參數：利潤率、本地費用、保費、銀行手續費、匯率、Emails per sync、出貨港。整張表恆常只有一列 | Settings / Price Settings 頁面可直接改 |
| `Freight` | 「目的地 → 運費金額/港口/天數」對照表，CFR/CIF/CPT/CIP 算價時查這張表 | Price Settings 頁面的「Freight by destination」可新增/刪除 |
| `Email` | 每封抓進來的 Gmail 信件（原始內容 + 已讀/封存/刪除狀態） | — |
| `Inquiry` | AI 分析結果（意圖、擷取到的公司/聯絡人/品項/目的地/貿易條件），跟 `Email` 一對一 | — |
| `Quotation` | 一封詢價信 = 一筆報價（`quote_no`），存 EXW ~ CIP 七個金額快照 | — |
| `QuotationItem` | 報價底下的每個品項明細（多品項報價用） | — |
| `Draft` | 產生好的報價信草稿，可能已送到 Gmail（`gmail_draft_id`） | — |

**新增欄位時的作法（本專案一律用「加欄位」，不做破壞性重建）：**

1. 在對應的 class 加一行 `Mapped[...] = mapped_column(...)`，記得給 `default=`（否則舊資料的既有列會沒有值）。
2. 對「正在跑的」資料庫手動補欄位（因為專案沒有用 Alembic 自動遷移）：
   ```python
   import sqlite3
   conn = sqlite3.connect("tradequote.db")
   conn.execute("ALTER TABLE 表名 ADD COLUMN 欄位名 型別 DEFAULT 預設值")
   conn.commit()
   ```
3. 全新資料庫（跑 `seed.py` 前執行 `init_db()`）會自動照 `models.py` 建出新欄位，不用額外處理。

<a id="appmainpy--api-路由與商業邏輯"></a>
## `app/main.py` — API 路由與商業邏輯

這是專案的核心，依功能分成幾塊：

<a id="私有輔助函式底線開頭不是路由"></a>
### 私有輔助函式（底線開頭，不是路由）

| 函式 | 做什麼 |
|---|---|
| `_generate_quotation(db, inq, s, freight_lookup)` | **報價計算的入口**。把一封詢價信裡所有品項比對商品、算總成本，交給 `pricing_service.calculate_from_cost` 算出七個 Incoterm 金額，寫回 `Quotation` + `QuotationItem`。目的地留空但客戶只要求出貨港命名條件（EXW/FCA/FOB）時，會退回用「Taiwan」（對應 Freight 表裡的高雄）當基準，因為這幾個條件本來就不含運費。 |
| `_match_product(db, text)` | 商品比對：完全符合名稱/別名優先 → 子字串比對 → 詞彙重疊，避免「Charger」誤配到別名含 "portable charger" 的 Power Bank。 |
| `_resolve_customer(db, company, contact, sender_email, country)` | 依「公司名 > 聯絡人 > 寄件信箱」優先序找出或建立 `Customer`，避免同一信箱代轉多間公司詢價時被誤判成同一個客戶。 |
| `_display_company(i)` | 列表要顯示的「客戶名稱」——`intent == "other"`（非商業信）時改顯示寄件人本名，不用「New Customer」，避免跟真正的潛在客戶混淆。 |
| `_parse_items(inq)` / `_parse_incoterms(inq)` | 把 `Inquiry.items_json` / `incoterms_json` 解析成 Python list，並向下相容沒有這兩個新欄位的舊資料。 |
| `_freight_table(db)` | 把 `Freight` 整張表撈成 `{目的地: 運費}` dict，給 `calculate_from_cost` 查表用。 |

### 路由分區

| 路徑前綴 | 功能 |
|---|---|
| `GET /api/stats` | Dashboard 統計卡片與意圖分布圖、側邊欄未讀數字 |
| `GET /api/inbox`, `/api/inbox/{id}` | Inbox / AI Review 頁面的信件列表與單封信詳情（含 AI 擷取結果、報價、草稿） |
| `POST /api/inbox/sync` | 「Sync inbox」按鈕——抓 Gmail 新信 → AI 分析 → 自動算價（等同 `ingest.py`） |
| `POST /api/inbox/{id}/quote`, `/draft`, `/reply` | AI Review 頁面「產生報價」「產生草稿」「用範本回覆」的動作 |
| `POST /api/inbox/{id}/archive`, `/unarchive`, `/delete`, `/keep` | 信件的封存/刪除/保留（軟刪除，不會真的清掉資料庫紀錄，除非呼叫 `/delete`） |
| `GET /api/quotations`, `POST /api/quotations/{no}/draft`, `/recalculate` | Quotations 頁面：列表、產生草稿、用目前 Price Settings 重算金額 |
| `GET /api/drafts`, `PUT /api/drafts/{id}`, `POST /.../send-to-gmail`, `/regenerate` | Drafts 頁面：編輯草稿內文、送到 Gmail 草稿匣、用最新報價重寫 |
| `GET/POST/DELETE /api/products` | Products 頁面的 CRUD |
| `GET/PUT /api/settings`, `GET/POST/DELETE /api/freight` | Price Settings 頁面：全域報價參數、Freight by destination 表 |
| `GET /api/customers`, `/api/customers/{id}` | Customers 頁面：客戶列表與單一客戶的詢價/報價歷史 |
| `GET /api/reports`, `/api/export` | Reports 頁面統計數字、匯出 Excel |
| `GET /api/system-info` | Settings 頁面的系統狀態（Ollama/Gmail/資料庫是否連線） |

**維護建議**：這個檔案已經滿大的，新增功能時優先考慮「這是不是該歸類到既有的某一塊」，照相同的 pattern（`db.query(...)`、回傳 dict）加路由，不要另開檔案打散邏輯——目前所有商業邏輯集中在這裡，方便追蹤，但如果之後繼續變大，可以考慮依上面表格的分區拆成多個 `routers/*.py`。

<a id="appservicesai_servicepy--ai-擷取邏輯"></a>
## `app/services/ai_service.py` — AI 擷取邏輯

負責把 email 的 subject + body 丟給本機 Ollama，回傳結構化 JSON：`intent`、`confidence`、`company`、`contact`、`items`（品項清單）、`destination`、`incoterms`、`summary`。

- **`SYSTEM`**：整個提示詞，包含欄位說明跟一長串 few-shot 範例。**這是最常需要調整的地方**——如果發現某種信件類型 AI 判斷錯誤（例如誤判 intent、漏抓品項、目的地抓成城市而非國家），先看能不能在這裡多加一組「錯誤案例 → 正確輸出」的範例，比改程式碼更有效。
- **`VALID_INCOTERMS`**：白名單，過濾掉模型亂編的貿易條件。
- **`analyse()`**：呼叫 Ollama（`temperature=0`、`format=json`）、清理輸出（`_clean` 去掉 `<think>` 標籤和 markdown 圍籬）、做型別轉換與新舊欄位相容（`items`/`incoterms` 是新格式，`product`/`quantity`/`incoterm` 是給只認得單一品項/條件的舊畫面用）。
- **JSON 解析失敗時**的 fallback：回傳 `intent: "other"`、`confidence: 0`，不會讓整個抓信流程中斷。

**換模型**：改最上面的 `MODEL = "qwen3.5:4b"` 常數即可，確保先 `ollama pull` 過。模型越大，擷取品質通常越好但速度越慢。

<a id="appservicespricing_servicepy--報價計算公式"></a>
## `app/services/pricing_service.py` — 報價計算公式

整個系統唯一算錢的地方，核心是 `calculate_from_cost(cost, destination, settings, freight_lookup)`：

```python
exw = cost / (1 - profit_margin) + bank_charges
fca = exw + local_charges / 2      # 交給運送人，只算一半本地費用
fob = exw + local_charges          # 裝船，本地費用算全額
cfr = fob + freight                 # + 國際運費
cif = fob + freight + insurance     # + 運費 + 保費
cpt = exw + freight                 # 不經過 FOB，直接加運費
cip = exw + freight + insurance     # 不經過 FOB，直接加運費+保費
```

- `freight` 從 `freight_lookup`（即 `_freight_table()` 撈出的 dict）依目的地查表，查不到就用 `DEFAULT_FREIGHT = 500`，並在回傳的 `freight_estimated` 標記為 `True`（前端用這個欄位決定要不要顯示黃色警示）。
- `UNSUPPORTED_INCOTERMS = {DAP, DPU, DDP, FAS}`：這幾個條件因為需要目的地關稅/內陸運費資料，系統沒有，直接排除計算。
- `PORT_TO_COUNTRY`：把 AI 擷取到的港口/城市名（如 "Osaka"）正規化成國家名（"Japan"），才能對上 `Freight` 表的 key。**新增目的地時，如果客戶常提到某個城市/港口而不是國家名，把對應關係加進這個 dict**，否則會查不到運費資料。
- `calculate()`：單一品項版本，內部呼叫 `calculate_from_cost` 再換算單價，供舊畫面使用。

**要調整報價邏輯**（例如加新的成本項目、改變某個 Incoterm 的算法）都改這裡，改完要注意：`_generate_quotation`／`recalculate`（`app/main.py`）兩處都是呼叫這個函式，兩邊的行為會同步生效。

<a id="appservicesdraft_servicepy--回覆信模板"></a>
## `app/services/draft_service.py` — 回覆信模板

依 `Inquiry.intent` 產生對應的英文回覆信文字：

| 函式 | 對應意圖 |
|---|---|
| `compose_quotation_reply` | 報價（最複雜，見下） |
| `compose_sample_reply` | 樣品需求 |
| `compose_delivery_reply` | 出貨狀態追蹤 |
| `compose_after_sales_reply` | 售後/品質問題 |
| `compose_payment_reply` | 付款確認 |
| `compose_blank_reply` | 其他（空白模板讓使用者自己寫） |

`compose_quotation_reply` 重點：
- 客戶要求哪些貿易條件就列哪些總價行；沒指定就預設列 FOB + CIF。
- 要求到 `UNSUPPORTED_INCOTERMS` 裡的條件會附註「請人工報價」，不會假裝算得出來。
- **`ORIGIN_NAMED = {exw, fca, fob}`**：這三個條件顯示的地名是 `shipping_port`（出貨港，例如「FOB Kaohsiung」），其餘條件顯示 `dest`（目的地，例如「CIF Brazil」）——這是國貿慣例，改動時要注意不要兩邊搞混。

<a id="appservicesgmail_servicepy--gmail-api-存取"></a>
## `app/services/gmail_service.py` — Gmail API 存取

- `_service()`：OAuth 登入流程，讀 `token.json`（過期會用 refresh token 自動更新），沒有 token 時會跳出瀏覽器要求登入 `credentials.json` 對應的 Google 帳號。
- `fetch_new(max_results, query)`：抓信，`max_results <= 0` 會直接回傳空陣列、完全不呼叫 Gmail API（避免 `maxResults=0` 被 API 判定為無效參數而報錯）。
- `_extract_body(payload)` / `_html_to_text(html)`：優先取純文字內文，只有 HTML 版本時才轉換成純文字給 AI 讀。
- `create_draft(to, subject, body)`：在 Gmail 草稿匣建立一封新草稿。

**Gmail 授權出問題時**（token 失效、換了 Google 帳號）：刪除 `token.json`，重新啟動後端並觸發一次 `/api/inbox/sync`，會重新跳出瀏覽器登入。

---

## 前端結構

`frontend/src/App.jsx` 是單一大檔案，包含全部頁面元件（此專案刻意不拆成多檔案，方便在一個地方看到完整 UI 邏輯）：

| 元件 | 對應頁面 |
|---|---|
| `Dashboard` | 首頁總覽（統計卡片、最近詢價、意圖分布圖） |
| `InboxPage` | Inbox：信件列表，含封存/刪除 |
| `AIReview` | AI Review：逐封信走完「AI 擷取 → 產生報價 → 產生草稿」的分步驟畫面 |
| `Quotations` | 報價列表 + Price breakdown 卡片（成本拆解、七個 Incoterm 金額） |
| `Drafts` | 草稿列表，可編輯內文、送到 Gmail |
| `Customers` | 客戶列表與單一客戶的歷史往來 |
| `PriceSettings` | 商品管理 + Freight by destination 表 |
| `Reports` | 統計圖表、匯出 Excel |
| `SettingsPage` | 公司資料、出貨港、Emails per sync |
| `App`（預設匯出） | 最外層 shell：側邊欄導覽、`page` state 決定顯示哪個元件 |

共用工具函式（檔案最上方）：
- `incotermHighlight(incoterms)`：依客戶要求的貿易條件，算出畫面上要用顏色標記哪幾個 Incoterm 卡片。
- `breakdownIncluded(highlightKeys)`：對照 `INCOTERM_COMPONENTS`，算出 Price breakdown 裡哪些成本項目（Cost/Margin/Freight/Insurance/Local charges/Bank charges）實際算進客戶要的那個貿易條件，決定要不要淡化顯示。

`frontend/src/api.js`：所有對後端的 fetch 呼叫集中在這裡，`BASE` 會自動用目前瀏覽器的 hostname 接 `:8000/api`，換部署環境不用改程式碼。

**維護建議**：`App.jsx` 已經破 2000 行，新增頁面時沿用既有的 `Card`／`Badge`／`Field` 這幾個共用元件維持風格一致；如果之後功能持續增加，可以考慮把每個頁面元件拆成獨立檔案（`src/pages/*.jsx`）。

---

<a id="ingestpy-與-seedpy"></a>
## `ingest.py` 與 `seed.py`

- **`ingest.py`**：獨立可執行的命令列版本，等同「Sync inbox」按鈕，抓信邏輯直接重用 `app/main.py` 的 `_generate_quotation`、`_resolve_customer` 等函式（避免邏輯寫兩份）。適合排程（cron）自動定時抓信。
- **`seed.py`**：只在對應資料表是空的時候才寫入預設資料（商品 5 筆、`PriceSetting` 一列、`Freight` 15 個目的地）。**重複執行是安全的**，不會清空既有資料或報錯。

---

<a id="支援的貿易條件incoterms-2020"></a>
## 支援的貿易條件（Incoterms 2020）

| 條件 | 命名方式 | 系統是否計算 |
|------|----------|------|
| EXW / FCA / FOB | 出貨港命名（Settings 的 Shipping port，預設高雄） | ✅ |
| CFR / CIF / CPT / CIP | 目的地命名（依 Price Settings 的 Freight by destination 查表） | ✅ |
| DAP / DPU / DDP / FAS | 涉及目的地關稅/內陸運費，系統沒有這些資料 | ❌ 報價信會附註請人工報價 |

若某筆詢價的目的地不在 Freight by destination 表裡（且客戶要求的條件確實需要用到運費），畫面會顯示黃色提示，請至 Price Settings 補上資料；沒有這類需求的條件（例如純 EXW）則不會顯示提示。

---

## 常見維護情境

**新增一個商品**：Products 頁面直接新增，或改 `seed.py` 加進 `Product(...)` 清單（只影響全新資料庫）。記得填 `aliases`（用逗號分隔的別名/中文名），影響 `_match_product` 比對信件內容時的準確度。

**新增一個常見出貨目的地**：Price Settings 的「Freight by destination」新增一列（國家名、港口、運費、天數）。如果客戶信裡常寫城市/港口名而非國家名，順便去 `pricing_service.py` 的 `PORT_TO_COUNTRY` 補上對照，否則系統查不到會顯示「沒有運費資料」的警示。

**AI 判斷錯誤**（意圖分類錯、擷取欄位錯）：先看 `ai_service.py` 的 `SYSTEM` 提示詞能不能加一組對應的 few-shot 範例修正，這通常比改程式碼更有效、更不會產生副作用。

**改資料庫欄位**：一律用「加欄位」不要「重建資料表」，作法見上面「`app/models.py`」章節。

**改了 Settings 裡的數值，下次跑 `ingest.py` 會套用嗎？**
會。`ingest.py` 和「Sync inbox」按鈕都是即時讀取資料庫裡目前的 `PriceSetting`，不是寫死在程式碼裡。

**Emails per sync 設 0 會怎樣？**
系統不會呼叫 Gmail API，直接跳過抓信（不會出現「未設定」的錯誤）。新建的資料庫預設就是 0，需要自己到 Settings 調整成想要的數字才會開始抓信。

**Gmail 授權失效**：刪除 `token.json`，重新觸發一次 Sync，會重新跳出瀏覽器登入畫面。

**Ollama 沒回應 / Dashboard 顯示離線**：確認 `ollama serve` 有在跑（預設 port `11434`），以及 `ollama pull qwen3.5:4b` 已經下載過模型。
