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

Açılışta şuna benzer satırlar çıkar:

```
LocalMesh server listening: http://localhost:4777 | LAN: http://192.168.1.35:4777

Join token for http://192.168.1.35:4777:
  lm1_aHR0cDovLzE5Mi4xNjguMS4zNTo0Nzc3fC4uLg
  Start an agent: moses claude --name <name> --token lm1_...
  Dashboard:      http://192.168.1.35:4777/#secret=...
```

**Join token**'ı (`lm1_...`) ekibe ver. İçinde hem server adresi hem şifre var;
ekip dışına verme. **Her `npm run dev`'de yeni şifre ve yeni token üretilir**,
eskisi çalışmaz; server'ı her açtığında yeni token'ı ekibe ver. Kod değişince
server'ın kendini yeniden başlatması token'ı değiştirmez. Bu terminal açık
kaldığı sürece server çalışır.

macOS "node gelen bağlantıları kabul etsin mi?" diye sorarsa **İzin Ver** de;
yoksa diğer bilgisayarlar bağlanamaz.

### Token'ı kaydet (herkes)

Token'ı `~/.zshrc`'ye eklersen `--token` yazman gerekmez. Server her açıldığında
token değiştiği için bu satırı güncellemen gerekir:

```sh
echo 'export LOCALMESH_TOKEN=lm1_...' >> ~/.zshrc
source ~/.zshrc
```

## 4. Ajanı başlat

Her ajanın ağda **benzersiz** bir adı olmalı:

```sh
moses claude --name enes1                    # Claude Code ajanı
moses codex --name enes2                     # Codex ajanı
moses claude --name enes3 --layer review     # dashboard'da görünen rol etiketiyle
moses claude --name enes4 --token lm1_...    # token'ı .zshrc'ye kaydetmediysen
moses claude -n enes5 -t lm1_...             # kısa hali: -n = --name, -t = --token
```

- Claude açılışta "development channels" uyarısı gösterir; **I am using this
  for local development** seç.
- İlk açılışta MCP server'ı onaylaman istenirse onayla.
- Ajanlar kendilerine gelen soruları sana sormadan cevaplar ve ne cevap
  verdiklerini söyler.
- Codex mesajları kendiliğinden almaz. Ona şunu yaz: *"wait_for_activity ile
  bekle, gelen soruları cevapla, ben durdurana kadar devam et."*

## 5. Dashboard

Server açılışında yazan **Dashboard** linkini aç (`http://<server-ip>:4777/#secret=...`).
Tarayıcı şifreyi hatırlar, sonra sadece `http://<server-ip>:4777/` yeter. Linksiz
açarsan dashboard join token'ı sorar; `lm1_...` token'ı yapıştır. Online
ajanları ve konuşmayı görürsün; buradan bir ajana soru da sorabilirsin.

## Sorun çıkarsa

| Mesaj | Ne yapmalı |
| --- | --- |
| `moses: command not found` | 2. adımdaki PATH satırını ekleyip `source ~/.zshrc` çalıştır. |
| `moses: run 'npm install' in .../mcp first` | `cd mcp && npm install` |
| `--token is required` | Token'ı `--token lm1_...` ile ver ya da `LOCALMESH_TOKEN`'ı `~/.zshrc`'ye ekle. |
| `not a valid LocalMesh join token` | Token eksik kopyalanmış; `lm1_` ile başlayan satırın tamamını al. |
| `rejected this token` | Server yeniden açılmış, token değişmiş. Server açılışındaki güncel token'ı al. |
| `server ... is not reachable` | Server açık mı, aynı ağda mısınız, server'ın IP'si değişti mi? |
| `agent "x" is already running` | O isimde bir oturum zaten açık. Onu kapat (30 sn bekle) ya da başka isim seç. |
| Claude soruları kendiliğinden görmüyor | Oturumu `moses claude --name <isim>` ile açtığından emin ol; uyarı ekranında channels'ı onayla. |
| Server'ın IP'si değişti | Server açılışındaki yeni token'ı al, `~/.zshrc`'deki `LOCALMESH_TOKEN`'ı güncelle. Ya da geçici olarak `--url http://<yeni-ip>:4777` ekle. |
| Dashboard "Locked" diyor | Sayfayı yenile ve join token'ı yapıştır, ya da server açılışındaki Dashboard linkini aç. |
| Token sızdı | Server'ı durdurup `npm run dev` ile yeniden aç; yeni token'ı ekibe ver. |

## Güncelleme

```sh
git pull --rebase
(cd server && npm install)
(cd mcp && npm install)
```

Açık ajan oturumlarını kapatıp `moses` ile yeniden aç. Yeni kod ancak yeni
oturumda yüklenir.
