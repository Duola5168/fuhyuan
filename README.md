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

### 關鍵釐清：CORS vs. 反向代理 (Reverse Proxy)

許多使用者會將這兩者混淆，這也是導致設定失敗的主要原因。
*   **反向代理 (Reverse Proxy)**：是將來自外部的請求「轉發」到您 NAS 內部的特定服務。**這不是我們需要的設定。**
*   **CORS (Cross-Origin Resource Sharing)**：是您的 NAS 網頁伺服器向瀏覽器發出的一個「許可」，告訴瀏覽器：「我允許來自 `https://fuhyuan.netlify.app` 這個網站的請求」。**這才是解決 `Failed to fetch` 錯誤的正確設定。**

### 設定步驟

**您必須登入您的 QNAP NAS 並依照以下步驟設定，才能解決此問題：**

1.  **登入您的 QTS 管理介面。**

2.  **開啟「控制台 (Control Panel)」。**

3.  **前往「應用服務 (Applications)」 > 「網頁伺服器 (Web Server)」。**

4.  **啟用網頁伺服器並尋找 CORS 設定：**
    *   首先，確保 **啟用網頁伺服器 (Enable Web Server)** 的選項是 **勾選** 狀態。

    *   **步驟 A: 檢查「CORS」頁籤是否存在 (建議方法)**
        *   在「網頁伺服器」的視窗頂部，檢查是否有一個名為 **「CORS」** 的頁籤 (通常在「網站伺服器」和「虛擬主機」旁邊)。
        *   **如果「CORS」頁籤存在：** 這是最理想的情況。
            1.  切換到 **CORS** 頁籤。
            2.  勾選 **允許跨來源資源共用 (CORS)**。
            3.  在下方的 **允許的來源 (Allowed-Origin)** 輸入框中，**務必** 填入您 Netlify 應用程式的 **完整網址** (假設您的網址是 `fuhyuan.netlify.app`)：
                ```
                https://fuhyuan.netlify.app
                ```
            4.  **請勿** 在網址結尾加上斜線 `/`。
            5.  點擊 **「套用 (Apply)」** 儲存設定。問題應已解決！

    *   **步驟 B: 如果找不到「CORS」頁籤，請先更新**
        *   這通常表示您的 QTS 作業系統或「網頁伺服器」應用程式版本較舊。
        *   **1. 檢查 QTS 韌體更新：** 前往 **控制台 > 系統 > 韌體更新**。即使您認為韌體已是最新，仍請再次檢查，有時可能存在主要的版本更新。
        *   **2. 檢查網頁伺服器應用程式更新：** 前往 **App Center**，在搜尋框中找到 **「Web Server」** 應用程式，檢查其本身是否有獨立的更新。更新此應用程式可能會新增 CORS 設定頁籤。
        *   完成更新後，重新執行**步驟 A**。如果「CORS」頁籤依然不存在，請繼續執行**步驟 C**。

    *   **步驟 C: 終極解決方案 (手動設定 - 進階)**
        *   **警告：** 此方法涉及透過 SSH 遠端連線來修改系統設定檔。不正確的修改可能導致您的網頁伺服器無法運作。請謹慎操作。
        *   **1. 在 QNAP 上啟用 SSH 服務：**
            *   前往 **控制台 > 網路 & 檔案服務 > Telnet / SSH**。
            *   勾選 **允許 SSH 連線**，並記下通訊埠號碼 (預設為 22)。點擊「套用」。
        *   **2. 使用 SSH 用戶端連線至您的 NAS：**
            *   **Windows 使用者：** 可下載 [PuTTY](https://www.putty.org/) 或使用 Windows 內建的 OpenSSH Client。
            *   **macOS / Linux 使用者：** 可直接使用「終端機 (Terminal)」。
            *   在您的終端機或命令提示字元中輸入以下指令 (請替換為您的 NAS 管理員帳號及 IP 位址)：
                ```sh
                ssh 您的NAS管理員帳號@您的NAS的內網IP位址
                ```
            *   連線成功後，輸入您的管理員密碼。
        *   **3. 找到並編輯 Apache 設定檔：**
            *   QNAP 的網頁伺服器是 Apache。我們需要編輯它的設定檔。輸入以下指令，使用 `vi` 編輯器開啟設定檔：
                ```sh
                vi /etc/config/apache/apache.conf
                ```
        *   **4. 新增 CORS 相關設定：**
            *   進入 `vi` 編輯器後，按鍵盤上的 `i` 鍵進入「插入模式 (Insert Mode)」。
            *   使用方向鍵將游標移動到檔案的最底部，然後**複製並貼上**以下所有程式碼：
                ```apache
                # === BEGIN CORS CONFIG FOR WORK ORDER APP ===
                <IfModule headers_module>
                    Header set Access-Control-Allow-Origin "https://fuhyuan.netlify.app"
                    Header set Access-Control-Allow-Methods "POST, GET, OPTIONS"
                    Header set Access-Control-Allow-Headers "X-Requested-With, Content-Type, Authorization"
                </IfModule>
                # === END CORS CONFIG ===
                ```
        *   **5. 儲存設定並離開編輯器：**
            *   按下鍵盤上的 `Esc` 鍵退出插入模式。
            *   接著，輸入 `:wq` (冒號、w、q)，然後按下 `Enter` 鍵。這會儲存檔案並退出 `vi`。
        *   **6. 重新啟動網頁伺服器以載入新設定：**
            *   最簡單的方法是回到 QTS 的「網頁伺服器」設定介面。
            *   **取消勾選**「啟用網頁伺服器」，點擊「套用」。
            *   等待幾秒鐘後，**重新勾選**「啟用網頁伺服器」，再次點擊「套用」。
            *   這個操作會強制 Apache 重新讀取您剛才修改的 `apache.conf` 設定檔。
        *   **7. 測試上傳功能：**
            *   回到您在 Netlify 上的應用程式頁面，刷新頁面後再次嘗試上傳檔案。此時應該可以成功。
        *   **8. (建議) 停用 SSH 服務：**
            *   為了安全起見，完成設定後可回到 QTS 控制台停用 SSH 服務。

5.  **完成設定後**，您 **無需** 重新部署 Netlify 應用程式。請直接回到應用程式頁面，刷新頁面後再次嘗試上傳。
