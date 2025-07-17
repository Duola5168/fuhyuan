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

## ⚠️ QNAP NAS 重要設定

為了讓本應用程式能直接上傳檔案至您的 NAS，**您必須在 NAS 上手動設定跨來源資源共用 (CORS)**。若未設定，上傳將會失敗。

**設定步驟：**

1.  登入您的 QTS 管理介面。
2.  前往 **控制台 > 應用服務 > 網頁伺服器**。
3.  勾選 **啟用網頁伺服器**。
4.  在下方找到並勾選 **允許跨來源資源共用 (CORS)**。
5.  系統可能會要求您指定允許的來源，請在此處填入您部署此應用程式的網址 (例如 `https://your-app.netlify.app`)。若不確定，可暫時先設為 `*`，但基於安全性考量，建議指定明確的網址。
6.  點擊 **套用**。

此設定允許本應用程式的網頁前端直接與您的 NAS API 溝通。
