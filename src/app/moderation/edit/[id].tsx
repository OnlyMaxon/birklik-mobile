import {useEffect, useState} from 'react'
import {ActivityIndicator, Alert, StyleSheet, Text, View} from 'react-native'
import {Stack, router, useLocalSearchParams} from 'expo-router'
import {doc, getDoc} from '@react-native-firebase/firestore'

import type {Property} from '@birklik/core/types'

import {useAuth} from '@/auth/auth-provider'
import {ListingForm, type ListingFormValues} from '@/components/listing-form'
import {useWatermark} from '@/components/use-watermark'
import {useLanguage} from '@/i18n/language-provider'
import {db} from '@/lib/firebase'
import {geocode, updateListingAsModerator, uploadImages} from '@/services/listing-service'
import {colors, fontSize, spacing} from '@/theme/theme'

/**
 * Правка ЛЮБОГО объявления модератором — то же, что `/dashboard/moderator-edit`
 * на сайте.
 *
 * ⚠️ Объявление читается напрямую из Firestore, а не службой витрины: та
 * отсеивает снятое с показа, а модератору нужны как раз такие — черновики,
 * отклонённые, с истёкшим тарифом.
 *
 * Кроме содержимого модератор ставит статус, тариф и срок платного тарифа.
 * Владельцу это запрещено правилами; модератору разрешено, потому что право
 * живёт в заявке токена. Так на сайте выдают премиум после оплаты вне Azericard.
 */
export default function ModeratorEditScreen() {
  const {id} = useLocalSearchParams<{id: string}>()
  const {t} = useLanguage()
  const {isModerator, loading: authLoading} = useAuth()

  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)
  const {stage, apply} = useWatermark()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Ждём заявку из токена: до этого `isModerator` ложен у всех, и настоящего
    // модератора выбросило бы с экрана.
    if (authLoading) return
    if (!isModerator) {
      router.replace('/')
      return
    }
    if (!id) return

    getDoc(doc(db, 'properties', id))
      .then(snapshot =>
        setProperty(snapshot.exists() ? ({id: snapshot.id, ...snapshot.data()} as Property) : null)
      )
      .catch(() => setProperty(null))
      .finally(() => setLoading(false))
  }, [authLoading, isModerator, id])

  const submit = async (values: ListingFormValues) => {
    if (!property) return

    setSaving(true)
    setError('')
    try {
      const uploaded = values.newImages.length ? await uploadImages(values.newImages, apply) : []
      const images = [...values.existingImages, ...uploaded]

      const coordinates = await geocode(
        [values.address, values.district, values.city].filter(Boolean).join(', ')
      )

      await updateListingAsModerator(property.id, {
        title: values.title,
        description: values.description,
        type: values.type,
        city: values.city,
        district: values.district,
        address: values.address,
        price: values.price,
        rooms: values.rooms,
        area: values.area,
        maxGuests: values.maxGuests,
        amenities: values.amenities,
        coordinates,
        images,
        status: values.status ?? property.status ?? 'pending',
        listingTier: values.listingTier ?? 'standard',
        expiresAt: values.expiresAt ?? ''
      })

      Alert.alert(t.messages.listingSaved, undefined, [
        {text: t.buttons.close, onPress: () => router.back()}
      ])
    } catch {
      setError(t.listing.updateFailed)
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!property) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t.errors.errorNotFound}</Text>
      </View>
    )
  }

  return (
    <>
      <Stack.Screen options={{title: t.moderation.listingReviewPage}} />
      <ListingForm
        property={property}
        moderator
        submitLabel={t.buttons.save}
        saving={saving}
        error={error}
        onSubmit={submit}
      />
      {/* Вид для наложения водяного знака: рисуется за краем экрана,
          нужен только чтобы снять с него кадр. */}
      {stage}
    </>
  )
}

const styles = StyleSheet.create({
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white},
  muted: {fontSize: fontSize.base, color: colors.neutral, padding: spacing.md}
})
