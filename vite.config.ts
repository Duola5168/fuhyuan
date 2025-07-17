import path from 'path';
import { defineConfig } from 'vite';
import { readFileSync } from 'fs';

// 從 package.json 讀取版本號，作為版本管理的唯一來源
const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
const appVersion = packageJson.version;

export default defineConfig(({ mode }) => {
    return {
      define: {
        // 將版本號注入到前端程式碼中，使用一個自訂的全域常數以避免汙染 process.env
        '__APP_VERSION__': JSON.stringify(appVersion),
      },
      resolve: {
        alias: {
          '@': path.resolve('.'),
        }
      },
      // 讓 Vite 自動處理 .env 檔案，並透過 import.meta.env 存取
      // 不需要手動定義 process.env.GOOGLE_API_KEY 等變數
    };
});
