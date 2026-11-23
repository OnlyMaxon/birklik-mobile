import {AppState, __setState, __listenerCount} from 'react-native'
import {retryUpload, STALLED} from './upload-retry.ts'

const STALL = 200
const BACKOFF = [50, 50, 50] as const
const ATTEMPTS = 4

let failures = 0
const ok = (name: string, condition: boolean, detail = '') => {
  console.log(`${condition ? ' ✔' : ' ✘'} ${name}${detail ? '  — ' + detail : ''}`)
  if (!condition) failures += 1
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

process.on('unhandledRejection', reason => {
  console.log(' ✘ ВСПЛЫЛ НЕОБРАБОТАННЫЙ ОТКАЗ:', reason)
  failures += 1
})

/** Поддельная отправка: сценарий задаётся списком «что сделает попытка N». */
type Behaviour = 'ok' | 'fail' | 'hang'
function fakeUploader(plan: Behaviour[]) {
  const state = {starts: 0, cancels: 0}
  const start = () => {
    const n = state.starts++
    const behaviour = plan[n] ?? plan[plan.length - 1]
    let reject: (e: unknown) => void = () => {}
    const done = new Promise<void>((resolve, rej) => {
      reject = rej
      if (behaviour === 'ok') resolve()
      if (behaviour === 'fail') {
        const e = new Error('[storage/unknown] The server has terminated the upload session')
        ;(e as Error & {code?: string}).code = 'storage/unknown'
        rej(e)
      }
      // 'hang' — не отвечает никогда, как putFile у человека 23.11
    })
    return {
      done,
      cancel: () => {
        state.cancels++
        const e = new Error('canceled')
        ;(e as Error & {code?: string}).code = 'storage/canceled'
        reject(e)
      }
    }
  }
  return {start, state}
}

const run = (plan: Behaviour[], onRetry?: (a: number, c: string) => void) => {
  const {start, state} = fakeUploader(plan)
  return {state, promise: retryUpload({start, attempts: ATTEMPTS, backoff: BACKOFF, stall: STALL, onRetry})}
}

console.log('\n=== 1. Удача с первого раза ===')
{
  const retries: string[] = []
  const {state, promise} = run(['ok'], (_a, c) => retries.push(c))
  await promise
  ok('одна попытка, без повторов', state.starts === 1 && retries.length === 0, `попыток ${state.starts}`)
  ok('никого не прерывали', state.cancels === 0)
}

console.log('\n=== 2. Тот самый отказ 23.11, затем удача ===')
{
  const retries: string[] = []
  const {state, promise} = run(['fail', 'ok'], (_a, c) => retries.push(c))
  await promise
  ok('доехало со второй попытки', state.starts === 2, `попыток ${state.starts}`)
  ok('повтор записан с верным кодом', retries.join() === 'storage/unknown', retries.join() || 'пусто')
}

console.log('\n=== 3. Молчащая загрузка: срок прерывает и повторяет ===')
{
  const retries: string[] = []
  const t0 = Date.now()
  const {state, promise} = run(['hang', 'ok'], (_a, c) => retries.push(c))
  await promise
  const spent = Date.now() - t0
  ok('зависшую прервали', state.cancels === 1, `прерываний ${state.cancels}`)
  ok('доехало со второй попытки', state.starts === 2, `попыток ${state.starts}`)
  ok('код повтора — срок', retries.join() === STALLED, retries.join())
  ok('ждали около срока, не вечно', spent >= STALL && spent < STALL + 400, `${spent} мс`)
}

console.log('\n=== 4. Отказ всегда: четыре попытки и отказ наверх ===')
{
  const retries: string[] = []
  const {state, promise} = run(['fail'], (_a, c) => retries.push(c))
  let thrown: unknown = null
  await promise.catch(e => { thrown = e })
  ok('ровно четыре попытки', state.starts === ATTEMPTS, `попыток ${state.starts}`)
  ok('три повтора', retries.length === ATTEMPTS - 1, `повторов ${retries.length}`)
  ok('наверх ушёл настоящий отказ Firebase',
    (thrown as {code?: string})?.code === 'storage/unknown', String((thrown as {code?: string})?.code))
}

console.log('\n=== 5. Висит ВСЁ: отказ по сроку, экран не остаётся навсегда ===')
{
  const {state, promise} = run(['hang'])
  let thrown: unknown = null
  await promise.catch(e => { thrown = e })
  ok('прервали каждую попытку', state.cancels === ATTEMPTS, `прерываний ${state.cancels}`)
  ok('наверх ушёл отказ по сроку',
    (thrown as {code?: string})?.code === STALLED, String((thrown as {code?: string})?.code))
}

console.log('\n=== 6. В ФОНЕ срок не идёт: здоровую загрузку не прерываем ===')
{
  const {state, promise} = run(['hang', 'ok'])
  await sleep(50)                     // 50 мс видимого времени из 200
  __setState('background')
  await sleep(600)                    // втрое больше срока, но приложение свёрнуто
  ok('свёрнутую не прервали, хотя прошло 650 мс', state.cancels === 0, `прерываний ${state.cancels}`)
  ok('новую не начинали', state.starts === 1, `попыток ${state.starts}`)
  __setState('active')
  await promise
  ok('вернулись — срок досчитал и повтор доехал', state.cancels === 1 && state.starts === 2,
    `прерываний ${state.cancels}, попыток ${state.starts}`)
}

console.log('\n=== 7. В фоне новая попытка не начинается ===')
{
  __setState('background')
  const {state, promise} = run(['ok'])
  await sleep(150)
  ok('в фоне не начали ни одной отправки', state.starts === 0, `попыток ${state.starts}`)
  __setState('active')
  await promise
  ok('после возврата отправили', state.starts === 1)
}

console.log('\n=== 8. Подписки на AppState не текут ===')
{
  await sleep(50)
  ok('слушателей не осталось', __listenerCount() === 0, `осталось ${__listenerCount()}`)
}

console.log(`\n${failures === 0 ? 'ВСЁ СОШЛОСЬ' : 'ПРОВАЛОВ: ' + failures}`)
process.exit(failures === 0 ? 0 : 1)
