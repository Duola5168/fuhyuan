# 富元機電 - 工作服務單應用程式 (V2.0)

這是一個現代、高效的網頁應用程式，旨在數位化並簡化建立、管理及分享工作服務單的流程。它特別為需要在現場工作的服務人員設計，提供了一個從資料填寫到客戶簽名、再到 PDF 報告產出的一站式解決方案。

## ✨ 功能亮點

*   **📄 直覺的表單介面**：清晰易用的表單，包含所有必要欄位，如服務單位、處理事項、產品項目及備註。
*   **✍️ 數位簽名**：服務人員與客戶可以直接在裝置螢幕上簽名，取代傳統紙本作業。
*   **📸 現場照片上傳**：可直接使用裝置相機拍照或從相簿上傳多張現場照片，並自動附加到報告中。
*   **💾 本機暫存系統**：可將未完成的服務單儲存為多個本地暫存檔，隨時載入繼續編輯，無需擔心資料遺失。
*   **☁️ Google Drive 雲端同步**：
    *   **匯出**：可將包含所有照片和簽名的完整服務單，安全地匯出成 `.json` 檔案至您的 Google 雲端硬碟。
    *   **匯入**：可從您的雲端硬碟中選擇先前匯出的檔案，並將其直接存為一個新的本機暫存，輕鬆實現跨裝置工作。
*   **🚀 即時 PDF 產生與分享**：
    *   一鍵產生專業、排版精美的 PDF 服務單報告。
    *   **多重傳送選項**：產生報告後，可選擇將 PDF **上傳至內部 NAS**、透過 Email **(使用 Brevo)** 傳送給客戶，或兩者同時進行。
    *   支援智慧分頁，當內容過多時會自動分成多頁。
    *   附加的照片會自動整理成獨立的附錄頁面。
    *   可直接下載 PDF 或使用裝置內建功能分享檔案。
*   **🔒 安全第一**：所有敏感資訊 (Google API 金鑰、Brevo API 金鑰、NAS 登入憑證) 皆採用業界標準的環境變數進行管理，絕不外洩於前端程式碼中。後端通訊（如 NAS 上傳）透過安全的 Netlify Functions 進行。
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
    **重要提示：所有變數名稱都必須以 `VITE_` 開頭，這是 Vite 框架的要求。**

    ```
    # .env.local

    # Google Drive 匯入/匯出功能所需金鑰
    # 關於如何取得金鑰，請參考 Google Cloud Platform 的官方文件。您需要啟用 `Google Drive API` 和 `Google Picker API`。
    VITE_GOOGLE_API_KEY="在這裡貼上您的 Google API 金鑰"
    VITE_GOOGLE_CLIENT_ID="在這裡貼上您的 Google OAuth 2.0 用戶端 ID"

    # Brevo (Email 發送功能) 所需金鑰
    # 請登入您的 Brevo 帳戶，前往 "SMTP & API" 頁面取得。
    VITE_BREVO_API_KEY="在這裡貼上您的 Brevo v3 API 金鑰"
    VITE_BREVO_SENDER_EMAIL="您在 Brevo 上已驗證的寄件人 Email"
    VITE_BREVO_SENDER_NAME="富元機電有限公司"

    # QNAP NAS (PDF 上傳功能) 所需資訊 (這些不需要 VITE_ 前綴，因為它們只在後端 Function 中使用)
    # - NAS_ENDPOINT: 您的 NAS 網址，包含通訊埠 (例如: mynas.qnap.com:8080)。
    # - NAS_USERNAME: 您的 NAS 登入帳號。
    # - NAS_PASSWORD: 您的 NAS 登入密碼。
    # - UPLOAD_PATH: 檔案上傳至 NAS 的指定路徑 (例如: /Public/ServiceReports)。
    NAS_ENDPOINT="您的QNAP網域名稱或IP:通訊埠"
    NAS_USERNAME="您的NAS使用者帳號"
    NAS_PASSWORD="您的密碼"
    UPLOAD_PATH="/Public/ServiceReports"
    ```

4.  **啟動本地開發伺服器**：
    執行此指令前，您需要安裝 Netlify CLI 以便在本機測試 Serverless Function。
    ```sh
    # 安裝 Netlify CLI (只需執行一次)
    npm install netlify-cli -g
    
    # 啟動開發伺服器
    netlify dev
    ```
    應用程式現在將會在您的本機電腦上運行，並能夠安全地讀取您設定的金鑰及呼叫本地的 Function。

## 🚀 部署至 Netlify (或其他託管平台)

當您要將此應用程式部署到 Netlify 等平台時，**必須** 在該平台的網站設定中，手動設定與 `.env.local` 中**相同名稱**與**相同值**的環境變數，以確保正式環境的雲端、郵件及 NAS 功能可以正常運作。

**設定步驟 (以 Netlify 為例):**

1.  登入 Netlify 並選擇您的網站。
2.  前往 **Site configuration > Build & deploy > Environment variables**。
3.  點擊 **Add a variable**，然後一個一個地新增以下所有變數 (請注意 `VITE_` 前綴)：
    *   `VITE_GOOGLE_API_KEY`
    *   `VITE_GOOGLE_CLIENT_ID`
    *   `VITE_BREVO_API_KEY`
    *   `VITE_BREVO_SENDER_EMAIL`
    *   `VITE_BREVO_SENDER_NAME`
    *   `NAS_ENDPOINT`
    *   `NAS_USERNAME`
    *   `NAS_PASSWORD`
    *   `UPLOAD_PATH`
4.  新增完畢後，觸發一次新的部署 (re-deploy)，讓設定生效。
