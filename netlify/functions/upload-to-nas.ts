// 引入必要的函式庫
const axios = require('axios');
const FormData = require('form-data');

// 從 Netlify 環境變數中取得敏感資訊
// 這些變數會在 Netlify 介面中設定，不會直接寫在程式碼裡
const NAS_HOST = process.env.NAS_HOST;
const NAS_PORT = process.env.NAS_PORT || '8080';
const NAS_USERNAME = process.env.NAS_USERNAME;
const NAS_PASSWORD = process.env.NAS_PASSWORD;
const UPLOAD_PATH = process.env.UPLOAD_PATH || '/Public/Uploads';

// 這是一個 Netlify Function 的標準入口點
// event 包含了請求的詳細資訊 (例如請求方法、Header、Body)
// context 包含了執行環境的資訊
exports.handler = async (event, context) => {
    // 1. 檢查請求方法 (只允許 POST)
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405, // 405 Method Not Allowed
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: '此 Function 只接受 POST 請求。' }),
        };
    }

    // 檢查必要的環境變數是否已設定
    if (!NAS_HOST || !NAS_USERNAME || !NAS_PASSWORD || !UPLOAD_PATH) {
      console.error('NAS 環境變數未完整設定。');
      return {
          statusCode: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '伺服器錯誤：NAS 連線資訊未完整設定。' }),
      };
    }

    let sid = null; // 用來儲存 QNAP NAS 的 Session ID

    try {
        // --- 2. 登入 QNAP NAS 取得 SID ---
        console.log('嘗試登入 QNAP NAS...');
        const loginUrl = `http://${NAS_HOST}:${NAS_PORT}/cgi-bin/authLogin.cgi`;

        // QNAP API 需要用 application/x-www-form-urlencoded 格式傳送登入資訊
        const loginParams = new URLSearchParams();
        loginParams.append('user', NAS_USERNAME);
        loginParams.append('pwd', Buffer.from(NAS_PASSWORD).toString('base64')); // QNAP API 需要 Base64 編碼的密碼
        loginParams.append('service_key', '1');

        const loginResponse = await axios.post(loginUrl, loginParams, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            responseType: 'text', // QNAP API 回應通常是 XML
        });
        
        // 解析登入回應，從 XML 中提取 SID
        const sidMatch = loginResponse.data.match(/<authSid>(.*?)<\/authSid>/);
        if (sidMatch && sidMatch[1]) {
            sid = sidMatch[1];
            console.log(`成功登入。SID: ${sid}`);
        } else {
            // 如果無法解析 SID，拋出錯誤
            console.error('QNAP 登入回應:', loginResponse.data);
            throw new Error('無法從 QNAP 登入回應中取得 SID。請檢查帳號密碼或 NAS API 設定。');
        }

        // --- 3. 處理來自前端的檔案數據 ---
        // 假設前端會將檔案內容 Base64 編碼後，放在 JSON 的 body 中傳送
        const { fileName, fileContentBase64 } = JSON.parse(event.body);
        if (!fileName || !fileContentBase64) {
            throw new Error('請求 Body 中缺少檔名或檔案內容 (Base64)。');
        }

        // 將 Base64 編碼的檔案內容轉換回 Buffer (二進制數據)
        const fileBuffer = Buffer.from(fileContentBase64, 'base64');

        // --- 4. 上傳檔案到 QNAP NAS ---
        console.log(`正在上傳檔案: ${fileName} 到 ${UPLOAD_PATH} ...`);
        const uploadUrl = `http://${NAS_HOST}:${NAS_PORT}/cgi-bin/filemanager/utilRequest.cgi?func=upload&sid=${sid}&type=standard`;

        // 建立 FormData 物件來模擬表單提交，用於檔案上傳
        const form = new FormData();
        form.append('dest_path', UPLOAD_PATH); // 目標路徑
        form.append('overwrite', '1'); // 如果檔案存在就覆蓋
        form.append('progress', fileName); // 使用檔名作為進度標識
        form.append(fileName, fileBuffer, { filename: fileName }); // 檔案數據和原始檔名

        const uploadResponse = await axios.post(uploadUrl, form, {
            headers: {
                ...form.getHeaders(), // 這是 FormData 必要的 Header
            },
            responseType: 'text', // QNAP 回應可能是 XML
        });

        // 解析上傳回應
        // QNAP 的成功回應通常包含 <status>1</status>
        const uploadResultMatch = uploadResponse.data.match(/<status>(.*?)<\/status>/);
        if (uploadResultMatch && uploadResultMatch[1] === '1') {
            console.log('檔案上傳成功！');
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: '檔案上傳成功！', filePath: `${UPLOAD_PATH}/${fileName}` }),
            };
        } else {
            console.error('QNAP 上傳回應:', uploadResponse.data);
            throw new Error('上傳檔案到 QNAP NAS 失敗。');
        }

    } catch (error) {
        console.error('上傳過程中發生錯誤:', error.message);
        let errorMessage = '上傳過程中發生未知錯誤。';
        if (axios.isAxiosError(error)) {
            if (error.response) {
                // 如果是 QNAP API 回傳的錯誤
                errorMessage = `QNAP API 錯誤: ${error.response.status} - ${error.response.data}`;
            } else if (error.request) {
                // 如果請求沒有收到回應
                errorMessage = '未從 QNAP NAS 收到回應。請檢查網路或 NAS 主機狀態。';
            }
        } else if (error instanceof Error) {
            // 其他錯誤
            errorMessage = error.message;
        }

        return {
            statusCode: 500, // 500 Internal Server Error
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: errorMessage }),
        };
    } finally {
        // --- 5. 登出 QNAP NAS (非常重要！釋放資源) ---
        if (sid) {
            try {
                const logoutUrl = `http://${NAS_HOST}:${NAS_PORT}/cgi-bin/authLogout.cgi?sid=${sid}`;
                await axios.get(logoutUrl);
                console.log('成功從 QNAP NAS 登出。');
            } catch (logoutError) {
                console.error('QNAP 登出時發生錯誤:', logoutError.message);
            }
        }
    }
};
