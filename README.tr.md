# Graphite Tab Board (Graphite Sekme Panosu)

[![AMO sürüm](https://img.shields.io/amo/v/graphite-tab-board?label=AMO&color=0060df)](https://addons.mozilla.org/firefox/addon/graphite-tab-board/)
[![İndirme](https://img.shields.io/amo/dw/graphite-tab-board?label=indirme&color=0060df)](https://addons.mozilla.org/firefox/addon/graphite-tab-board/)
[![Lisans: MPL 2.0](https://img.shields.io/badge/lisans-MPL%202.0-blue.svg)](https://www.mozilla.org/MPL/2.0/)

Yeni sekme sayfanızı kalıcı, aranabilir bir sekme panosuna dönüştürün. Kullanmadığınız sekmeleri uyutun, hep ihtiyaç duyduğunuz sekmeleri sabitleyin, kalanını başlık, adres veya alan adına göre bulun — her şey cihazınızda kalır.

**Hesap yok, sunucu yok, analitik yok, derleme adımı yok, bağımlılık yok.**

> English version: [README.md](README.md) · Hata bildirimi: [Issues](https://github.com/HyperFearless/Graphite-Tab-Board/issues)

## Kurulum

[![Firefox eklentisini al](https://img.shields.io/badge/Firefox%20eklentisini%20al-0060df?logo=firefox-browser)](https://addons.mozilla.org/firefox/addon/graphite-tab-board/)

addons.mozilla.org üzerinden ya da Firefox Eklenti Yöneticisi'nde **Graphite Tab Board**
diye arayarak kurun.

Masaüstü için **Firefox 109+** gerekir. Firefox for Android desteklenmez.

## İki tema, iki dil

Varsayılan tema koyu bir zemin üzerinde **buz mavisi**dir; tek tuşla geçilen alternatif tema
**grafit mint**tir ve seçiminiz hatırlanır. Arayüz **Türkçe ve İngilizce** olarak gelir ve
üst kısımdan değiştirilebilir.

## Özellikler

- 8 → 7 → 6 → 5 → 4 → 3 → 2 sütuna inen duyarlı kart ızgarası (tek sütuna asla düşmez); aktif/uykuda durumları ile.
- Normal sekmeler başlık, URL, favicon, metadata görseli, sabitleme durumu, favori durumu, aktif/ses çalma/sıra bilgisi ve kalıcı bir kayıt kimliğiyle saklanır.
- Favoriler en başta sıralanır; kalan kartlar odaktaki penceredeki tarayıcı sekme sırasını izler. Kartlar aktif/uykuda, seçili, ses ve sabitlenmiş rozetleri gösterir.
- Yerel, canlı başlık ve URL araması (alan adları dahil) Tümü/Aktif/Uykuda filtreleriyle birleşik çalışır. Türkçe büyük/küçük harf eşleşmesi noktalı ve noktasız I variesyonlarını kabul eder. × veya Escape ile temizlenir; sayaçlar global kalırken durum satırı görünen sonuç sayısını bildirir. Arama sekme açmaz, uyandırmaz, ağ isteği yapmaz.
- Yapışkan arama + filtre bloğu: tam genişlik arama kutusu ve filtre düğmeleri kaydırırken üstte takılı kalır; üst kart kayıp gider.
- Yoğunluk düğmesi (▤) kompakt kartlara geçirir (küçük görsel, tek satır başlık) ve seçim yerel olarak hatırlanır.
- Tema düğmesi (◐) buz mavisi (varsayılan) ile grafit mint arasında geçirir; seçim yerel olarak hatırlanır.
- Klavye kısayolları: `/` aramaya odaklar, `1`/`2`/`3` Tümü/Aktif/Uykuda filtrelerini değiştirir (arama kutusunda yazarken tetiklenmez).
- İnce sayaçlar ve tabuler rakamlar; AKTİF rozeti nötr gridir, mint vurgu yalnızca eylem ve odak için saklanır.
- Odaklama/uyandırma, uyutma (askıya alma), yenileme, sabitleme/kaldırma, favorileme ve kapatma eylemleri.
- Panodaki her kapatma eylemi onay ister; aktif ve uykuda kartlar dahil. Firefox'ta doğrudan kapatılan sekme kalıcı kayıtlardan silinir ve geri yüklenmez. Eklenti hiçbir sekmeyi kendiliğinden kapatmaz.
- Firefox pencere kapatma silmeleri kısa süre gecikmeli işlenir: birkaç normal pencereden birini kapatmak o kayıtları siler, son normal pencereyi kapatmak ise kartları sonraki açılışta kurtarmak için çevrimdışı tutar.
- Metadata öncelikle YouTube küçük resminden, sonra `og:image`, ardından `twitter:image`'den gelir. Önbelleğe alınmış metadata görseli, favicon ve başlık zarif yedekler sağlar; ekran görüntüsü hiç alınmaz.
- Gizli pencereler desteklenmez: manifestteki `incognito: not_allowed`, panoyu ve arka planı gizli pencerelerin dışında tutar; hiçbir gizli sekme gösterilmez, kaydedilmez veya geri yüklenmez.
- Tarayıcı/eklenti açılışında, Firefox'un URL'ye izin verdiği durumlarda kayıp kaydedilmiş normal sekmeler geri yüklenir; pano sekmeleri hariç tutulur. Geri yüklenen sekmeler sabitlenmiş durumlarını korur ve aynı URL'yi paylaşan kayıtlı sekmeler birleştirilmek yerine ayrı kayıtlar kalır.
- Araç çubuğu düğmesi mevcut pano sekmesine odaklanır ya da bir tane açar.
- Firefox'un yeni sekme yönlendirmesi aynı `dashboard.html`'i kullanır (ve `chrome_url_overrides.newtab` destekleyen Chromium tabanlı yükleyiciler tarafından kabul edilir).

## Gizlilik

Kayıtlar `storage.local` içinde tutulur ve **hiçbir zaman cihazınızdan çıkmaz**. Hesap,
analitik, telemetri veya uzak sunucu yoktur. Manifest
`data_collection_permissions: { "required": ["none"] }` beyan eder.

Gizli gezinme desteklenmez ve eklenti orada hiç çalışmaz.

### İzinler

| İzin | Neden gerekli |
| --- | --- |
| `tabs` | Kartları oluşturmak için açık sekmelerin başlık ve adresini okur; sekmeleri odaklar, sabitler ve kapatır. |
| `storage` | Sekme kayıtlarını ve görünüm tercihlerinizi yerel olarak saklar. |
| `<all_urls>` | İçerik betiği **yalnızca** sayfa başlığını, `og:image` / `twitter:image` önizleme etiketini ve favicon okur. Sayfa içeriğini, form verisini veya giriş alanlarını asla okumaz. |

Eklenti **ekran görüntüsü almaz**. Kart önizlemeleri sayfanın kendi Open Graph
metadata'sından gelir; YouTube kartları herkese açık küçük resim uç noktasını kullanır.

## Geliştirme

Projenin derleme adımı ve bağımlılığı yoktur — bu depodaki dosyalar yayınlanan dosyaların
kendisidir. Güncel bir Node.js kurulumuyla manifesti ve JavaScript sözdizimini doğrulayın ve
arka plan regresyon testlerini çalıştırın:

```powershell
Get-Content .\manifest.json -Raw | ConvertFrom-Json | Out-Null
node --check .\background.js
node --check .\metadata.js
node --check .\dashboard.js
node --test .\background.test.cjs
```

Yayınlamadan denemek için `about:debugging` → *Bu Firefox* → *Geçici Eklenti Yükle* yolundan
`manifest.json` dosyasını yükleyin.

## Lisans

[Mozilla Public License 2.0](https://www.mozilla.org/MPL/2.0/)

```
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
```

Eklentinin kaynak kodunda değişiklik yaparsanız, bu değişiklikler MPL kapsamında yayınlanmak
zorundadır.