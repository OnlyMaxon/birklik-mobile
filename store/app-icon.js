const {createRequire} = require('node:module')
const req = createRequire('D:/VS/Birklik.az/package.json')
const sharp = req('sharp')
const A = 'D:/VS/Birklik-mobile/assets/images/'
const DARK = '#123b2b'

;(async () => {
  // Знак без надписи: столбцы 0..267 в logo.png, дальше пустота и слово.
  const cut = await sharp(A + 'logo.png').extract({left: 0, top: 0, width: 268, height: 256}).png().toBuffer()
  const trimmed = await sharp(cut).trim().png().toBuffer()

  // ---- Передний слой адаптивной иконки: 432x432, прозрачный.
  // ⚠️ Знак вписывается в БЕЗОПАСНУЮ зону — центральные 264 из 432 (66dp из
  // 108dp). Всё, что за ней, маска пускового экрана срежет: у круглых значков
  // это заметная часть угла.
  const SAFE = 264
  const mark = await sharp(trimmed).resize(SAFE, SAFE, {fit: 'contain', background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer()
  const off = Math.round((432 - SAFE) / 2)

  await sharp({create: {width: 432, height: 432, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}})
    .composite([{input: mark, top: off, left: off}])
    .png({compressionLevel: 9})
    .toFile(A + 'android-icon-foreground.png')

  // ---- Задний слой: тёмно-зелёный. На фирменном #2E7D5B зелёные лучи знака
  // сливались с фоном — проверено сравнением трёх вариантов.
  await sharp({create: {width: 432, height: 432, channels: 3, background: DARK}})
    .png({compressionLevel: 9}).toFile(A + 'android-icon-background.png')

  // ---- Общий значок (iOS, веб): тот же знак на том же фоне, 1024.
  const big = await sharp(trimmed).resize(784, 784, {fit: 'contain', background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer()
  await sharp({create: {width: 1024, height: 1024, channels: 4, background: DARK}})
    .composite([{input: big, top: 120, left: 120}])
    .flatten({background: DARK})
    .png({compressionLevel: 9})
    .toFile(A + 'icon.png')

  for (const f of ['android-icon-foreground.png', 'android-icon-background.png', 'icon.png']) {
    const m = await sharp(A + f).metadata()
    console.log(f.padEnd(32) + m.width + 'x' + m.height + '  альфа=' + m.hasAlpha)
  }
})().catch(e => { console.log('ошибка:', e.message); process.exit(1) })
