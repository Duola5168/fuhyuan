import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { readFileSync } from 'fs';

// 從 package.json 讀取版本號，作為版本管理的唯一來源
const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
const appVersion = packageJson.version;

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      define: {
        // 將版本號注入到前端程式碼中
        'process.env.APP_VERSION': JSON.stringify(appVersion),
        // 使用更明確的變數名稱來注入金鑰，提升程式碼可讀性與安全性
        'process.env.GOOGLE_API_KEY': JSON.stringify(env.GOOGLE_API_KEY),
        'process.env.GOOGLE_CLIENT_ID': JSON.stringify(env.GOOGLE_CLIENT_ID),
        'process.env.BREVO_API_KEY': JSON.stringify(env.BREVO_API_KEY),
        'process.env.BREVO_SENDER_EMAIL': JSON.stringify(env.BREVO_SENDER_EMAIL),
        'process.env.BREVO_SENDER_NAME': JSON.stringify(env.BREVO_SENDER_NAME),
      },
      resolve: {
        alias: {
          '@': path.resolve('.'),
        }
      }
    };
});
