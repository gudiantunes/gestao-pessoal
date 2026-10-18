import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'script-defer',
            includeAssets: ['icon.svg'],
            manifest: {
                name: 'Rota Oficina',
                short_name: 'Rota',
                description: 'Gerenciador geral de vida',
                lang: "pt-BR",
                display: "standalone",
                background_color: "#EDEFEC",
                theme_color: "#EDEFEC",
                "icons": [
                    {
                    "src": "icon.svg",
                    "sizes": "any",
                    "type": "image/svg+xml",
                    "purpose": "any"
                    }
                ]
            }
        })
    ]
})


