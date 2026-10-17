const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const iconsDir = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

// 1. Create Base SVG Icon
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#18181B"/>
            <stop offset="100%" stop-color="#000000"/>
        </linearGradient>
        <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#FFFFFF"/>
            <stop offset="100%" stop-color="#E4E4E7"/>
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.5"/>
        </filter>
    </defs>
    <!-- Background rounded square -->
    <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>
    <rect x="12" y="12" width="488" height="488" rx="100" fill="none" stroke="#27272A" stroke-width="4"/>

    <!-- Geometric Origami Bunny / Crown Crest Emblem -->
    <g transform="translate(256, 256)" filter="url(#glow)">
        <!-- Left Ear -->
        <polygon points="-70,-170 -120,-60 -50,-30" fill="url(#accentGrad)" opacity="0.95"/>
        <polygon points="-120,-60 -70,-170 -95,-180" fill="#A1A1AA" opacity="0.8"/>
        
        <!-- Right Ear -->
        <polygon points="70,-170 120,-60 50,-30" fill="url(#accentGrad)" opacity="0.95"/>
        <polygon points="120,-60 70,-170 95,-180" fill="#A1A1AA" opacity="0.8"/>

        <!-- Central Head Diamond -->
        <polygon points="0,-75 80,-10 0,65 -80,-10" fill="#FFFFFF"/>
        
        <!-- Lower Facet / Chin -->
        <polygon points="0,65 60,135 0,165 -60,135" fill="url(#accentGrad)"/>
        
        <!-- Left Cheek -->
        <polygon points="-80,-10 0,65 -60,135 -110,50" fill="#D4D4D8"/>
        
        <!-- Right Cheek -->
        <polygon points="80,-10 0,65 60,135 110,50" fill="#E4E4E7"/>

        <!-- Radar Pulse Dot in Center (Hunter Radar Theme) -->
        <circle cx="0" cy="5" r="14" fill="#18181B"/>
        <circle cx="0" cy="5" r="6" fill="#22C55E"/>
    </g>
</svg>`;

// Maskable SVG with safe zone padding (minimum 10% padding for circular/squircle crop)
const maskableSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <rect width="512" height="512" fill="#000000"/>
    <g transform="translate(64, 64) scale(0.75)">
        <defs>
            <linearGradient id="mAccentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#FFFFFF"/>
                <stop offset="100%" stop-color="#E4E4E7"/>
            </linearGradient>
        </defs>
        <!-- Geometric Origami Bunny -->
        <g transform="translate(256, 256)">
            <polygon points="-70,-170 -120,-60 -50,-30" fill="url(#mAccentGrad)" opacity="0.95"/>
            <polygon points="-120,-60 -70,-170 -95,-180" fill="#A1A1AA" opacity="0.8"/>
            <polygon points="70,-170 120,-60 50,-30" fill="url(#mAccentGrad)" opacity="0.95"/>
            <polygon points="120,-60 70,-170 95,-180" fill="#A1A1AA" opacity="0.8"/>
            <polygon points="0,-75 80,-10 0,65 -80,-10" fill="#FFFFFF"/>
            <polygon points="0,65 60,135 0,165 -60,135" fill="url(#mAccentGrad)"/>
            <polygon points="-80,-10 0,65 -60,135 -110,50" fill="#D4D4D8"/>
            <polygon points="80,-10 0,65 60,135 110,50" fill="#E4E4E7"/>
            <circle cx="0" cy="5" r="14" fill="#18181B"/>
            <circle cx="0" cy="5" r="6" fill="#22C55E"/>
        </g>
    </g>
</svg>`;

fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svgContent, 'utf8');
fs.writeFileSync(path.join(iconsDir, 'icon-maskable.svg'), maskableSvgContent, 'utf8');

const sizes = [
    { name: 'favicon-16.png', size: 16, maskable: false },
    { name: 'favicon-32.png', size: 32, maskable: false },
    { name: 'icon-72.png', size: 72, maskable: false },
    { name: 'icon-96.png', size: 96, maskable: false },
    { name: 'icon-128.png', size: 128, maskable: false },
    { name: 'icon-144.png', size: 144, maskable: false },
    { name: 'icon-152.png', size: 152, maskable: false },
    { name: 'apple-touch-icon.png', size: 180, maskable: false },
    { name: 'icon-192.png', size: 192, maskable: false },
    { name: 'icon-192-maskable.png', size: 192, maskable: true },
    { name: 'icon-384.png', size: 384, maskable: false },
    { name: 'icon-512.png', size: 512, maskable: false },
    { name: 'icon-512-maskable.png', size: 512, maskable: true }
];

async function generatePngs() {
    console.log("Launching headless browser to render PWA PNG icons...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ deviceScaleFactor: 1 });
    const page = await context.newPage();

    for (const item of sizes) {
        const svg = item.maskable ? maskableSvgContent : svgContent;
        const html = `<!DOCTYPE html>
        <html>
        <head>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { width: ${item.size}px; height: ${item.size}px; overflow: hidden; background: transparent; }
                svg { width: 100%; height: 100%; display: block; }
            </style>
        </head>
        <body>${svg}</body>
        </html>`;

        await page.setViewportSize({ width: item.size, height: item.size });
        await page.setContent(html);
        const outPath = path.join(iconsDir, item.name);
        await page.screenshot({ path: outPath, omitBackground: !item.maskable });
        console.log(`✓ Generated ${item.name} (${item.size}x${item.size})`);
    }

    await browser.close();
    console.log("✅ All PWA Icons generated successfully!");
}

generatePngs().catch(err => {
    console.error("Error generating icons:", err);
    process.exit(1);
});
