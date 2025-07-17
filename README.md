# 富元機電 - 工作服務單應用程式 (V1.4)

這是一個現代、高效的網頁應用程式，旨在數位化並簡化建立、管理及分享工作服務單的流程。它特別為需要在現場工作的服務人員設計，提供了一個從資料填寫到客戶簽名、再到 PDF 報告產出的一站式解決方案。

## ✨ 功能亮點

*   **📄 直覺的表單介面**：清晰易用的表單，包含所有必要欄位，如服務單位、處理事項、產品項目及備註。
*   **✍️ 數位簽名**：服務人員與客戶可以直接在裝置螢幕上簽名，取代傳統紙本作業。
*   **📸 現場照片上傳**：可直接使用裝置相機拍照或從相簿上傳多張現場照片，並自動附加到報告中。
*   **💾 本機暫存系統**：可將未完成的服務單儲存為多個本地暫存檔，隨時載入繼續編輯，無需擔心資料遺失。
*   **☁️ 雲端與本地儲存**：
    *   **Google Drive**：可將暫存檔安全地匯出/匯入至您的 Google 雲端硬碟，輕鬆實現跨裝置工作。
    *   **QNAP NAS**：可將最終產出的 PDF 服務單直接上傳至您公司指定的 NAS 伺服器歸檔。
*   **🚀 即時 PDF 產生與分享**：
    *   一鍵產生專業、排版精美的 PDF 服務單報告。
    *   支援智慧分頁，當內容過多時會自動分成多頁。
    *   附加的照片會自動整理成獨立的附錄頁面。
    *   可直接下載 PDF 或使用 Email **(透過 Brevo)** 將報告傳送給客戶。
*   **🔒 安全第一**：所有 API 金鑰（Google, Brevo, NAS）等敏感資訊採用業界標準的環境變數進行管理，絕不外洩於程式碼中。
*   **📱 跨裝置相容**：採用響應式設計，在手機、平板和桌上型電腦上都能提供良好的操作體驗。

## 🛠️ 本機開發設定

