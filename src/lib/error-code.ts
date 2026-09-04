/**
 * Код ошибки Firebase. Лежит в поле `code`; у обычных исключений его нет,
 * поэтому возвращаем пустую строку — вызывающая сторона подставит общий текст.
 */
export function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as {code: unknown}).code)
    : ''
}
