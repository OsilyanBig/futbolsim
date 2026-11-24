# Dönen Kale · Futbol Simülasyonu (YouTube Shorts)

Tarayıcıda çalışan, 9:16 (1080×1920) dikey formatta dönen kale futbol simülasyonu.
İki takım topu dairesel arenada sekerek dönen kaleye girmeye çalışır; maç kaydedilip video olarak indirilir.

## Özellikler
- **Fizik:** yerçekimi, daire duvarından sekme, top–top çarpışması, hafif hava sönümlemesi, dönen direklerle çarpışma.
- **Anti-stuck:** duvarda minimum sekme hızı + rastgele teğetsel dürtü; uzun süre yavaş kalan topa otomatik itki → toplar asla yerde kalmaz.
- **Gol / direk efektleri:** parçacık patlaması, konfeti, ekran sarsıntısı, "GOL!" ve "DİREK!" yazıları.
- **Sentez sesler (Web Audio):** sekme, çarpışma, direk, gol (tribün + korna), düdük. Dosya yok. Ses aç/kapa (yalnızca hoparlör, video sesli kaydedilir).
- **Süre:** 45 gerçek saniye = 90' (1 sn = 2 dk). 45'te "2. YARI" geçişi + düdük, toplar merkezden yeniden düşer.
- **Uzatmalar (eleme modu):** 90' berabere ise 120'ye kadar uzatma; yine berabereyse altın gol. İsteğe bağlı "uzatmada altın gol".
- **Video:** `MediaRecorder` ile canvas + ses kaydı. Tarayıcıya göre MP4 (H.264/AAC) veya WebM (VP9/VP8 + Opus); WebM süre bilgisi otomatik düzeltilir.
- Takım adı, rengi, logo (dosya veya URL), üst başlık, alt yazı, kale dönüş hızı ayarlanabilir.

## Yapı
```
app/                     Next.js App Router (layout, sayfa, global CSS)
components/Simulator.tsx Arayüz + motor/kayıt bağlantısı
components/TeamEditor.tsx, Toggle.tsx
lib/sim/constants.ts     Sahne, fizik ve zaman sabitleri
lib/sim/physics.ts       Fizik adımı, çarpışmalar, gol tespiti
lib/sim/engine.ts        Oyun döngüsü ve maç fazları
lib/sim/renderer.ts      Canvas çizimi (arena, skorboard, efektler)
lib/audio/soundEngine.ts Web Audio ses sentezi + kayıt akışı
lib/recorder/videoRecorder.ts  MediaRecorder, format seçimi, indirme
lib/logo.ts              Logo yükleme (dosya / CORS'lu URL)
```

## Yerel çalıştırma
```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # üretim derlemesi
```

## Tarayıcı notları
- En iyi sonuç: masaüstü Chrome / Edge (WebM VP9) veya Safari 14.1+ (MP4). Firefox WebM kaydeder.
- Kayıt sırasında sekmeyi önde tutun; arka plandaki sekmede tarayıcı çizimi durdurur.
- URL ile logo eklerken sunucu CORS izni vermiyorsa görseli indirip dosya olarak yükleyin (aksi hâlde canvas kaydı engellenir).

## Deploy (Vercel)
1. Repoyu GitHub'a gönderin.
2. vercel.com → **Add New → Project** → repoyu içe aktarın.
3. Framework otomatik **Next.js** algılanır; ayar gerekmez → **Deploy**.
