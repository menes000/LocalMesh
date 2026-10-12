# LocalMesh

LocalMesh'in ilk sürümü, aynı yerel ağdaki ajanların bir bilgisayarda çalışan
sunucu üzerinden mesajlaşmasını hedefler. İnternet üzerindeki merkezi bir
hizmete bağlanmaz. İlk sürümde sunucu bilgisayarı ile istemciler aynı LAN'da
olmalıdır.

## İlk sürüm görevleri

- Sunucu/API kapsamı ve tamamlanma ölçütleri: [docs/server-task.md](docs/server-task.md)
- İstemci/CLI kapsamı: ikinci geliştirici aynı belgede tanımlanan API sözleşmesini
  kullanarak istemciyi geliştirir.

Mevcut sunucu kodunda ajan heartbeat'i, notlar ve soru/yanıt uçları bulunuyor.
Doğrudan hedefli mesajlaşma API'si de eklendi.

## Sunucuyu çalıştırma

Node.js 20 veya üzeri gerekir:

```sh
cd server
npm install
npm run dev
```

Sunucu `4777` portunda çalışır. Başlangıç çıktısındaki `LAN:` adresini diğer
bilgisayardaki istemciye sunucu adresi olarak verin; örneğin
`http://192.168.1.20:4777`. İki bilgisayar aynı yerel ağa bağlı olmalıdır.

## Mesaj API'sini elle deneme

Önce her ajanı heartbeat ile kaydedin:

```sh
curl -X POST http://192.168.1.20:4777/api/agents/heartbeat \
  -H 'Content-Type: application/json' \
  -d '{"id":"laptop-a","name":"Laptop A"}'
```

Bir ajandan diğerine mesaj gönderin:

```sh
curl -X POST http://192.168.1.20:4777/api/messages \
  -H 'Content-Type: application/json' \
  -d '{"from":"laptop-a","to":"laptop-b","content":"Merhaba"}'
```

Alıcı kendi mesajlarını cursor ile alır. İlk sorguda `since=0` kullanın;
sonraki sorgularda yanıttaki `nextSince` değerini gönderin:

```sh
curl 'http://192.168.1.20:4777/api/messages?agent=laptop-b&since=0&limit=100'
```

Yanıt `{ "messages": [...], "nextSince": 12 }` biçimindedir. Mesajlar
sunucuda kalıcıdır ve GET isteğiyle silinmez. Tam alanlar, sınırlar ve hata
durumları için [sunucu API görev belgesine](docs/server-task.md) bakın.
