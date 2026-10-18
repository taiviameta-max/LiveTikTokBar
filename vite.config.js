import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { tiktokLiveBridge } from './server/tiktok-live-bridge.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'BAR_');
  return {
    plugins: [
      react(),
      tailwindcss(),
      tiktokLiveBridge({
        username: env.BAR_TIKTOK_USERNAME,
        allowedOrigins: env.BAR_ALLOWED_ORIGINS,
        giftMappings: {
          ZOOM: env.BAR_GIFT_ZOOM ?? 'Rose;Hoa hồng',
          FLY_ZOOM: env.BAR_GIFT_FLY_ZOOM ?? 'TikTok',
          SANTO: env.BAR_GIFT_SANTO,
          BREAKDANCE: env.BAR_GIFT_BREAKDANCE,
          'ĐI VÒNG': env.BAR_GIFT_DI_VONG,
          'PHÁO HOA': env.BAR_GIFT_PHAO_HOA,
          'ĐỔI NHÂN VẬT': env.BAR_GIFT_DOI_NHAN_VAT,
        },
      }),
    ],
  };
});
