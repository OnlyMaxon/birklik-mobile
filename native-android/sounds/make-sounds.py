# Третий вариант: нота не затухает, а ДЕРЖИТСЯ, и только потом коротко гаснет.
#
# Зачем: слух судит громкость по среднему уровню, а не по пику. У колокольчика
# длинный тихий хвост, и при том же пике средний уровень втрое ниже. Короткая
# держащаяся нота при той же шкале звучит заметно громче — именно так сделаны
# звуки банковских приложений.
import math, struct, wave

RATE = 44100
NOTES = {'A5': 880.0, 'CIS6': 1108.73, 'E6': 1318.51}

ATTACK, PLATEAU, RELEASE = 0.006, 0.150, 0.060


def note(freq):
    out = []
    total = int(RATE * (ATTACK + PLATEAU + RELEASE))
    for i in range(total):
        t = i / RATE
        if t < ATTACK:
            env = t / ATTACK                      # мягкий вход, иначе щелчок
        elif t < ATTACK + PLATEAU:
            env = 1.0                             # вот оно — ровная полка
        else:
            env = math.exp(-28.0 * (t - ATTACK - PLATEAU))
        s = (math.sin(2 * math.pi * freq * t)
             + 0.30 * math.sin(2 * math.pi * freq * 2 * t)
             + 0.10 * math.sin(2 * math.pi * freq * 3 * t))
        out.append(env * s / 1.40)
    return out


def phrase(names, gap=0.165, peak=0.97):
    step = int(RATE * gap)
    voices = [note(NOTES[n]) for n in names]
    length = max(len(v) + k * step for k, v in enumerate(voices))
    mix = [0.0] * length
    for k, v in enumerate(voices):
        for i, s in enumerate(v):
            mix[k * step + i] += s
    top = max(abs(s) for s in mix) or 1.0
    return [s / top * peak for s in mix]


def save(path, samples):
    with wave.open(path, 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(RATE)
        f.writeframes(b''.join(struct.pack('<h', int(s * 32767)) for s in samples))
    return len(samples) / RATE


# ⚠️ Поменяны местами по решению владельца 2026-11-22: ТРИ ноты получает бронь
# (её слышит хозяин жилья, это его деньги и его гость), ДВЕ — модератор.
for label, names in (('booking.wav', ['A5', 'CIS6', 'E6']),
                     ('moderation.wav', ['A5', 'CIS6'])):
    m = phrase(names)
    sec = save(label, m)
    r = (sum(s * s for s in m) / len(m)) ** 0.5
    print('%-22s %.2f c   pik %.2f   sredniy %.3f (%.1f dB)'
          % (label, sec, max(abs(s) for s in m), r, 20 * math.log10(r)))
