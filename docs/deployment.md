# Telepítés és üzemeltetés

Ez a kiadás egy tartós lemezzel rendelkező Node.js-kiszolgálóra készült. A támogatott alap **Node 22.13+**, egy alkalmazáspéldány és helyi SQLite-adatbázis. A fájlok is az adatbázisban vannak. Átmeneti lemezű serverless környezetbe vagy több gép közösen csatolt hálózati fájlrendszerére ez a tárolási megoldás nem telepíthető változtatás nélkül.

## Helyi használat

```sh
npm ci
npm run dev
```

A [helyi felület](http://localhost:3000) első alkalommal a munkatér és az első adminisztrátor létrehozását kéri. A jelszó legalább 12 karakter. A bemutatóadatok opcionálisak; a minta cégek és személyek kizárólag bemutatásra szolgálnak.

A kezdeti beállítási végpont csak addig használható, amíg egyetlen felhasználó sincs az adatbázisban. Nyilvános telepítésnél az első adminisztrátor létrehozásáig a hozzáférést a reverse proxy vagy a hálózati szabály korlátozza. További független ügyfeleket az üzemeltető CLI-n hoz létre.

## Production Node.js-folyamat

```sh
npm ci
npm test
npx tsc --noEmit
npm run build
```

A futtatókörnyezetben állítsd be:

```text
NODE_ENV=production
TMS_DATABASE_PATH=/var/lib/tess-tms/tess-tms.sqlite
TMS_PUBLIC_URL=https://tms.example.com
```

Indítás:

```sh
npm start -- --hostname 127.0.0.1 --port 3000
```

Az adatbázis könyvtára legyen írható az alkalmazás rendszerfelhasználójának. A program a könyvtárat `0700`, az adatbázist `0600` jogosultsággal hozza létre. A mentéseknek is védett hely szükséges. A függőségek között a `tsx` a provisioning és backup CLI-hez futási időben is szükséges, ezért ezekhez ne használd az `npm ci --omit=dev` parancsot.

Az alkalmazást folyamatfelügyelővel vagy konténerrel indítsd újra rendszerindítás és hiba után. Az `npm run dev` fejlesztésre szolgál.

## Docker

A Dockerfile kétlépcsős, Debian-alapú Node 22 image-et használ. A folyamat a `node` felhasználóval fut, a tartós adatok a `/app/data` volume-ra kerülnek. Nincs szükség külön SQLite-csomag telepítésére.

```sh
docker build -t tess-tms:local .
docker volume create tess-tms-data
docker run -d --name tess-tms --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v tess-tms-data:/app/data \
  -e TMS_PUBLIC_URL=https://tms.example.com \
  tess-tms:local
```

A példadomaint a saját HTTPS-domainre cseréld. Ezzel a beállítással az alkalmazást a megfelelő HTTPS reverse proxyn keresztül nyisd meg; a közvetlen HTTP localhost URL más eredetnek számít és a Secure munkamenetsütit sem küldi el.

A healthcheck a `/api/health` útvonalat használja. Ez a webfolyamat elérhetőségét jelzi; az adatbázis-visszaállítás vagy a külső szolgáltatók működését nem tanúsítja.

A build kontextusából a `.dockerignore` kizárja a helyi adatbázisokat, a `.env` fájlokat, a böngészős képernyőképeket és a fejlesztői kimeneteket. Titkokat futtatáskori környezeti változóban vagy a hoszt titokkezelőjén keresztül adj át. A példák nem tartalmaznak valós hitelesítő adatot.

## HTTPS és reverse proxy

A Next.js elé HTTPS-t lezáró reverse proxy kerüljön. Egy minimális Caddy-példa:

```caddyfile
tms.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

A `TMS_PUBLIC_URL` pontos origin legyen: séma, host és nem alapértelmezett port is számít. A módosító API-k a kérés `Origin` fejlécét ehhez ellenőrzik. HTTPS mellett a munkamenetsüti `Secure`, minden környezetben `HttpOnly`, `SameSite=Lax`; lejárata 12 óra.

A proxy ne cache-elje az `/api/*` válaszokat, ne írja át a bejövő `Origin` fejlécet, és engedjen át legalább 20 MB-os fájlfeltöltést. Az alkalmazás külön 8 MB-os JSON- és 20 MB-os fájlkorlátot alkalmaz. A hoszt és a proxy naplója ne rögzítsen jelszót, sütit vagy szolgáltatói API-kulcsot.

A [Next.js hivatalos self-hosting útmutatója](https://nextjs.org/docs/app/guides/self-hosting) részletezi a reverse proxy szerepét.

## Ügyfélmunkatér létrehozása

A `workspace:create` önálló munkateret és annak első adminisztrátorát hozza létre. A JSON-t kizárólag standard bemeneten fogadja; ne add át a jelszót parancssori argumentumként vagy Gitbe kerülő fájlban.

Példa Python 3-mal, a jelszó képernyőre írása és shell historyba helyezése nélkül:

```sh
python3 -c '
import getpass, json, sys

def ask(prompt):
    print(prompt, file=sys.stderr, flush=True)
    return input()

print(json.dumps({
    "workspaceName": ask("Munkatér neve:"),
    "name": ask("Adminisztrátor neve:"),
    "email": ask("Adminisztrátor e-mail-címe:"),
    "password": getpass.getpass("Jelszó (legalább 12 karakter): "),
    "sampleData": False
}))
' | npm run workspace:create
```

A CLI ugyanazt a `TMS_DATABASE_PATH` értéket kapja, mint a futó alkalmazás. Dockerben a pipe jobb oldala `docker exec -i tess-tms npm run workspace:create` lehet. Siker esetén a kimenet a munkatér nevét és azonosítóját tartalmazza, a jelszót nem.

Az e-mail-cím a teljes telepítésben egyedi. Egy fiók egy munkatérhez tartozik. A munkatér adminisztrátora a felhasználókezelésben további adminisztrátor, fuvarszervező, pénzügyi és megtekintő fiókot adhat hozzá, szerepkört módosíthat és fiókot tilthat le. Szerepkörváltás vagy letiltás visszavonja az érintett munkameneteket. Az utolsó aktív adminisztrátor nem tiltható le és nem sorolható át. Minden felhasználó módosíthatja saját jelszavát a jelenlegi jelszó megadásával; ez visszavonja a korábbi munkameneteit és új munkamenetet ad. SSO, MFA, elfelejtett jelszó helyreállítása és finomabb cég-/sofőr-/partnerjogosultság külön fejlesztési feladat.

## Mentés

A biztonsági mentés konzisztens SQLite-másolatot készít `VACUUM INTO` segítségével; a forrás adatbázis közben használatban maradhat.

```sh
npm run backup -- /biztonsagos/hely/tess-tms-2026-11-05.sqlite
```

Dockerben, a tartós volume-on lévő célkönyvtárba:

```sh
docker exec tess-tms npm run backup -- /app/data/backups/tess-tms-2026-11-05.sqlite
```

A célfájl még nem létezhet. A mentés tartalmazza a munkatereket, adatokat, feltöltött fájlokat, felhasználókat, jelszóhasheket, munkameneteket és auditot. A szolgáltatói titkok a környezetben vannak, ezért azokat a hoszt titokkezelőjének mentése védi. A felületi JSON-export rekordexport, bináris fájlokat és hitelesítési adatokat nem tartalmaz, ezért nem helyettesíti ezt a mentést.

A mentést másik gépre vagy tartós, titkosított mentéstárba is másold. Automatizálását a hoszt ütemezőjével állítsd be, rendszeres visszaállítási próbával és az ügyféllel egyeztetett megőrzéssel. A repo nem hoz létre automatikus backup-szolgáltatást.

## Visszaállítás

1. Állítsd le az alkalmazást; a visszaállítás alatt ne legyen író folyamat.
2. Tedd félre a jelenlegi adatbázist és a hozzá tartozó `-wal` / `-shm` állományokat egy külön helyre.
3. A bevizsgált mentést másold a `TMS_DATABASE_PATH` helyére. Állítsd be az alkalmazás felhasználóját tulajdonosnak és a `0600` jogosultságot. A régi WAL/SHM fájlokat ne hagyd az új adatbázis mellett.
4. Az offline visszaállított másolat `sessions` tábláját ürítsd ki adatbáziskezelővel, hogy a régi munkamenetek ne éledjenek újra.
5. Indítsd el az alkalmazást. Ellenőrizd a bejelentkezést, a megfelelő munkatér fuvarjait, egy csatolt fájl letöltését és az auditot.

Verziófrissítés előtt is készüljön mentés. A jelenlegi sémaindítás táblákat hoz létre; általános adatbázis-migrációs keretrendszer még nincs. Visszaállítás után az audit visszagörgetett állapotát az üzemeltetési naplóban is rögzíteni kell.

## Kapacitás és következő élesítési kapuk

A munkatér üzleti állapota jelenleg egy validált JSON-rekord, teljes munkatérre vonatkozó revízióval. Egy ütköző módosítás 409 választ kap, és frissíti az állapotot; nem írja felül csendben a másik felhasználó mentését. Nagy adatmennyiségnél normalizált, indexelt táblákra és műveletszintű API-kra szükséges áttérni.

Több ügyfél széles körű éles kiszolgálása előtt külön feladat a kapacitásvizsgálat, a helyreállítási célok tesztje, a megőrzési/törlési szabályok, a fájlok tartalomalapú és kártevőellenőrzése, az SSO/MFA és a külső, privilegizált adatbázis-módosításnak is ellenálló auditarchívum. A jelenlegi audit alkalmazásszinten és SQLite-triggerekkel append-only; az adatbázis adminisztrátorával szemben nem megváltoztathatatlan bizonyíték.
