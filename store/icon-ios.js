const {createRequire} = require('node:module')
const req = createRequire('D:/VS/Birklik.az/package.json')
const sharp = req('sharp')

const A = 'D:/VS/Birklik-mobile/assets/images/'

/**
 * Значок для iOS — без альфа-канала.
 *
 * ⚠️ **Apple не принимает значок с прозрачностью**, и отказ приходит от самой
 * заливки в App Store Connect, ещё до проверки человеком: «The app icon can't
 * be transparent nor contain an alpha channel». Наш `icon.png` — 1024×1024
 * **RGBA**, то есть с альфой.
 *
 * Expo при сборке альфу, возможно, сплющивает сам — но живьём мы этого не
 * видели ни разу, а проверять такое предположением уже обжигались (геокодер).
 * Поэтому значок для iOS задаётся отдельным файлом, а `ios.icon` в `app.json`
 * указывает именно на него.
 *
 * ⚠️ Имя `icon-ios.png` с пометкой платформы намеренно: второй `icon.png`
 * рядом с первым через полгода никто не отличит, а разница между ними —
 * причина отказа магазина.
 *
 * Фон белый — тот же, что у адаптивного значка Android (`app-icon.js`): на
 * фирменном зелёном лучи знака сливались с фоном, белый снимает вопрос совсем.
 *
 * ```bash
 * node store/icon-ios.js
 * ```
 *
 * Проверить, что альфы не осталось (тип цвета в IHDR, байт 25: 2 — RGB,
 * 6 — RGBA):
 *
 * ```bash
 * python -c "import io;print(io.open('assets/images/icon-ios.png','rb').read(26)[25])"
 * ```
 */
const BG = '#ffffff'
const SIZE = 1024

;(async () => {
  const source = A + 'icon.png'
  const target = A + 'icon-ios.png'

  const before = await sharp(source).metadata()

  // `flatten` подкладывает цвет под прозрачные точки и УБИРАЕТ альфу — ровно
  // то, что нужно. `removeAlpha` отбросил бы её, не подложив фона, и
  // полупрозрачные края стали бы чёрными.
  await sharp(source)
    .flatten({background: BG})
    .resize(SIZE, SIZE, {fit: 'cover'})
    // Явно: без палитры и без альфы. Палитра у значка Apple тоже нежелательна.
    .png({palette: false})
    .toFile(target)

  const after = await sharp(target).metadata()

  console.log(`было:  ${before.width}x${before.height} ${before.channels} канала, альфа: ${before.hasAlpha}`)
  console.log(`стало: ${after.width}x${after.height} ${after.channels} канала, альфа: ${after.hasAlpha}`)

  if (after.hasAlpha) {
    console.error('АЛЬФА ОСТАЛАСЬ — Apple такой значок не примет')
    process.exitCode = 1
  }
})()
