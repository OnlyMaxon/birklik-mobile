import {useEffect, useState} from 'react'
import {ActivityIndicator, Alert, StyleSheet, Text, View} from 'react-native'
import {Stack, router, useLocalSearchParams} from 'expo-router'

import type {Property} from '@birklik/core/types'

import {useAuth} from '@/auth/auth-provider'
import {ListingForm, type ListingFormValues} from '@/components/listing-form'
import {useWatermark} from '@/components/use-watermark'
import {useLanguage} from '@/i18n/language-provider'
import {geocode, updateListing, uploadImages} from '@/services/listing-service'
import {getOwnerProperties} from '@/services/property-service'
import {colors, fontSize, spacing} from '@/theme/theme'

/**
 * Правка своего объявления.
 *
 * ⚠️ Объявление берётся из СВОИХ, а не через `getProperty`: та возвращает `null`
 * для всего, что снято с витрины, — а править чаще всего нужно именно снятое,
 * чтобы вернуть его в строй.
 *
 * Статус, тариф и репутацию форма не показывает и не отправляет: правила
 * запрещают владельцу их менять, и запись с такими полями Firestore отклонил бы
 * целиком.
 */
export default function EditListingScreen() {
  const {id} = useLocalSearchParams<{id: string}>()
  const {t} = useLanguage()
  const {user} = useAuth()

  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)
  const {stage, apply} = useWatermark()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user || !id) return
    getOwnerProperties(user.uid)
      .then(list => setProperty(list.find(item => item.id === id) ?? null))
      .catch(() => setProperty(null))
      .finally(() => setLoading(false))
  }, [user, id])

  const submit = async (values: ListingFormValues) => {
    if (!property) return

    setSaving(true)
    setError('')
    try {
      // Новые снимки загружаем и дописываем к оставшимся старым — порядок
      // задан формой, и первый идёт на карточку в выдаче.
      const uploaded = values.newImages.length ? await uploadImages(values.newImages, apply) : []
      const images = [...values.existingImages, ...uploaded]

      const coordinates = await geocode(
        [values.address, values.district, values.city].filter(Boolean).join(', ')
      )

      await updateListing(property.id, {
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
        images
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

  if (loading) {
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
      <Stack.Screen options={{title: t.dashboard.editListing}} />
      <ListingForm
        property={property}
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
