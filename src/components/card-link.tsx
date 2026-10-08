import {useState} from 'react'
import {Link} from 'expo-router'
import {Pressable, StyleSheet, type StyleProp, type ViewStyle} from 'react-native'

type Props = {
  href: React.ComponentProps<typeof Link>['href']
  style?: StyleProp<ViewStyle>
  children: React.ReactNode
}

/**
 * Карточка, по которой переходят на объявление.
 *
 * ⚠️ Существует из-за ловушки `expo-router`, которая молча снимала с карточек
 * ВСЁ оформление. `<Link asChild>` отдаёт ребёнка компоненту `Slot` из Radix, а
 * тот сливает свойства так:
 *
 *     style = {...свои, ...детские}
 *
 * Если стиль ребёнка записан функцией — `({pressed}) => [...]`, обычная для
 * `Pressable` запись, — разворот функции в объект даёт ПУСТО: своих
 * перечислимых свойств у функции нет. Карточка остаётся без единого стиля, и
 * ни ошибки, ни предупреждения при этом не будет. Массив `expo-router` хотя бы
 * ловит проверкой в разработке, функцию — не ловит никто.
 *
 * Видно это было только в компактном виде: там карточке нужен `flex: 1`, чтобы
 * делить ряд поровну. Без него ширину задавало содержимое — столбцы выходили
 * разной ширины, значок тарифа вылезал за край, и сетка рассыпалась. В обычном
 * виде карточка и так во всю ширину, поэтому пропажа белой подложки и теней
 * сходила за «плоский» вид.
 *
 * Отсюда правило: `Pressable` внутри `Link` получает ОДИН плоский объект, а
 * нажатие отслеживается своим состоянием.
 */
export function CardLink({href, style, children}: Props) {
  const [pressed, setPressed] = useState(false)

  return (
    <Link href={href} asChild>
      <Pressable
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={StyleSheet.flatten([style, pressed && styles.pressed])}
        accessibilityRole="link"
      >
        {children}
      </Pressable>
    </Link>
  )
}

const styles = StyleSheet.create({
  pressed: {opacity: 0.75}
})
