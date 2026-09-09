import type {Comment} from '@birklik/core/types'

import {auth} from '@/lib/firebase'

/**
 * Комментарии и оценки — через сервер сайта, а не напрямую в Firestore.
 *
 * ⚠️ Причина не в удобстве. Правила Firestore ЗАПРЕЩАЮТ клиенту писать поля
 * `comments`, `ratings`, `rating` и `reviews`: раньше через них любой вошедший
 * мог переписать чужие отзывы, накрутить просмотры и выставить оценку на чужом
 * объявлении. Запрет закрыл настоящую дыру, ослаблять его нельзя.
 *
 * Сайт пишет это на своём сервере под сервис-аккаунтом, которого правила не
 * касаются. Приложение обращается туда же — логика там ровно одна и та же
 * (`addComment` и `addRating` в `src/app/property/[id]/lib/interactions.ts`
 * веб-репозитория), включая проверку «оценивает тот, кто здесь жил», и
 * уведомление владельцу.
 *
 * Личность подтверждается токеном входа Firebase в заголовке: сессионной куки,
 * на которой живёт сайт, у приложения нет.
 *
 * Всё остальное — витрина, объявление, избранное, брони — по-прежнему идёт в
 * Firebase напрямую. Сюда вынесено только то, что клиенту писать не дают.
 */

const API_ORIGIN = 'https://birklik.az'

export class NotAuthenticatedError extends Error {}

/** Разбор ответа сервера: код ошибки как есть, чтобы интерфейс объяснил причину. */
interface ApiResult {
  success: boolean
  error?: string
}

async function post<T extends ApiResult>(path: string, body: object): Promise<T> {
  const user = auth.currentUser
  if (!user) throw new NotAuthenticatedError('not-authenticated')

  // Токен берём без принудительного обновления: SDK сам держит его свежим, а
  // `getIdToken(true)` — лишний обход к Firebase на каждое действие.
  const token = await user.getIdToken()

  const response = await fetch(`${API_ORIGIN}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  })

  // Сервер отвечает разбираемым телом и на отказ — читаем его, чтобы показать
  // причину, а не общее «не удалось».
  const data = (await response.json().catch(() => ({success: false, error: 'unknown'}))) as T
  return data
}

export async function addComment(
  propertyId: string,
  text: string
): Promise<{success: true; comment: Comment} | {success: false; error: string}> {
  return post(`/api/property/comments`, {propertyId, text})
}

export async function addRating(
  propertyId: string,
  rating: number
): Promise<{success: true; rating: number; reviews: number} | {success: false; error: string}> {
  return post(`/api/property/ratings`, {propertyId, rating})
}
