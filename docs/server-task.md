# LocalMesh v1 — Sunucu görevi

Bu belge, ilk sürümde sunucu tarafını geliştirecek kişinin kapsamını ve istemci
geliştiricisinin dayanacağı API sözleşmesini tanımlar. Amaç, iki bilgisayardaki
ajanların aynı yerel ağda, sunucuyu çalıştıran bilgisayar üzerinden mesaj
gönderip alabilmesidir.

## Mimari ve sınırlar

- Sunucu, geliştiricilerden birinin bilgisayarında çalışır; diğer bilgisayarlar
  o makinenin LAN IPv4 adresine bağlanır.
- Bu sürümde internet servisi, bulut hesabı, otomatik ağ keşfi, şifreleme,
  kullanıcı hesabı ve sunucusuz eşler arası bağlantı kapsam dışıdır.
- Sunucu, mesajları yönlendirir ve kalıcı olarak saklar. İstemci mesajları
  HTTP ile gönderir ve alıcıya ait mesajları polling ile alır.
- Eski `/api/notes` ve `/api/questions` uçları mevcut kodda bulunur. Mesajlaşma
  bunların anlamını değiştirmeden ayrı `/api/messages` uçları olarak eklenir.
- İlk sürüm yalnızca güvenilen özel LAN'da kullanılmalıdır. Sunucuyu internete
  açmak bu sürümün güvenlik kapsamı dışındadır.

## Mevcut başlangıç noktası

- `server/src/index.ts`: Express uygulaması `0.0.0.0` üzerinde dinliyor,
  varsayılan port `4777`; LAN IPv4 adreslerini başlangıçta yazdırıyor.
- `server/src/routes.ts`: ajan heartbeat, not ve soru/yanıt API'leri var.
- `server/src/store.ts`: JSON dosyasına atomik yazım ve seri hale getirilmiş
  mutasyon altyapısı var. Ajan/not/soru dışında mesaj koleksiyonu henüz yok.
- `README.md` başlangıçta boştu; ürünün ilk sürüm hedefi bu belgeyle
  açıklanıyor.

## Sunucu geliştiricisinin kapsamı

1. Kalıcı duruma `messages` koleksiyonu ekle. Boş durum, yükleme/doğrulama ve
   geriye dönük uyumluluk mevcut dosyalarla çalışmalı. Eski `state.json`
   dosyasında `messages` alanı yoksa boş diziyle açılmalı; mevcut ajan, not,
   soru ve `nextId` verileri silinmemeli ya da sıfırlanmamalı.
2. Ortak artan sayısal ID üreticisini kullanarak her mesaja benzersiz ID ver.
   Mesaj kaydı `id`, `from`, `to`, `content`, `createdAt` alanlarını taşımalı.
3. Aşağıdaki oluşturma ve okuma endpoint'lerini ekle.
4. Tüm kalıcı değişiklikleri mevcut `mutate` kuyruğundan geçir; eşzamanlı
   isteklerde ID çakışması veya yazım kaybı oluşmamalı.
5. Hatalarda tutarlı JSON hata gövdesi döndür ve API davranışını bu belgeye
   uygun tut.
6. Kurulum/çalıştırma ve API örneklerini README'de tut. İstemci geliştiricisi
   endpoint ya da alan adlarını tahmin etmek zorunda kalmamalı.

## API sözleşmesi

Tüm uçlar sunucu köküne göre `/api` altındadır. JSON gövdeleri UTF-8'dir.

### Mesaj gönder

`POST /api/messages`

İstek:

```json
{
  "from": "laptop-a",
  "to": "laptop-b",
  "content": "Merhaba, bu bir deneme mesajı."
}
```

Başarı: `201 Created`

```json
{
  "id": 12,
  "from": "laptop-a",
  "to": "laptop-b",
  "content": "Merhaba, bu bir deneme mesajı.",
  "createdAt": "2026-10-12T12:00:00.000Z"
}
```

Kurallar:

- `from`, `to` ve `content` boş olmayan string olmalı; baştaki/sondaki
  boşluklar doğrulama sırasında yok sayılmalı.
- `content` en fazla 64 KiB UTF-8 olmalı. Daha büyük gövde `413` ile
  reddedilmeli; bozuk/eksik alanlar `400` ile reddedilmeli.
- `from` ve `to` ajan kimlikleridir. V1'de mesaj göndermek için alıcının
  çevrimiçi olması gerekmez; çevrimdışı alıcı mesajı daha sonra alabilmelidir.
- Yeni mesaj için sunucu `id` ve UTC ISO-8601 `createdAt` üretir; istemcinin
  gönderdiği bu alanlar dikkate alınmaz.
- Kabul edilen mesaj JSON dosyasına yazılmadan başarı yanıtı verilmemeli.

