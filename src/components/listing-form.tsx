import {useState} from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import {Ionicons} from '@expo/vector-icons'

import {amenitiesList, cities, propertyTypes} from '@birklik/core/data'
import type {Amenity, Property, PropertyType} from '@birklik/core/types'

import {FormField} from '@/components/form-field'
import {PickerField} from '@/components/picker-field'
import {PrimaryButton} from '@/components/primary-button'
import {useLanguage} from '@/i18n/language-provider'
import type {PickedImage} from '@/services/listing-service'
import {colors, fontSize, radius, spacing} from '@/theme/theme'

const MAX_IMAGES = 15

export interface ListingFormValues {
  title: string
  description: string
  type: PropertyType
  city: string
  district: string
  address: string
  price: number
  rooms: number
  area: number
  maxGuests: number
  amenities: Amenity[]
  /** Уже загруженные снимки — их адреса. Порядок значим: первый идёт на карточку. */
  existingImages: string[]
  /** Только что выбранные с устройства. Загружаются при отправке. */
  newImages: PickedImage[]
  /** Поля модератора. Заполняются только в его режиме. */
  status?: string
  listingTier?: 'standard' | 'vip' | 'premium'
  expiresAt?: string
}

type Props = {
  /** Объявление для правки. Пусто — значит подача нового. */
  property?: Property
  /** Режим модератора добавляет статус, тариф и срок. */
  moderator?: boolean
  submitLabel: string
  saving: boolean
  error: string
  onSubmit: (values: ListingFormValues) => void
}

const STATUSES = ['active', 'pending', 'inactive', 'draft']
const TIERS: Array<'standard' | 'vip' | 'premium'> = ['standard', 'vip', 'premium']

/**
 * Форма объявления — одна на три случая: подача, правка владельцем, правка
 * модератором.
 *
 * Держать три похожие формы нельзя: набор полей и проверки разошлись бы, и
 * объявление, поданное из одной, не прошло бы правку в другой. На сайте это
 * тоже одна форма (`listing-editor.tsx`) с разными правами.
 *
 * ⚠️ Выбора тарифа у владельца НЕТ ни при подаче, ни при правке: платные тарифы
 * требуют оплаты, а вести на неё из приложения запрещает правило Apple 3.1.1.
 * Модератору тариф доступен — так на сайте выдают премиум после оплаты вне
 * Azericard.
 */
