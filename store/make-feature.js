const {createRequire} = require('node:module')
const req = createRequire('D:/VS/Birklik.az/package.json')
const sharp = req('sharp')
const fs = require('node:fs')
const out = process.argv[2]
const LOGO = 'D:/VS/Birklik-mobile/assets/images/logo.png'

;(async () => {
  // Надпись в логотипе тёмно-зелёная — значит фон обязан быть светлым.
  // На зелёном она сливалась: контраст читался хуже, чем в самом приложении.
  const logo = await sharp(LOGO).resize({width: 600}).toBuffer()
  const m = await sharp(logo).metadata()

  const bg = Buffer.from(`<svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="100%" stop-color="#eef4f0"/>
      </linearGradient>
    </defs>
    <rect width="1024" height="500" fill="url(#g)"/>
    <circle cx="905" cy="60" r="170" fill="#2E7D5B" opacity="0.07"/>
    <circle cx="105" cy="455" r="150" fill="#2E7D5B" opacity="0.06"/>
    <rect x="0" y="488" width="1024" height="12" fill="#2E7D5B"/>
  </svg>`)

  await sharp(bg)
    .composite([{input: logo, top: Math.round((488 - m.height) / 2), left: Math.round((1024 - m.width) / 2)}])
    .flatten({background: '#ffffff'})
    .png({compressionLevel: 9})
    .toFile(out + '/feature-1024x500.png')

  const r = await sharp(out + '/feature-1024x500.png').metadata()
  console.log('баннер: ' + r.width + 'x' + r.height + ' альфа=' + r.hasAlpha + ' ' +
    Math.round(fs.statSync(out + '/feature-1024x500.png').size / 1024) + ' КБ')
})().catch(e => { console.log('ошибка:', e.message); process.exit(1) })
