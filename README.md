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
Doğrudan hedefli mesajlaşma API'si henüz eklenmiş değil.
