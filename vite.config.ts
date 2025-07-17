import path from 'path';
import { defineConfig } from 'vite';
import { readFileSync } from 'fs';

// 從 package.json 讀取版本號，作為版本管理的唯一來源
const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
const appVersion = packageJson.version;

export default defineConfig({
  define: {
    // 將版本號注入到前端程式碼中，供 App.tsx 使用
    '__APP_VERSION__': JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      '@': path.resolve('.'),
    }
  }
});