### Alıcıya gelen mesajları oku

`GET /api/messages?agent=laptop-b&since=0&limit=100`

- `agent` zorunludur; boşsa veya verilmemişse `400`.
- `since` isteğe bağlı, varsayılanı `0` olan sıfır veya pozitif güvenli
  tamsayıdır. Yalnızca `id > since` mesajlar döner.
- `limit` isteğe bağlıdır; varsayılan `100`, izin verilen aralık `1–500`.
- Yalnızca `to` alanı `agent` ile eşleşen mesajlar döner; sonuçlar `id`
  artan sıradadır.
- Başarı yanıtı bir nesnedir:

```json
{
  "messages": [
    {
      "id": 12,
      "from": "laptop-a",
      "to": "laptop-b",
      "content": "Merhaba, bu bir deneme mesajı.",
      "createdAt": "2026-10-12T12:00:00.000Z"
    }
  ],
  "nextSince": 12
}
```

- Sonuç boşsa `messages: []` döner ve `nextSince`, istekteki `since`
  değeridir (yoksa `0`). Böylece istemci cursor değerini yalnızca gerçekten
  aldığı son mesajın ID'sine ilerletir.
- İstemci mesajları aldığı zaman son mesaj ID'sini saklar ve sonraki istekte
  `since` olarak gönderir. Mesaj okuma mesajı silmez; istemcinin yeniden
  bağlanması veya sunucunun yeniden başlaması mesajı kaybettirmez.
- Geçersiz `since`, `limit` ya da boş `agent` `400` döner.

### Ortak hata biçimi

```json
{ "error": "açıklayıcı hata mesajı" }
```

HTTP durum kodları: `400` geçersiz istek, `404` bulunmayan rota, `413` istek
gövdesi/mesaj sınırını aşıyor. Mevcut global JSON gövde sınırı 1 MiB'dir;
mesaj içeriği sınırı ayrıca 64 KiB olarak uygulanmalıdır.

## İstemci geliştiricisiyle arayüz paylaşımı

İstemci geliştiricisi API'yi yukarıdaki şekilde kullanır:

1. `POST /api/agents/heartbeat` ile `{ "id": "laptop-b", "name": "..." }`
   gönderip ajan kimliğini kaydeder/yaşatır.
2. Mesaj yazmak için `POST /api/messages` çağırır.
3. Gelen mesajlar için örneğin 1–2 saniyede bir
   `GET /api/messages?agent=laptop-b&since=<son_id>` çağırır.
4. Mesajları aldıktan sonra son `id` değerini yerelde saklar ve sonraki
   sorguda kullanır. Sunucu mesajı tüketilmiş olarak işaretlemez.

Sunucu adresi `http://<sunucu-lan-ip>:4777` biçimindedir. Sunucu geliştiricisi
endpoint'leri veya alanları değiştirmek isterse önce bu belgeyi güncelleyip
istemci geliştiricisine haber vermelidir.

## Tamamlanma ölçütleri

- Eski biçimde bir `state.json` varsa mevcut veriler korunarak açılır ve yeni
  mesajlar saklanabilir.
- İki farklı ajan heartbeat gönderebilir; bir ajan diğerine mesaj bırakabilir.
- İkinci ajan kendi `agent` değeriyle polling yapınca mesajı artan ID sırasıyla
  görür; başka alıcıların mesajları görünmez.
- Boş mesaj/kimlik, hatalı cursor ve limit gibi girdiler uygun `400` yanıtı
  verir; çok büyük mesaj reddedilir.
- Sunucu yeniden başlatıldığında mesaj kayıtları ve sonraki ID üretimi devam
  eder.
- README, sunucuyu başlatmayı, LAN URL'sini bulmayı ve endpoint örneklerini
  açıklar.

## Manuel uçtan uca kontrol

1. Sunucu bilgisayarında `cd server && npm install && npm run dev` çalıştır.
2. Konsolda yazan LAN IP'sini diğer bilgisayardan kullan; iki bilgisayarın
   aynı yerel ağda olduğundan emin ol.
3. İki ajan ID'si için heartbeat gönder.
4. Birinci ajandan ikinciye mesaj POST et; ikinci ajan için GET isteğiyle
   mesajı gör.
5. GET isteğini aynı `since` ile tekrarla: mesaj hâlâ görünmeli. `since`
   değerini mesaj ID'sine ilerletince liste boş olmalı.
6. Sunucuyu yeniden başlatıp aynı alıcı sorgusuyla mesajın hâlâ durduğunu
   doğrula.

Bu manuel akış kabul kontrolüdür; ilk görevin kapsamı için ayrıca bir test
altyapısı kurmak şart değildir.
