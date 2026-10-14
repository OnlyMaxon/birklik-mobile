import {useEffect, useRef, useState} from 'react'
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native'
import {Stack, router, useLocalSearchParams} from 'expo-router'

import type {Property} from '@birklik/core/types'

import {useAuth} from '@/auth/auth-provider'
import {ListingForm, type ListingFormValues} from '@/components/listing-form'
import {StatusDialog} from '@/components/status-dialog'
import {SubmitProgress} from '@/components/submit-progress'
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
 *
 * Полоса загрузки и окно итога — те же, что у подачи (`account/add.tsx`).
 * Правка грузит те же снимки с водяным знаком и занимает столько же времени;
 * оставить здесь системный кружок и системное окно значило бы, что одно и то же
 * действие выглядит двумя разными способами.
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
  /** Полоса загрузки: доля и подпись шага. `null` — сохранение не идёт. */
  const [progress, setProgress] = useState<{value: number; label: string} | null>(null)
  /** Итог: 'saved' — сохранено, 'error' — нет. */
  const [outcome, setOutcome] = useState<'saved' | 'error' | null>(null)

  // Последнее отправленное — для кнопки «Попробовать снова» в окне ошибки.
  const lastValues = useRef<ListingFormValues | null>(null)

  useEffect(() => {
    if (!user || !id) return
    getOwnerProperties(user.uid)
      .then(list => setProperty(list.find(item => item.id === id) ?? null))
      .catch(() => setProperty(null))
      .finally(() => setLoading(false))
  }, [user, id])

  const submit = async (values: ListingFormValues) => {
    if (!property) return

    lastValues.current = values
    setSaving(true)
    setError('')
    setOutcome(null)
    setProgress({
      value: 0.1,
      label: values.newImages.length
        ? t.dialog.stepPhotos
            .replace('{done}', '0')
            .replace('{total}', String(values.newImages.length))
        : t.dialog.stepLocation
    })
    try {
      // Новые снимки загружаем и дописываем к оставшимся старым — порядок
      // задан формой, и первый идёт на карточку в выдаче.
      const uploaded = values.newImages.length
        ? await uploadImages(values.newImages, apply, (done, total) =>
            setProgress({
              value: 0.1 + 0.65 * (total === 0 ? 1 : done / total),
              label: t.dialog.stepPhotos
                .replace('{done}', String(done))
                .replace('{total}', String(total))
            })
          )
        : []
      const images = [...values.existingImages, ...uploaded]

      // Точка, поставленная на карте, важнее найденной по адресу: человек
      // уточнил её руками. Ничего не ставил — работает как раньше, геокодером.
      setProgress({value: 0.8, label: t.dialog.stepLocation})
      const coordinates =
        values.coordinates ??
        (await geocode([values.address, values.city].filter(Boolean).join(', ')))

      setProgress({value: 0.9, label: t.dialog.stepSaving})
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
        minGuests: values.minGuests,
        maxGuests: values.maxGuests,
        locationTags: values.locationTags,
        locationCategory: values.locationCategory,
        extraFeatures: values.extraFeatures,
        nearbyPlaces: values.nearbyPlaces,
        amenities: values.amenities,
        coordinates,
        images
      })

      setOutcome('saved')
    } catch {
      setError(t.listing.updateFailed)
      setOutcome('error')
    } finally {
      setSaving(false)
      setProgress(null)
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

      <SubmitProgress
        visible={progress !== null && outcome === null}
        progress={progress?.value ?? 0}
        label={progress?.label ?? ''}
      />

      <StatusDialog
        visible={outcome !== null}
        variant={outcome === 'error' ? 'error' : 'success'}
        title={outcome === 'error' ? t.dialog.errorTitle : t.messages.listingSaved}
        body={outcome === 'error' ? t.dialog.errorBody : undefined}
        note={outcome === 'error' ? t.dialog.errorNote : undefined}
        support={outcome === 'error'}
        primary={
          outcome === 'error'
            ? {
                label: t.dialog.retry,
                onPress: () => {
                  setOutcome(null)
                  const again = lastValues.current
                  if (again) void submit(again)
                }
              }
            : {label: t.buttons.close, onPress: () => router.back()}
        }
        secondary={
          outcome === 'error'
            ? {label: t.buttons.close, onPress: () => setOutcome(null)}
            : undefined
        }
        onRequestClose={outcome === 'error' ? () => setOutcome(null) : undefined}
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
