const {createRequire} = require('node:module')
const req = createRequire('D:/VS/Birklik.az/package.json')
const sharp = req('sharp')
const fs = require('node:fs')

const IN = process.argv[2]
const OUT = process.argv[3]
fs.mkdirSync(OUT, {recursive: true})

// Холст 1080x1920 — это ровно 9:16, как требует Google. Сырой снимок с
// телефона 1080x2220 (9:18.5) форма не приняла бы.
const W = 1080, H = 1920
const SHOT_W = 745                       // ширина снимка внутри рамки
const BEZEL = 18                          // толщина корпуса
const RADIUS_SHOT = 30
const RADIUS_BODY = 52

// ⚠️ Подписи — повелительное наклонение единственного числа («axtar», «seç»),
// одинаково во всех пяти. Смешивать с вежливым «axtarın» нельзя: на одной
// странице магазина разнобой заметен сразу.
const shots = [
  ['01-home.png',      'Azərbaycanda kirayə evlər'],
  ['02-property.png',  'Hər elanda şəkillər və şərtlər'],
  ['03-map.png',       'Xəritədə axtar'],
  ['04-filters.jpg',   'Şəhər, qiymət və otaq sayına görə filtrlə'],
  ['05-calendar.jpg',  'Tarixləri seç və sorğu göndər']
]

/**
 * Разбивка подписи на строки.
 *
 * ⚠️ SVG не переносит текст сам: строка длиннее холста просто уезжает за край,
 * и в магазин уходит кадр с обрезанной подписью. Поэтому длинные подписи
 * делятся надвое по словам — и делятся ПОРОВНУ, а не по первому подходящему
 * слову: «Şəhər, qiymət və otaq / sayına görə filtrlə» читается, а
 * «Şəhər, / qiymət və otaq sayına görə filtrlə» — нет.
 *
 * Ширина считается по числу букв: у Segoe UI в начертании bold буква занимает
 * примерно половину кегля, то есть при 62 точках в 1080 влезает около тридцати.
 */
const MAX_CHARS = 30
function wrapCaption(text) {
  if (text.length <= MAX_CHARS) return [text]
  const words = text.split(' ')
  let best = null
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ')
    const b = words.slice(i).join(' ')
    const score = Math.abs(a.length - b.length) + Math.max(a.length, b.length)
    if (!best || score < best.score) best = {lines: [a, b], score}
  }
  return best.lines
}

;(async () => {
  for (const [file, caption] of shots) {
    const src = IN + '/' + file
    const meta = await sharp(src).metadata()
    const shotH = Math.round(SHOT_W * meta.height / meta.width)

    // Скругляем углы снимка маской: dest-in оставляет только то, что под фигурой.
    const mask = Buffer.from(
      `<svg width="${SHOT_W}" height="${shotH}"><rect width="${SHOT_W}" height="${shotH}" rx="${RADIUS_SHOT}" ry="${RADIUS_SHOT}" fill="#fff"/></svg>`
    )
    // ⚠️ Снимок, пришедший через мессенджер, уже ужат — его приходится
    // РАСТЯГИВАТЬ до ширины рамки, и мягкость после этого видна. Лёгкая
    // резкость её прячет; снимку с устройства (1080 точек) она не нужна и
    // только огрубила бы края.
    const upscaled = meta.width < SHOT_W
    let resized = sharp(src).resize(SHOT_W, shotH, {kernel: 'lanczos3'})
    if (upscaled) resized = resized.sharpen({sigma: 0.7})

    const shot = await resized
      .composite([{input: mask, blend: 'dest-in'}])
      .png()
      .toBuffer()

    const lines = wrapCaption(caption)
    const bodyW = SHOT_W + BEZEL * 2
    const bodyH = shotH + BEZEL * 2
    const bodyX = Math.round((W - bodyW) / 2)
    const bodyY = H - bodyH - 28          // прижимаем к низу, подпись сверху
    const shotX = bodyX + BEZEL
    const shotY = bodyY + BEZEL

    const bg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="100%" stop-color="#e7efe9"/>
        </linearGradient>
        <filter id="sh" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="18" stdDeviation="26" flood-color="#0d3córrect" flood-opacity="0.28"/>
        </filter>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <circle cx="${W - 60}" cy="120" r="220" fill="#2E7D5B" opacity="0.07"/>
      <circle cx="40" cy="${H - 300}" r="180" fill="#2E7D5B" opacity="0.06"/>
      <text text-anchor="middle"
            font-family="Segoe UI, Noto Sans, DejaVu Sans, Arial, sans-serif"
            font-size="${lines.length > 1 ? 54 : 62}" font-weight="700" fill="#1d5940">${
        lines.map((line, i) =>
          `<tspan x="${W / 2}" y="${(lines.length > 1 ? 136 : 168) + i * 66}">${line}</tspan>`
        ).join('')
      }</text>
      <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}"
            rx="${RADIUS_BODY}" ry="${RADIUS_BODY}" fill="#16211c" filter="url(#sh)"/>
    </svg>`.replace('#0d3córrect', '#0d3d2b'))

    const out = OUT + '/' + file.replace(/^(\d+)-/, 'store-$1-').replace(/\.(jpe?g|png)$/i, '.png')
    await sharp(bg)
      .composite([{input: shot, top: shotY, left: shotX}])
      .flatten({background: '#ffffff'})
      .png({compressionLevel: 9})
      .toFile(out)

    const m = await sharp(out).metadata()
    console.log(out.split('/').pop().padEnd(22) + m.width + 'x' + m.height + '  ' +
      Math.round(fs.statSync(out).size / 1024) + ' КБ  исходник ' +
      meta.width + 'x' + meta.height + (upscaled ? ' (растянут)' : '') + '  «' + caption + '»')
  }
})().catch(e => { console.log('ошибка:', e.message); process.exit(1) })
