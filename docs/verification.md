# Ellenőrzési jegyzőkönyv

Dátum: 2026. november 5. Helyi időzóna: Europe/Budapest. Node.js 22.14.0.

## Automatizált ellenőrzések

- `npm test`: 60 teszt. Üzleti szabályok, időbeli kiosztás, hitelkeret, számlázási lánc, valódi XLSX-olvasás, munkatér-elkülönítés, szerepkörök, privát fájlok, jelszó és munkamenet, jóváhagyott beszerzések védelme, cégtörzs, mentési versenyhelyzetek és üzemeltetői CLI-k.
- `npx tsc --noEmit`: sikeres.
- `npm run lint`: sikeres.
- `npm run build`: sikeres production build.
- `npm audit --omit=dev --audit-level=moderate`: 0 sérülékenység.
- `git diff --check`: sikeres.

A fejlesztői függőségek auditja 8 mérsékelt, a typescript-eslint/minimatch lánchoz tartozó jelzést tartalmaz. Automatikus, főverziót váltó javítás nem történt.

## Böngészős próbák

Az ellenőrzés külön `/tmp` alatti SQLite-adatbázissal és csak localhoston futó production példánnyal történt. A kipróbáláshoz használt fiókok és jelszavak nem részei az alkalmazás alapadatainak.

1. Bejelentkezés, kijelentkezés, új munkatér és saját cégnév megjelenítése.
2. Nyolclépéses fuvarfelvétel: partner és hitelkeret, rakodási adatok, díj, kamionból töltött sofőr/pótkocsi/előző hely, valós PDF kiválasztása, visszaigazolás és sikeresen visszaigazolt központi mentés.
3. Elmentett fuvar megnyitása és módosítása: a módosított megjegyzés a szerver válasza után jelenik meg a részletekben.
4. Valódi XLSX-fájl kiválasztása, első munkalap beolvasása, üzleti ellenőrzés és táblázatos előnézet, atomikus import, majd az új köteg visszavonása. A fuvarszám 9 → 10 → 9, a központi revízió minden mentésnél nőtt.
5. Mintaadat nélküli második ügyfélmunkatér: saját cég, üres flotta és használható kezdő állapot; első sofőr mentése, majd a járműfelvétel elérhetővé válása. Másik munkatér fuvarjai nem láthatók.
6. Dashboard 390 × 844-es mobilnézetben. A javítás után a dokumentum szélessége és a viewport egyaránt 390 px; nincs oldalirányú oldaltúlcsordulás.
7. Dashboard, integrációs központ, fuvarfelvétel és diszpécseri időterv vizuális ellenőrzése. A diszpécseri kártyák az időterv sávjában olvashatók; mobilon a kapacitástábla belül görgethető.

A képernyőképek az `output/` könyvtárban, bemutató- és tesztadatokkal készültek.

## Nem igazolt külső feltételek

Szolgáltatói kulcsok hiányában nem történt éles HERE/Google/SAP-kérés; az adapterek szerződéseit mockolt válaszokkal teszteltük. A scanR, Transporeon, project44, SMTP, AI és tachográf szolgáltatás nincs élesítve. A Docker image futtatása nem volt ellenőrizhető, mert a helyi gépen nincs Docker CLI. Nem történt nyilvános telepítés vagy GitHub-push.

A részletes megvalósítási határok a [követelménymátrixban](requirements-coverage.md) és az [integrációs leírásban](integrations.md) szerepelnek.

## Második UI-kör: fuvarlista és járműtervező

A felhasználói képreferenciák alapján külön operációs felület készült, a korábbi zöld–teal/lime színvilág megtartásával. Az ellenőrzött tesztcsomag 79/79 sikeres tesztre bővült; a teljes lint, a TypeScript-ellenőrzés és a production build sikeres.

- Fuvarlista: kiosztatlan/kiosztott/összes fülek; kombinálható partner-, dátum-, státusz-, reláció-, rakomány-, ADR-, erőforrás-, pénzügyi és dokumentumszűrők; közvetlen szerkesztő, 25 választható oszlop, kijelölés és export.
- Oszlopszélesség: a böngészős próbában 200 → 210 px billentyűzettel, majd 245 px egérhúzással. Az új szélesség oldalfrissítés után is 245 px maradt. Oszlop elrejtése és sorrendjének módosítása a tényleges táblázat fejlécében is érvényesült.
- Kombinált szűrés: a megbízó és a „Győr” keresőkifejezés együtt pontosan egy megfelelő fuvarra szűkítette a tesztállományt.
- Tervező: napos, háromnapos és heti naptár; a heti próba a november 5–11. közötti hét napot mutatta. Jármű, sofőr és pótkocsi együtt látható; a rögzített időpontok ütközései külön piros figyelmeztetésben és egymás alatti sávokban jelennek meg.
- A tervező próbájához kizárólag az elkülönített tesztadatbázisban szándékos, korábbi rendszerből örökölt ütközést modelleztünk. A normál szerveroldali kiosztás továbbra is tiltja az ilyen ütközést. A rakodás és a köztes menetszakaszok becsült időtartamát a felület megjelöli; ez nem GPS- vagy tachográfadat.

A személyes oszlopbeállítások munkatérhez, felhasználóhoz és nézethez kötve az adott böngészőben tárolódnak. A beállítások nem változtatják meg az üzleti adatokat vagy a hozzáférési jogosultságokat.
