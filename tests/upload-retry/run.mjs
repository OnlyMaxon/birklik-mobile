/**
 * Прогон правил повтора загрузки (`src/lib/upload-retry.ts`).
 *
 * Запуск:  node tests/upload-retry/run.mjs
 *
 * Ставить ничего не надо и НЕЛЬЗЯ: `pnpm` в этом проекте запрещён — он молча
 * переустанавливает пакеты. Node исполняет TypeScript сам, а единственное, что
 * нужно подменить, — `react-native`, откуда берётся `AppState`.
 *
 * Почему не обычный тестовый запуск: тестов в этом проекте нет вовсе, а завести
 * их значит поставить пакеты. Поэтому проверяемые файлы копируются в отдельную
 * папку рядом с подделкой `react-native` — там подделка находится раньше
 * настоящего пакета. Меняется при копировании РОВНО ОДНА строка: путь импорта
 * `@/lib/foreground` становится относительным. Он и печатается ниже, чтобы
 * видно было, что проверяется подлинный код.
 */
import {cpSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const sandbox = join(here, '.sandbox')

rmSync(sandbox, {recursive: true, force: true})
mkdirSync(join(sandbox, 'node_modules', 'react-native'), {recursive: true})

cpSync(join(here, 'stub-react-native.js'), join(sandbox, 'node_modules', 'react-native', 'index.js'))
writeFileSync(
  join(sandbox, 'node_modules', 'react-native', 'package.json'),
  JSON.stringify({name: 'react-native', version: '0.0.0-stub', main: 'index.js'})
)

cpSync(join(root, 'src', 'lib', 'foreground.ts'), join(sandbox, 'foreground.ts'))
const source = readFileSync(join(root, 'src', 'lib', 'upload-retry.ts'), 'utf8')
const patched = source.replace("from '@/lib/foreground'", "from './foreground.ts'")
if (patched === source) {
  console.error('НЕ НАШЁЛСЯ импорт @/lib/foreground — проверь upload-retry.ts')
  process.exit(1)
}
writeFileSync(join(sandbox, 'upload-retry.ts'), patched)
cpSync(join(here, 'check.ts'), join(sandbox, 'check.ts'))

console.log('подменено при копировании: только строка импорта')
console.log('  было:  ' + source.split('\n')[0])
console.log('  стало: ' + patched.split('\n')[0])

const result = spawnSync(process.execPath, ['--experimental-strip-types', 'check.ts'], {
  cwd: sandbox,
  stdio: 'inherit',
  env: {...process.env, NODE_NO_WARNINGS: '1'}
})
rmSync(sandbox, {recursive: true, force: true})
process.exit(result.status ?? 1)
