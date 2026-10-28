# The Studio sounds in public/studio/sounds (lib/audio.ts STUDIO_SOUNDS) were made by this script, so they are the
# show's own: no recording, sample or library went into them. Run: python3 scripts/windSounds.py public/studio/sounds
# (needs numpy). Seeded, so it makes the same files again.
# Gentle wind whooshes for the Soul Wisdom teasers (Tom: the first round was sharp, "like a sword"). Darker
# noise (pink and brown, not white), a wide filter that stays low and moves slowly, a smooth swell in and a long
# fall, a slow gust in the level, and a gentle pan. Each still swells to its loudest near the cut, which the
# Studio puts 250 ms after the sound starts.
import numpy as np, wave, sys, os

SR = 48000
out_dir = sys.argv[1]


def pink(n, rng):
    # Paul Kellet's filter: white noise to 1/f noise, softer and fuller than white.
    w = rng.standard_normal(n)
    b = np.zeros(7)
    y = np.empty(n)
    for i in range(n):
        x = w[i]
        b[0] = 0.99886 * b[0] + x * 0.0555179
        b[1] = 0.99332 * b[1] + x * 0.0750759
        b[2] = 0.96900 * b[2] + x * 0.1538520
        b[3] = 0.86650 * b[3] + x * 0.3104856
        b[4] = 0.55000 * b[4] + x * 0.5329522
        b[5] = -0.7616 * b[5] - x * 0.0168980
        y[i] = b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + x * 0.5362
        b[6] = x * 0.115926
    return y / np.std(y)


def brown(n, rng):
    y = np.cumsum(rng.standard_normal(n))
    y -= np.convolve(y, np.ones(4800) / 4800, 'same')      # keep it from drifting
    return y / np.std(y)


def svf(x, fc, q):
    # A state-variable filter with a moving cutoff; returns its low-pass and band-pass outputs.
    low = band = 0.0
    lo = np.zeros_like(x); bp = np.zeros_like(x)
    damp = 1.0 / q
    for i in range(len(x)):
        f = 2 * np.sin(np.pi * min(fc[i], SR / 6) / SR)
        high = x[i] - low - damp * band
        band += f * high
        low += f * band
        lo[i] = low; bp[i] = band
    return lo, bp


def swell(n, peak, tail):
    # A smooth rise (half a sine) to the peak, then a long, soft fall.
    t = np.arange(n) / SR
    up = np.sin(np.clip(t / peak, 0, 1) * np.pi / 2) ** 2
    down = np.exp(-np.clip(t - peak, 0, None) / tail)
    return np.where(t < peak, up, down)


def wind(seed, dur, peak, tail, f_lo, f_hi, q, gust_hz, mix_brown, pan):
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    e = swell(n, peak, tail)
    # The filter opens a little with the swell, never far: wind, not a blade.
    fc = f_lo + (f_hi - f_lo) * e
    src = pink(n, rng) * (1 - mix_brown) + brown(n, rng) * mix_brown
    lo, bp = svf(src, fc, q)
    body = 0.6 * lo + 0.4 * bp
    # A slow gust: the level breathes a little as it passes.
    gust = 1 + 0.18 * np.sin(2 * np.pi * gust_hz * t + rng.uniform(0, 6.28))
    mono = body * e * gust
    # A second, slightly later layer for the left and right channels, so it feels wide and airy.
    lo2, bp2 = svf(pink(n, rng), fc * 0.9, q)
    mono2 = (0.6 * lo2 + 0.4 * bp2) * swell(n, peak * 1.15, tail * 1.1) * gust
    p = np.linspace(-pan, pan, n)
    l = (mono * 0.8 + mono2 * 0.4) * np.cos((p + 1) * np.pi / 4)
    r = (mono * 0.8 + mono2 * 0.4) * np.sin((p + 1) * np.pi / 4)
    x = np.stack([l, r], axis=1)
    fade = int(0.25 * SR)
    x[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
    x[:int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR))[:, None]
    return x


def save(name, x):
    x = x / np.max(np.abs(x)) * 10 ** (-3 / 20)
    path = os.path.join(out_dir, name)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())
    print(path, f'{len(x) / SR:.2f}s')


# A breeze: soft and airy, the closest to "soft" but slower and darker.
save('soul-wisdom-wind-breeze.wav', wind(11, 1.6, 0.32, 0.35, 250, 1100, 0.7, 1.2, 0.25, 0.6))
# A breath: shorter and quieter-feeling, mostly low air.
save('soul-wisdom-wind-breath.wav', wind(23, 1.2, 0.28, 0.25, 180, 800, 0.6, 1.6, 0.4, 0.4))
# A swell: a longer, rounder gust of wind with a slow pass across.
save('soul-wisdom-wind-swell.wav', wind(37, 2.0, 0.38, 0.5, 200, 1300, 0.65, 0.9, 0.3, 0.75))
