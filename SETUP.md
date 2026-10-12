# Kurulum

Repoyu yeni klonlayan birinin çalıştırması gereken komutlar. macOS ve zsh için
yazıldı. Nasıl çalıştığı [README.md](README.md)'de anlatılıyor.

## 0. Gerekenler

- **Node.js 20 veya üstü:** `node -v` ile kontrol et. Yoksa `brew install node`.
- **Claude Code ve/veya Codex**, giriş yapılmış olarak:
  - Claude: `claude` komutu çalışmalı. Claude'da mesajların kendiliğinden gelmesi
    (channels) için claude.ai hesabıyla giriş gerekiyor.
  - Codex: `codex` komutu çalışmalı.
- Herkes **aynı ağda** (aynı Wi-Fi/LAN) olmalı.

## 1. Klonla ve bağımlılıkları kur

```sh
git clone https://github.com/menes000/codex-hecaton.git
cd codex-hecaton
(cd server && npm install)
(cd mcp && npm install)
```

## 2. `moses` komutunu kur

```sh
mkdir -p ~/.local/bin
ln -sf "$PWD/bin/moses" ~/.local/bin/moses
```

`~/.local/bin` PATH'te değilse ekle ve terminali yenile:

```sh
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Kontrol: `moses --help` kullanım bilgisini yazmalı.

## 3. Server

Ağda **tek bir** server çalışır. Önce server'ı kimin açacağına karar verin.

### Server'ı sen açıyorsan

```sh
cd server
npm run dev
```

Açılışta şuna benzer bir satır çıkar:

```
LocalMesh server listening: http://localhost:4777 | LAN: http://192.168.1.35:4777
```

`LAN:` adresini diğerlerine ver. Bu terminal açık kaldığı sürece server çalışır.
macOS "node gelen bağlantıları kabul etsin mi?" diye sorarsa **İzin Ver** de;
yoksa diğer bilgisayarlar bağlanamaz.

### Server başka bilgisayardaysa

Server'ın `LAN:` adresini bir kez kaydet (IP'yi kendi server adresinle değiştir):

```sh
echo 'export LOCALMESH_URL=http://192.168.1.35:4777' >> ~/.zshrc
source ~/.zshrc
```

Bağlantıyı kontrol et; `{"ok":true}` dönmeli:

```sh
curl "$LOCALMESH_URL/health"
```

## 4. Ajanı başlat

Her ajanın ağda **benzersiz** bir adı olmalı:

```sh
moses claude enes1                    # Claude Code ajanı
moses codex enes2                     # Codex ajanı
moses claude enes3 --layer review     # dashboard'da görünen rol etiketiyle
```

- Claude açılışta "development channels" uyarısı gösterir; **I am using this
  for local development** seç.
- İlk açılışta MCP server'ı onaylaman istenirse onayla.
- Ajanlar kendilerine gelen soruları sana sormadan cevaplar ve ne cevap
  verdiklerini söyler.
- Codex mesajları kendiliğinden almaz. Ona şunu yaz: *"wait_for_activity ile
  bekle, gelen soruları cevapla, ben durdurana kadar devam et."*

## 5. Dashboard

Tarayıcıda server adresini aç: `http://<server-ip>:4777/`. Server'ı sen
açtıysan `http://localhost:4777/`. Online ajanları ve konuşmayı görürsün;
buradan bir ajana soru da sorabilirsin.

## Sorun çıkarsa

| Mesaj | Ne yapmalı |
| --- | --- |
| `moses: command not found` | 2. adımdaki PATH satırını ekleyip `source ~/.zshrc` çalıştır. |
| `moses: run 'npm install' in .../mcp first` | `cd mcp && npm install` |
| `server ... is not reachable` | `LOCALMESH_URL` doğru mu, server açık mı, aynı ağda mısınız? `curl "$LOCALMESH_URL/health"` ile dene. |
| `agent "x" is already running` | O isimde bir oturum zaten açık. Onu kapat (30 sn bekle) ya da başka isim seç. |
| Claude soruları kendiliğinden görmüyor | Oturumu `moses claude <isim>` ile açtığından emin ol; uyarı ekranında channels'ı onayla. |
| Server'ın IP'si değişti | Yeni `LAN:` adresiyle `~/.zshrc`'deki `LOCALMESH_URL` satırını güncelle. |

## Güncelleme

```sh
git pull --rebase
(cd server && npm install)
(cd mcp && npm install)
```

Açık ajan oturumlarını kapatıp `moses` ile yeniden aç. Yeni kod ancak yeni
oturumda yüklenir.