export function ListingForm({property, moderator, submitLabel, saving, error, onSubmit}: Props) {
  const {t, language} = useLanguage()

  const [title, setTitle] = useState(property?.title?.az ?? '')
  const [description, setDescription] = useState(property?.description?.az ?? '')
  const [type, setType] = useState<PropertyType | ''>(property?.type ?? '')
  const [city, setCity] = useState(property?.city ?? '')
  const [district, setDistrict] = useState(property?.district ?? '')
  const [address, setAddress] = useState(property?.address?.az ?? '')
  const [price, setPrice] = useState(property ? String(property.price?.daily ?? '') : '')
  const [rooms, setRooms] = useState(property ? String(property.rooms ?? '') : '')
  const [area, setArea] = useState(property ? String(property.area ?? '') : '')
  const [guests, setGuests] = useState(property ? String(property.maxGuests ?? '') : '')
  const [amenities, setAmenities] = useState<Amenity[]>(property?.amenities ?? [])

  const [existing, setExisting] = useState<string[]>(property?.images ?? [])
  const [picked, setPicked] = useState<PickedImage[]>([])

  const [status, setStatus] = useState<string>(property?.status ?? 'pending')
  const [tier, setTier] = useState<'standard' | 'vip' | 'premium'>(
    (property?.listingTier as 'standard' | 'vip' | 'premium') ?? 'standard'
  )
  const [expiresAt, setExpiresAt] = useState(
    (property?.premiumExpiresAt ?? property?.vipExpiresAt ?? '').slice(0, 10)
  )

  const [localError, setLocalError] = useState('')

  const total = existing.length + picked.length

  const pick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      setLocalError(t.messages.error)
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - total,
      quality: 1
    })

    if (!result.canceled) {
      setPicked(current =>
        [
          ...current,
          ...result.assets.map(asset => ({
            uri: asset.uri,
            width: asset.width,
            height: asset.height
          }))
        ].slice(0, MAX_IMAGES - existing.length)
      )
      setLocalError('')
    }
  }

  /**
   * Быстрое продление тарифа на N дней.
   *
   * ⚠️ Отсчёт от СЕГОДНЯ, а не от текущего окончания — так на сайте
   * (`handleRenewTier`). Разница видна на истёкшем тарифе: от старой даты
   * продление оставило бы его в прошлом.
   *
   * Заодно переводит объявление в активные: продлевают обычно как раз то, что
   * уже сняли с витрины по истечении срока.
   */
  const renew = (days: number) => {
    const until = new Date()
    until.setDate(until.getDate() + days)
    const month = String(until.getMonth() + 1).padStart(2, '0')
    const day = String(until.getDate()).padStart(2, '0')
    setExpiresAt(`${until.getFullYear()}-${month}-${day}`)
    setStatus('active')
  }

  /** Перестановка соседей. Первый снимок идёт на карточку, поэтому порядок важен. */
  const swap = <T,>(list: T[], from: number, to: number): T[] => {
    if (to < 0 || to >= list.length) return list
    const copy = [...list]
    ;[copy[from], copy[to]] = [copy[to], copy[from]]
    return copy
  }

  const submit = () => {
    setLocalError('')

    if (!title.trim() || !description.trim()) return setLocalError(t.listing.required)
    if (!type) return setLocalError(t.listing.selectType)
    if (!city) return setLocalError(t.listing.selectCity)
    if (!Number(price) || !Number(rooms) || !Number(area) || !Number(guests)) {
      return setLocalError(t.listing.required)
    }
    if (total === 0) return setLocalError(t.listing.minPhotos)

    onSubmit({
      title: title.trim(),
      description: description.trim(),
      type,
      city,
      district: district.trim(),
      address: address.trim(),
      price: Number(price),
      rooms: Number(rooms),
      area: Number(area),
      maxGuests: Number(guests),
      amenities,
      existingImages: existing,
      newImages: picked,
      ...(moderator ? {status, listingTier: tier, expiresAt} : {})
    })
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <FormField label={t.listing.createTitle} value={title} onChangeText={setTitle} />

        <View>
          <Text style={styles.label}>{t.property.description}</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            style={styles.textarea}
            multiline
            maxLength={4000}
          />
        </View>

        <Chips
          label={t.listing.selectType}
          options={propertyTypes.map(value => ({
            value,
            label: t.propertyTypes?.[value as keyof typeof t.propertyTypes] ?? value
          }))}
          selected={type ? [type] : []}
          onToggle={value => setType(value as PropertyType)}
        />

        {/* Города списком с поиском: их около семидесяти, набором «пилюль» они
            занимали пол-экрана формы. */}
        <PickerField
          label={t.dashboard.city}
          placeholder={t.dashboard.selectCity}
          options={cities.map(option => ({value: option.value, label: option[language]}))}
          value={city}
          onChange={setCity}
        />

        <FormField label={t.property.location} value={district} onChangeText={setDistrict} />
        <FormField label={t.property.address} value={address} onChangeText={setAddress} />

        <View style={styles.row}>
          <View style={styles.cell}>
            <FormField
              label={`${t.form.price}, ₼ / ${t.property.perNight}`}
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.cell}>
            <FormField
              label={t.search.rooms}
              value={rooms}
              onChangeText={setRooms}
              keyboardType="numeric"
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.cell}>
            <FormField
              label={`${t.property.area}, ${t.property.sqm}`}
              value={area}
              onChangeText={setArea}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.cell}>
            <FormField
              label={t.search.guests}
              value={guests}
              onChangeText={setGuests}
              keyboardType="numeric"
            />
          </View>
        </View>

        <Chips
          label={t.property.amenities}
          options={amenitiesList.map(value => ({
            value,
            label: t.amenities?.[value as keyof typeof t.amenities] ?? value
          }))}
          selected={amenities}
          onToggle={value =>
            setAmenities(current =>
              current.includes(value as Amenity)
                ? current.filter(item => item !== value)
                : [...current, value as Amenity]
            )
          }
        />

        <View>
          <Text style={styles.label}>
            {t.buttons.uploadPhotos} · {total}/{MAX_IMAGES}
          </Text>
          {/* Порядок правится стрелками: первый снимок попадает на карточку в
              выдаче, и владельцы это замечают. На сайте так же — стрелками, а
              не перетаскиванием. */}
          <View style={styles.photos}>
            {existing.map((uri, index) => (
              <Photo
                key={`${uri}-${index}`}
                uri={uri}
                first={index === 0}
                onUp={() => setExisting(current => swap(current, index, index - 1))}
                onDown={() => setExisting(current => swap(current, index, index + 1))}
                onRemove={() => setExisting(current => current.filter((_, i) => i !== index))}
              />
            ))}

            {picked.map((image, index) => (
              <Photo
                key={`${image.uri}-${index}`}
                uri={image.uri}
                first={existing.length === 0 && index === 0}
                onUp={() => setPicked(current => swap(current, index, index - 1))}
                onDown={() => setPicked(current => swap(current, index, index + 1))}
                onRemove={() => setPicked(current => current.filter((_, i) => i !== index))}
              />
            ))}

            {total < MAX_IMAGES ? (
              <Pressable style={styles.photoAdd} onPress={pick}>
                <Ionicons name="add" size={26} color={colors.gray400} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {moderator ? (
          <View style={styles.moderatorBox}>
            <Chips
              label={t.dashboard.bookingStatus}
              options={STATUSES.map(value => ({value, label: value}))}
              selected={[status]}
              onToggle={setStatus}
            />

            <Chips
              label={t.dashboard.premiumStatus}
              options={TIERS.map(value => ({
                value,
                label: t.pricing?.[value as keyof typeof t.pricing] ?? value
              }))}
              selected={[tier]}
              onToggle={value => setTier(value as 'standard' | 'vip' | 'premium')}
            />

            {/* Срок нужен только платному тарифу: у обычного его нет, и пустое
                поле рядом с ним сбивало бы с толку. */}
            {tier !== 'standard' ? (
              <>
                <FormField
                  label={t.dashboard.planExpires}
                  value={expiresAt}
                  onChangeText={setExpiresAt}
                  placeholder="2026-12-31"
                />

                {/* Быстрое продление — как на сайте: срок отсчитывается от
                    СЕГОДНЯ, а не от текущего окончания, и объявление сразу
                    становится активным. Так там выдают тариф после оплаты вне
                    Azericard, и продление истёкшего не оставляет его скрытым. */}
                <View style={styles.renewRow}>
                  {[14, 30].map(days => (
                    <Pressable key={days} style={styles.renew} onPress={() => renew(days)}>
                      <Text style={styles.renewText}>
                        +{days} {t.moderation.renewDays}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        {error || localError ? (
          <Text style={styles.error}>{error || localError}</Text>
        ) : null}

        <PrimaryButton title={submitLabel} onPress={submit} loading={saving} disabled={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Photo({
  uri,
  first,
  onUp,
  onDown,
  onRemove
}: {
  uri: string
  first: boolean
  onUp: () => void
  onDown: () => void
  onRemove: () => void
}) {
  return (
    <View style={styles.photo}>
      <Image source={{uri}} style={styles.photoImage} />

      {first ? (
        <View style={styles.photoBadge}>
          <Ionicons name="star" size={10} color={colors.white} />
        </View>
      ) : null}

      <Pressable style={styles.photoRemove} onPress={onRemove} hitSlop={6}>
        <Ionicons name="close" size={14} color={colors.white} />
      </Pressable>

      <View style={styles.photoMove}>
        <Pressable onPress={onUp} hitSlop={6} style={styles.photoArrow}>
          <Ionicons name="chevron-back" size={14} color={colors.white} />
        </Pressable>
        <Pressable onPress={onDown} hitSlop={6} style={styles.photoArrow}>
          <Ionicons name="chevron-forward" size={14} color={colors.white} />
        </Pressable>
      </View>
    </View>
  )
}

function Chips({
  label,
  options,
  selected,
  onToggle
}: {
  label: string
  options: Array<{value: string; label: string}>
  selected: string[]
  onToggle: (value: string) => void
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map(option => {
          const active = selected.includes(option.value)
          return (
            <Pressable
              key={option.value}
              onPress={() => onToggle(option.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.white},
  content: {padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.base},
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray700,
    marginBottom: spacing.xs
  },
  textarea: {
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: radius.sm,
    padding: spacing.sm,
    minHeight: 110,
    fontSize: fontSize.sm,
    color: colors.text,
    textAlignVertical: 'top'
  },
  row: {flexDirection: 'row', gap: spacing.sm},
  cell: {flex: 1},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  chip: {
    paddingHorizontal: spacing.base,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.gray50,
    borderWidth: 1,
    borderColor: colors.gray200
  },
  chipActive: {backgroundColor: colors.primary, borderColor: colors.primary},
  chipText: {fontSize: fontSize.xs, color: colors.gray700},
  chipTextActive: {color: colors.white, fontWeight: '600'},
  photos: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  photo: {width: 96, height: 96, borderRadius: radius.sm, overflow: 'hidden'},
  photoImage: {width: '100%', height: '100%'},
  photoBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center'
  },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  photoMove: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.45)'
  },
  photoArrow: {paddingHorizontal: 8, paddingVertical: 4},
  photoAdd: {
    width: 96,
    height: 96,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.gray300,
    alignItems: 'center',
    justifyContent: 'center'
  },
  renewRow: {flexDirection: 'row', gap: spacing.sm},
  renew: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.primary
  },
  renewText: {fontSize: fontSize.sm, color: colors.primary, fontWeight: '700'},
  moderatorBox: {
    gap: spacing.base,
    padding: spacing.base,
    borderRadius: radius.base,
    backgroundColor: colors.gray50,
    borderWidth: 1,
    borderColor: colors.gray200
  },
  error: {fontSize: fontSize.sm, color: colors.error}
})
