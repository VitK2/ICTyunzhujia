import { defineConfig } from 'vite';
export default defineConfig({
  server:{port:5173,strictPort:true,proxy:{'/api':'http://127.0.0.1:5174'}},
  build:{rollupOptions:{output:{manualChunks:{three:['three'],react:['react','react-dom'],icons:['lucide-react']}}}}
});
