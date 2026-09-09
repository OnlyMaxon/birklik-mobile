import {useState} from 'react'
import {Alert} from 'react-native'
import {Stack, router} from 'expo-router'

import {useAuth} from '@/auth/auth-provider'
import {ListingForm, type ListingFormValues} from '@/components/listing-form'
import {useWatermark} from '@/components/use-watermark'
import {useLanguage} from '@/i18n/language-provider'
import {createListing, geocode, uploadImages} from '@/services/listing-service'

/**
 * Подача объявления.
 *
 * Форма общая с правкой — см. `ListingForm`. Здесь только то, что относится к
 * созданию: объявление уходит со статусом «на проверке» и обычным тарифом,
 * потому что платный требует оплаты, а вести на неё из приложения запрещает
 * правило Apple 3.1.1.
 */
export default function AddListingScreen() {
  const {t} = useLanguage()
  const {user, profile} = useAuth()

  const {stage, apply} = useWatermark()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (values: ListingFormValues) => {
    setSaving(true)
    setError('')
    try {
      // Координаты выясняет геокодер по адресу и городу — тот же, что на сайте.
      // Без них объявление не попадёт ни на карту витрины, ни в «похожие».
      const coordinates = await geocode(
        [values.address, values.district, values.city].filter(Boolean).join(', ')
      )
      const urls = await uploadImages(values.newImages, apply)

      await createListing({
        title: values.title,
        description: values.description,
        type: values.type,
        city: values.city,
        district: values.district,
        address: values.address,
        price: values.price,
        rooms: values.rooms,
        area: values.area,
        // Нижнюю границу вместимости не спрашиваем: на сайте её почти не
        // заполняют, а фильтр сравнивает диапазоны — единица безопасна.
        minGuests: 1,
        maxGuests: values.maxGuests,
        amenities: values.amenities,
        coordinates,
        images: urls,
        owner: {
          name: profile?.name ?? '',
          phone: profile?.phone ?? '',
          email: user?.email ?? ''
        }
      })

      Alert.alert(t.dashboard.listingAdded, t.dashboard.pending, [
        {text: t.buttons.close, onPress: () => router.replace('/account/listings')}
      ])
    } catch {
      setError(t.listing.createdFailed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Stack.Screen options={{title: t.dashboard.addListing}} />
      <ListingForm
        submitLabel={t.dashboard.addListing}
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
