import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      define: {
        // 使用更明確的變數名稱來注入金鑰，提升程式碼可讀性與安全性
        'process.env.GOOGLE_API_KEY': JSON.stringify(env.GOOGLE_API_KEY),
        'process.env.GOOGLE_CLIENT_ID': JSON.stringify(env.GOOGLE_CLIENT_ID),
        'process.env.BREVO_API_KEY': JSON.stringify(env.BREVO_API_KEY),
        'process.env.BREVO_SENDER_EMAIL': JSON.stringify(env.BREVO_SENDER_EMAIL),
        'process.env.BREVO_SENDER_NAME': JSON.stringify(env.BREVO_SENDER_NAME),
        'process.env.BREVO_RECIPIENT_EMAIL': JSON.stringify(env.BREVO_RECIPIENT_EMAIL),
      },
      resolve: {
        alias: {
          '@': path.resolve('.'),
        }
      }
    };
});
