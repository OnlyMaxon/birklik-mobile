const {createRequire} = require('node:module')
const req = createRequire('D:/VS/Birklik.az/package.json')
const sharp = req('sharp')
const fs = require('node:fs')
const path = require('node:path')

/**
 * Пересобирает значки и заставку ПРЯМО В `android/res`.
 *
 * ⚠️ Почему руками, а не `expo prebuild`. Папка `android/` в гит не входит и
 * правится вручную: там лежит настройка подписи ключом загрузки и вычищенный
 * манифест (убраны микрофон, окно поверх других и местоположение). `prebuild`
 * стирает `android/` целиком — вместе с подписью, versionCode и этими правками.
 * Поэтому значения из `app.json` (adaptiveIcon, splash, versionCode) до сборки
 * НЕ доезжают сами, и всё, что видно на устройстве, задаётся здесь.
 *
 * ⚠️ Размеры взяты у существующих файлов, не выдуманы: 108dp — холст слоёв
 * адаптивной иконки, 48dp — старый значок, 288dp — холст системной заставки.
 */

const RES = 'D:/VS/Birklik-mobile/android/app/src/main/res'
const LOGO = 'D:/VS/Birklik-mobile/assets/images/logo.png'
const WHITE = {r: 255, g: 255, b: 255, alpha: 1}
const CLEAR = {r: 0, g: 0, b: 0, alpha: 0}

/** Множители плотности: имя папки → во сколько раз больше mdpi. */
const DENSITY = {mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4}

/**
 * Ширина логотипа на системной заставке, в точках mdpi.
 *
 * ⚠️ Холст 288, но виден только вписанный КРУГ диаметром 192 — так устроена
 * заставка с Android 12. Логотип 4:1 шириной w имеет диагональ w·1.031, значит
 * в круг помещается не шире 186. Берём 180 с запасом на сглаживание.
 *
 * Было 78 из 288 (27% холста) — отсюда и «логотип очень маленький».
 * ⚠️ Это же число обязано стоять в `NATIVE_WIDTH` в `splash-gate.tsx`.
 */
const SPLASH_LOGO_DP = 180
const SPLASH_CANVAS_DP = 288

;(async () => {
  // Знак без надписи: столбцы 0..267 в logo.png, дальше пустота и слово.
  const cut = await sharp(LOGO).extract({left: 0, top: 0, width: 268, height: 256}).png().toBuffer()
  const mark = await sharp(cut).trim().png().toBuffer()

  for (const [density, scale] of Object.entries(DENSITY)) {
    const mip = path.join(RES, 'mipmap-' + density)
    const drw = path.join(RES, 'drawable-' + density)

    // ---- Слои адаптивной иконки: холст 108dp.
    const layer = Math.round(108 * scale)
    // Знак вписан в безопасную зону — центральные 66dp из 108dp.
    const safe = Math.round(layer * 66 / 108)
    const safeMark = await sharp(mark)
      .resize(safe, safe, {fit: 'contain', background: CLEAR}).png().toBuffer()
    const pad = Math.round((layer - safe) / 2)

    await sharp({create: {width: layer, height: layer, channels: 4, background: CLEAR}})
      .composite([{input: safeMark, top: pad, left: pad}])
      .webp({quality: 92}).toFile(path.join(mip, 'ic_launcher_foreground.webp'))

    // ⚠️ Задний слой НЕПРОЗРАЧНЫЙ: прозрачный Android заливает чёрным, а не
    // цветом темы.
    await sharp({create: {width: layer, height: layer, channels: 4, background: WHITE}})
      .webp({quality: 92}).toFile(path.join(mip, 'ic_launcher_background.webp'))

    // ---- Старый значок для систем без адаптивных иконок: холст 48dp.
    const legacy = Math.round(48 * scale)
    const legacyMark = await sharp(mark)
      .resize(Math.round(legacy * 0.78), Math.round(legacy * 0.78), {fit: 'contain', background: CLEAR})
      .png().toBuffer()
    const legacyPad = Math.round(legacy * 0.11)

    for (const name of ['ic_launcher.webp', 'ic_launcher_round.webp']) {
      await sharp({create: {width: legacy, height: legacy, channels: 4, background: WHITE}})
        .composite([{input: legacyMark, top: legacyPad, left: legacyPad}])
        .webp({quality: 92}).toFile(path.join(mip, name))
    }

    // ---- Заставка: полный логотип с надписью, во всю доступную ширину круга.
    const canvas = Math.round(SPLASH_CANVAS_DP * scale)
    const logoWidth = Math.round(SPLASH_LOGO_DP * scale)
    const wide = await sharp(LOGO).trim()
      .resize(logoWidth, null, {fit: 'contain'}).png().toBuffer()
    const {height: logoHeight} = await sharp(wide).metadata()

    await sharp({create: {width: canvas, height: canvas, channels: 4, background: CLEAR}})
      .composite([{
        input: wide,
        top: Math.round((canvas - logoHeight) / 2),
        left: Math.round((canvas - logoWidth) / 2)
      }])
      .png({compressionLevel: 9})
      .toFile(path.join(drw, 'splashscreen_logo.png'))

    const share = Math.round(logoWidth / canvas * 100)
    console.log(
      ('mipmap-' + density).padEnd(16) +
      'слой ' + layer + '  значок ' + legacy +
      '   заставка ' + canvas + ', логотип ' + logoWidth + ' (' + share + '% холста)'
    )
  }

  // ---- Цвета: фон значка и фон заставки.
  const colorsPath = path.join(RES, 'values', 'colors.xml')
  let colors = fs.readFileSync(colorsPath, 'utf8')
  const before = colors
  colors = colors
    .replace(/(<color name="splashscreen_background">)#[0-9A-Fa-f]{3,8}(<\/color>)/, '$1#ffffff$2')
    .replace(/(<color name="iconBackground">)#[0-9A-Fa-f]{3,8}(<\/color>)/, '$1#ffffff$2')
  if (colors === before) throw new Error('цвета не заменились — проверить colors.xml')
  fs.writeFileSync(colorsPath, colors)
  console.log('colors.xml      фон значка и заставки -> #ffffff')
})().catch(e => { console.log('ошибка:', e.message); process.exit(1) })