**開發前提：** 需先安裝 [Node.js](https://nodejs.org/)。

1.  **安裝專案依賴**：
    在專案根目錄下執行指令以安裝所有必要的套件。
    ```sh
    npm install
    ```

2.  **設定環境變數 (安全性關鍵步驟)**：
    在專案的根目錄中，手動建立一個名為 `.env.local` 的檔案。這個檔案將用於存放您的秘密金鑰，**它已經被設定為不會上傳到 GitHub，確保金鑰安全**。

3.  **將您的秘密金鑰新增至 `.env.local`**：
    打開 `.env.local` 檔案，並貼上以下內容。請將引號中的預留位置文字，替換成您從各服務平台取得的真實金鑰。

    ```
    # .env.local

    # Google Drive 匯入/匯出功能所需金鑰
    # 關於如何取得金鑰，請參考 Google Cloud Platform 的官方文件。您需要啟用 `Google Drive API` 和 `Google Picker API`。
    GOOGLE_API_KEY="在這裡貼上您的 Google API 金鑰"
    GOOGLE_CLIENT_ID="在這裡貼上您的 Google OAuth 2.0 用戶端 ID"

    # Brevo (Email 發送功能) 所需金鑰
    # 請登入您的 Brevo 帳戶，前往 "SMTP & API" 頁面取得。
    BREVO_API_KEY="在這裡貼上您的 Brevo v3 API 金鑰"
    BREVO_SENDER_EMAIL="您在 Brevo 上已驗證的寄件人 Email"
    BREVO_SENDER_NAME="富元機電有限公司"

    # QNAP NAS 上傳功能所需金鑰
    # 請填寫您的 QNAP NAS 連線資訊。
    NAS_ENDPOINT="您的 NAS 網址，包含通訊埠，例如 https://your-nas.myqnapcloud.com:8081"
    NAS_USERNAME="您的 NAS 登入帳號"
    NAS_PASSWORD="您的 NAS 登入密碼"
    UPLOAD_PATH="您希望儲存服務單的資料夾路徑，例如 /Public/WorkOrders"
    ```

4.  **啟動本地開發伺服器**：
    ```sh
    npm run dev
    ```
    應用程式現在將會在您的本機電腦上運行，並能夠安全地讀取您設定的金鑰。

## 🚀 部署至 Netlify (或其他託管平台)

當您要將此應用程式部署到 Netlify 等平台時，**必須** 在該平台的網站設定中，手動設定與 `.env.local` 中**相同名稱**與**相同值**的環境變數，以確保正式環境的雲端及郵件功能可以正常運作。

**設定步驟 (以 Netlify 為例):**

1.  登入 Netlify 並選擇您的網站。
2.  前往 **Site configuration > Environment variables**。
3.  點擊 **Add a variable**，然後一個一個地新增以下所有變數：
    *   `GOOGLE_API_KEY`
    *   `GOOGLE_CLIENT_ID`
    *   `BREVO_API_KEY`
    *   `BREVO_SENDER_EMAIL`
    *   `BREVO_SENDER_NAME`
    *   `NAS_ENDPOINT`
    *   `NAS_USERNAME`
    *   `NAS_PASSWORD`
    *   `UPLOAD_PATH`
4.  新增完畢後，觸發一次新的部署 (re-deploy)，讓設定生效。

## ⚠️ QNAP NAS 重要設定：解決 `Failed to fetch` 上傳錯誤

當您在 Netlify 上部署的應用程式中，嘗試上傳檔案到 NAS 時，如果看到 `Failed to fetch` 或類似的網路錯誤訊息，**這 99% 的機率是「跨來源資源共用 (CORS)」設定問題**，而不是您在 Netlify 的參數填寫錯誤。

### 錯誤原因：什麼是 CORS？

CORS (Cross-Origin Resource Sharing) 是瀏覽器的一項內建安全機制。它會阻止一個網站（例如 `https://your-app.netlify.app`）向另一個不同網域的伺服器（例如 `https://your-nas.myqnapcloud.com:8081`）發送請求，除非該伺服器明確表示「我允許來自那個網站的請求」。

簡單來說，您的 **NAS 伺服器** 需要設定一個「許可名單」，將您的 Netlify 應用程式網址加進去。

### 如何解決：請選擇一種設定方法

QNAP 提供了兩種方法來解決此問題。**我們強烈建議使用方法一**，因為它最直接、最簡單、也最不容易出錯。

---

### ✅ 方法一：直接設定 CORS (最推薦、最簡單)

此方法直接在 QNAP 的網頁伺服器中設定，是最標準的作法。

1.  **登入您的 QTS 管理介面。**

2.  **開啟「控制台 (Control Panel)」。**

3.  **前往「應用服務 (Applications)」 > 「網頁伺服器 (Web Server)」。**

4.  **啟用網頁伺服器並尋找 CORS 設定：**
    *   首先，確保 **啟用網頁伺服器 (Enable Web Server)** 的選項是 **勾選** 狀態。

    *   **步驟 A: 尋找並設定「CORS」頁籤**
        *   在「網頁伺服器」的視窗頂部，找到名為 **「CORS」** 的頁籤。
        *   **如果找不到「CORS」頁籤**，請先前往 **App Center** 更新您的 **「Web Server」** 應用程式至最新版本，然後再回來尋找。
        *   **如果更新後依然沒有**，請跳至下面的 **[方法二](#️-方法二設定反向代理-較複雜)**。

    *   **步驟 B: 新增允許的來源**
        1.  切換到 **CORS** 頁籤。
        2.  勾選 **允許跨來源資源共用 (CORS)**。
        3.  在下方的 **允許的來源 (Allowed-Origin)** 輸入框中，**務必** 填入您 Netlify 應用程式的 **完整網址**。
            *   **如何找到正確的網址？** 請直接複製您瀏覽器網址列中顯示的網址。
            *   例如：`https://fuhyuan.netlify.app` 或 `https://some-random-name.netlify.app`
            *   <span style="color: red; font-weight: bold;">請勿</span> 在網址結尾加上斜線 `/`。
        4.  點擊 **「套用 (Apply)」** 儲存設定。

5.  **完成！**
    *   設定完成後，**無需** 重新部署 Netlify 應用程式。
    *   請直接回到應用程式頁面，**刷新瀏覽器** 後再次嘗試上傳。問題應已解決。

---

### ⚠️ 方法二：設定反向代理 (較複雜，請謹慎使用)

此方法是透過 QNAP 的反向代理功能來間接繞過 CORS 限制。除非您確定方法一在您的裝置上不可行，否則不建議使用此方法，因為它會增加設定的複雜度。

1.  **登入 QTS，前往「控制台」 > 「網路 & 虛擬交換器」 > 「反向代理」。**

2.  **按一下「新增」並建立規則。**

3.  **填寫規則內容：**
    *   **規則名稱：** 自訂一個名稱，例如 `WorkOrderApp`。
    *   **來源：**
        *   **通訊協定：** `HTTPS`
        *   **主機名稱：** `*` (星號)
        *   **連接埠：** 設定一個**尚未被佔用**的連接埠，例如 `4430`。**請記下這個號碼。**
    *   **目的地：**
        *   **通訊協定：** `HTTPS` (如果您的 NAS 有 SSL 憑證) 或 `HTTP` (如果沒有)。
        *   **主機名稱：** `localhost`
        *   **連接埠：** 填寫您 File Station 服務的**原始連接埠** (通常是 `8081` 或您自訂的號碼)。

4.  **按一下「選項」，勾選「新增標頭」並新增以下兩行：**
    *   `Access-Control-Allow-Origin: *`
    *   `Access-Control-Allow-Methods: POST, GET, OPTIONS`

5.  **按一下「套用」儲存規則。**

6.  **【最關鍵的一步】更新您應用程式的環境變數：**
    *   使用此方法時，您**必須**回去修改您應用程式的 `NAS_ENDPOINT` 環境變數。
    *   **原本的 NAS_ENDPOINT：** `https://your-nas.myqnapcloud.com:8081`
    *   **新的 NAS_ENDPOINT：** 必須是您在**反向代理規則「來源」**中設定的網址與連接埠。
        *   例如：`https://your-nas.myqnapcloud.com:4430` (請將 `4430` 換成您在步驟 3 設定的連接埠)
    *   **請登入 Netlify (或修改您的 `.env.local` 檔案)，將 `NAS_ENDPOINT` 的值更新為這個新的網址。**
    *   如果您是在 Netlify 上修改，請務必**重新部署 (re-deploy)** 網站讓設定生效。

7.  **完成後，回到應用程式頁面進行測試。**
