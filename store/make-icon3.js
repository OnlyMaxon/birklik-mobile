const {createRequire} = require('node:module')
const req = createRequire('D:/VS/Birklik.az/package.json')
const sharp = req('sharp')
const fs = require('node:fs')
const out = process.argv[2]
const LOGO = 'D:/VS/Birklik-mobile/assets/images/logo.png'

;(async () => {
  // Знак занимает столбцы 0..267 (измерено по альфа-каналу), дальше пустота и надпись.
  const cut = await sharp(LOGO).extract({left: 0, top: 0, width: 268, height: 256}).png().toBuffer()
  const mark = await sharp(cut).trim().resize(392, 392, {fit: 'contain', background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer()

  await sharp({create: {width: 512, height: 512, channels: 4, background: '#2E7D5B'}})
    .composite([{input: mark, top: 60, left: 60}])
    .flatten({background: '#2E7D5B'})
    .png({compressionLevel: 9})
    .toFile(out + '/icon-512.png')

  const m = await sharp(out + '/icon-512.png').metadata()
  console.log('значок: ' + m.width + 'x' + m.height + ' альфа=' + m.hasAlpha + ' ' +
    Math.round(fs.statSync(out + '/icon-512.png').size / 1024) + ' КБ')
})().catch(e => { console.log('ошибка:', e.message); process.exit(1) })
