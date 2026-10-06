const {createRequire} = require('node:module')
const req = createRequire('D:/VS/Birklik.az/package.json')
const sharp = req('sharp')
const A = 'D:/VS/Birklik-mobile/assets/images/'

/**
 * Картинка системной заставки.
 *
 * ⚠️ Надпись крупной здесь быть НЕ МОЖЕТ, и это ограничение Android, а не
 * выбор оформления. С Android 12 заставку рисует система: она берёт значок и
 * обрезает его КРУГОМ — видна только вписанная окружность. Логотип шириной
 * 4:1 при ширине w имеет диагональ w·1.031, поэтому в круг диаметром 160dp
 * помещается логотип не шире ~155dp. Больше — обрежет по краям.
 *
 * Отсюда разделение: системная заставка показывает логотип скромно и без
 * обрезки, а крупный логотип рисует уже само приложение (`splash-gate.tsx`)
 * обычной разметкой, где никакой маски нет.
 *
 * Холст КВАДРАТНЫЙ и логотип занимает всю его ширину намеренно: тогда
 * `imageWidth` в app.json равен видимой ширине логотипа один к одному. У
 * прежней картинки логотип занимал 78% ширины холста, и при `imageWidth: 76`
 * на экране оставалось около 59 точек — отсюда и «очень маленький».
 */
const SIZE = 1024

;(async () => {
  const logo = await sharp(A + 'logo.png').trim().resize(SIZE, null, {fit: 'contain'}).png().toBuffer()
  const {height} = await sharp(logo).metadata()

  await sharp({create: {width: SIZE, height: SIZE, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}})
    .composite([{input: logo, top: Math.round((SIZE - height) / 2), left: 0}])
    .png({compressionLevel: 9})
    .toFile(A + 'splash-icon.png')

  const m = await sharp(A + 'splash-icon.png').metadata()
  console.log('splash-icon.png  ' + m.width + 'x' + m.height + '  логотип во всю ширину, высота ' + height)
})().catch(e => { console.log('ошибка:', e.message); process.exit(1) })
