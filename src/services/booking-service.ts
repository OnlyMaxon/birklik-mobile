import {
  addDoc,
  collection,
  getDocs,
  query,
  where
} from '@react-native-firebase/firestore'

import type {Booking, Property} from '@birklik/core/types'

import {db} from '@/lib/firebase'

/**
 * Бронирование.
 *
 * ⚠️ Отличие от сайта, о котором надо знать. Там бронь создаёт серверный экшен
 * внутри транзакции: проверка пересечения дат и запись происходят одним
 * неделимым действием. Здесь сервера нет, а клиентская транзакция Firestore не
 * умеет выполнять запросы внутри себя — значит проверить занятость и записать
 * одним махом нельзя.
 *
 * Поэтому здесь сначала запрос, потом запись, и между ними есть щель: две
 * заявки на одни и те же даты, отправленные в одну секунду, обе пройдут.
 * Осознанно миримся с этим по двум причинам. Во-первых, бронь всё равно
 * подтверждает владелец вручную — вторую он просто отклонит. Во-вторых, за всё
 * время работы площадки броней не было ни одной, то есть одновременность здесь
 * умозрительная.
 *
 * Если брони пойдут — переносить в облачную функцию, а не чинить на клиенте.
 */

export class BookingConflictError extends Error {
  constructor() {
    super('booking-conflict')
    this.name = 'BookingConflictError'
  }
}

const COLLECTION = 'bookings'

/** Брони объявления, занимающие даты: подтверждённые и ожидающие ответа. */
export async function getBlockingBookings(propertyId: string): Promise<Booking[]> {
  const snapshot = await getDocs(
    query(
      collection(db, COLLECTION),
      where('propertyId', '==', propertyId),
      where('status', 'in', ['approved', 'pending'])
    )
  )
  return snapshot.docs.map(d => ({id: d.id, ...d.data()}) as Booking)
}

/** Даты хранятся как 'YYYY-MM-DD', поэтому сравниваются строками напрямую. */
export function overlaps(
  checkIn: string,
  checkOut: string,
  other: {checkInDate: string; checkOutDate: string}
): boolean {
  return checkIn < other.checkOutDate && checkOut > other.checkInDate
}

export interface NewBooking {
  property: Property
  checkInDate: string
  checkOutDate: string
  guest: {uid: string; name: string; email: string; phone: string}
}

/**
 * Создаёт заявку на бронь со статусом `pending`.
 *
 * Правила Firestore требуют, чтобы `userId` совпадал с вошедшим, а статус был
 * именно `pending`, — то есть подтвердить бронь за себя гость не может.
 *
 * @throws {BookingConflictError} даты пересекаются с уже занятыми
 */
export async function createBooking({
  property,
  checkInDate,
  checkOutDate,
  guest
}: NewBooking): Promise<Booking> {
  const nights = Math.round(
    (new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()) / 86_400_000
  )
  if (nights <= 0) throw new Error('invalid-dates')

  const existing = await getBlockingBookings(property.id)
  if (existing.some(booking => overlaps(checkInDate, checkOutDate, booking))) {
    throw new BookingConflictError()
  }

  const data = {
    propertyId: property.id,
    userId: guest.uid,
    ownerId: property.ownerId || '',
    userName: guest.name || 'User',
    userEmail: guest.email,
    userPhone: guest.phone,
    checkInDate,
    checkOutDate,
    nights,
    totalPrice: nights * property.price.daily,
    status: 'pending' as const,
    createdAt: new Date().toISOString()
  }

  const created = await addDoc(collection(db, COLLECTION), data)
  return {id: created.id, ...data}
}
