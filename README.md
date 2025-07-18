# 富元機電 - 工作服務單應用程式 (V1.6)

這是一個現代、高效的網頁應用程式，旨在數位化並簡化建立、管理及分享工作服務單的流程。它特別為需要在現場工作的服務人員設計，提供了一個從資料填寫到客戶簽名、再到 PDF 報告產出的一站式解決方案。

## ✨ V1.6 重大更新

*   **☁️ 全新的 Dropbox 上傳引擎**：完全整合 Dropbox API，現在您可以將最終產出的 PDF 服務單**直接、穩定地**上傳至您指定的 Dropbox 資料夾 (`/工作服務單`)，方便後續由 HBS 等工具同步至 NAS 進行歸檔。
*   **📄 全新的設定教學**：`README.md` 文件已完全重寫，提供詳細的圖文教學，引導您如何在 Dropbox 開發者平台建立應用程式、取得存取權杖 (Access Token)。
*   **🧹 程式碼重構**：移除了所有舊的 QNAP NAS S3 物件儲存相關程式碼，使專案更輕量、更易於維護。

## ✨ 功能亮點

*   **📄 直覺的表單介面**：清晰易用的表單，包含所有必要欄位。
*   **✍️ 數位簽名**：服務人員與客戶可以直接在裝置螢幕上簽名。
*   **📸 現場照片上傳**：可直接使用裝置相機拍照或從相簿上傳多張現場照片。
*   **💾 本機暫存系統**：可將未完成的服務單儲存為多個本地暫存檔。
*   **☁️ 雲端儲存與同步**：
    *   **Dropbox**：可將最終產出的 PDF 服務單**直接上傳**至您公司指定的 Dropbox 資料夾歸檔。
    *   **Google Drive**：可將暫存檔安全地匯出/匯入至您的 Google 雲端硬碟。
*   **🚀 即時 PDF 產生與分享**：一鍵產生專業、排版精美的 PDF 服務單報告，支援智慧分頁與照片附錄。
*   **🔒 安全第一**：所有 API 金鑰等敏感資訊採用業界標準的環境變數進行管理。
*   **📱 跨裝置相容**：採用響應式設計，在手機、平板和桌上型電腦上都能提供良好的操作體驗。

## 🛠️ 本機開發設定

**開發前提：** 需先安裝 [Node.js](https://nodejs.org/)。

1.  **安裝專案依賴**：
    ```sh
    npm install
    ```

2.  **設定環境變數 (安全性關鍵步驟)**：
    在專案的根目錄中，手動建立一個名為 `.env.local` 的檔案。

3.  **將您的秘密金鑰新增至 `.env.local`**：
    打開 `.env.local` 檔案，並貼上以下內容。請將引號中的預留位置文字，替換成您從各服務平台取得的真實金鑰。

    ```
    # .env.local

    # ===============================================================
    # Dropbox 上傳功能所需金鑰 (V1.6 全新)
    # 請參考下方的 "Dropbox 設定指南" 來取得這個值
    # ===============================================================
    DROPBOX_ACCESS_TOKEN="在這裡貼上您產生的 Dropbox Access Token"

    # Google Drive 匯入/匯出功能所需金鑰
    GOOGLE_API_KEY="在這裡貼上您的 Google API 金鑰"
    GOOGLE_CLIENT_ID="在這裡貼上您的 Google OAuth 2.0 用戶端 ID"

    # Brevo (Email 發送功能) 所需金鑰
    BREVO_API_KEY="在這裡貼上您的 Brevo v3 API 金鑰"
    BREVO_SENDER_EMAIL="您在 Brevo 上已驗證的寄件人 Email"
    BREVO_SENDER_NAME="富元機電有限公司"
    ```

4.  **啟動本地開發伺服器**：
    ```sh
    npm run dev
    ```

## 🚀 部署至 Netlify

當您要將此應用程式部署到 Netlify 時，**必須** 在該平台的網站設定中，手動設定與 `.env.local` 中**相同名稱**與**相同值**的環境變數。

**設定步驟 (以 Netlify 為例):**

1.  登入 Netlify 並選擇您的網站。
2.  前往 **Site configuration > Build & deploy > Environment variables**。
3.  點擊 **Add a variable**，然後一個一個地新增**所有**必要的變數（包含 **全新的 `DROPBOX_ACCESS_TOKEN`** 以及 Google 和 Brevo 的變數）。
4.  新增完畢後，觸發一次新的部署 (re-deploy)，讓設定生效。

---

## ⚠️ Dropbox 設定指南 (V1.6 全新)：啟用 PDF 上傳功能

為了讓應用程式能夠將產生的服務單 PDF 上傳到您的 Dropbox，您需要建立一個 Dropbox 應用程式並產生一個存取權杖 (Access Token)。

### 步驟 1：建立一個 Dropbox 應用程式

1.  **前往 Dropbox App Console**：打開瀏覽器，登入您的 Dropbox 帳號後，前往 [https://www.dropbox.com/developers/apps](https://www.dropbox.com/developers/apps)。
2.  **點擊「Create app」按鈕。**
3.  **選擇 API 類型**：選擇 **"Scoped access"**。這是權限最精簡、最安全的選項。
4.  **選擇權限類型**：選擇 **"App folder"**。這會為您的應用程式建立一個專屬的資料夾，應用程式只能存取這個資料夾內的檔案，無法動到您 Dropbox 的其他內容。
5.  **為您的應用程式命名**：輸入一個您能識別的名稱，例如 `FuhYuan-WorkOrder-Uploader`。名稱中不能包含 "dropbox" 字樣。
6.  點擊 **"Create app"** 完成建立。

### 步驟 2：設定應用程式權限

建立應用程式後，您會被導向到該應⽤的設定頁面。

1.  切換到 **"Permissions"** 頁籤。
2.  在權限列表中，找到 **Files and Folders** 區塊。
3.  勾選 **`files.content.write`** 這個權限。這允許應用程式將檔案寫入其專屬的 App folder 中。
4.  **點擊頁面底部的 "Submit" 按鈕** 來儲存權限變更。

### 步驟 3：產生並取得存取權杖 (Access Token)

這是最關鍵的一步，這個權杖就是應用程式用來認證的「密碼」。

1.  切換回到 **"Settings"** 頁籤。
2.  向下捲動，找到 **"Generated access token"** 區塊。
3.  **點擊「Generate」按鈕**。系統會產生一長串的字元，這就是您的存取權杖。
4.  **🚨 極度重要：** **請立刻將這串權杖完整複製下來**，並貼到您專案中 `.env.local` 檔案的 `DROPBOX_ACCESS_TOKEN` 變數值中。
    *   例如： `DROPBOX_ACCESS_TOKEN="sl.B...一長串隨機字元..._qz"`
    *   這個權杖**只會完整顯示這一次**，為了安全，Dropbox 不會儲存它。如果遺失了，只能重新產生一個。

### ✅ 完成！

所有 Dropbox 相關的設定均已完成！請確保您已將 `DROPBOX_ACCESS_TOKEN` 環境變數正確填寫到您的 `.env.local` 檔案（用於本地開發）或 Netlify 網站設定中（用於正式部署），並重新部署。現在，應用程式應該能夠順利地上傳 PDF 檔案到您的 Dropbox 了。

上傳的檔案會位於 `Dropbox/應用程式/您自訂的應用程式名稱/工作服務單/` 這個路徑底下。
