# tessTMS - megvalósítási alap

## Termékhatár

A tessTMS nem egy fuvarlista, hanem a cégcsoport operációs rendszere. A rendszer központi üzleti egysége a **fuvarmegbízás**: ehhez kapcsolódnak a megállók, árumozgások, díjak, költségek, jármű- és sofőrkiosztás, dokumentumok, számlaelőkészítés, valamint az auditesemények. Ez az összekapcsolás egyszerre szolgálja a napi diszponálást, a pénzügyi lezárást és a vezetői kontrollingot.

Az első működő vertikális szelet a specifikált rögzítési folyamat:

1. partner, kapcsolattartó, fuvarszám, típus és szerződés kiválasztása;
2. szabad hitelkeret ellenőrzése;
3. több felrakó/lerakó és tételszintű áru rögzítése;
4. rakott és üres kilométer, fuvardíj, tervköltség és fedezet számítása;
5. jármű, pótkocsi, sofőr, AETR és előző lerakóhely ellenőrzése;
6. kapott dokumentum kapcsolása és visszaigazolás generálása;
7. verziózott, auditált mentés.

## Tartományi modell

| Tartomány         | Alap entitások                                                            | Kritikus szabály                                                |
| ----------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Szervezeti modell | tenant, cég, üzletág, telephely, felhasználó, szerepkör                   | Minden üzleti rekord tenant- és cégkörnyezethez kötött.         |
| Törzsadatok       | partner, kapcsolattartó, cím, szerződés, díjtábla, jármű, pótkocsi, sofőr | Érvényességi intervallum és verzió szükséges.                   |
| Fuvar             | megbízás, megálló, árumozgás, kiosztás, státuszesemény                    | A státusz csak engedélyezett workflow-átmenettel változhat.     |
| Pénzügy           | díj, pénznem, árfolyam, terv/tény költség, fedezet, számlázási profil     | A hitelkeret-kontroll szerveroldali és tranzakciós.             |
| Dokumentum        | dokumentum, metaadat, OCR-eredmény, kapcsolat, verzió                     | A fájl nem közvetlen URL, hanem jogosultságos dokumentumrekord. |
| Integráció        | bejövő üzenet, outbox esemény, feldolgozási állapot, idempotenciakulcs    | Minden külső hívás visszajátszható és duplikációbiztos.         |

## Biztonsági minimum, nem marketingígéret

- Az identitás, jogosultság és tenant-szűrés minden szerveroldali route handler és művelet elején kötelező; a kliens csak kényelmi réteg.
- RBAC + adathatókör: diszpécser, pénzügy, flotta, karbantartás, partner, sofőr és vezető külön jogokkal; a legkisebb jogosultság elve érvényesül.
- A relációs adatbázisban kötelező a `tenant_id`, a Row-Level Security, az indexelt tenant/cég/id kulcs és az írási tranzakció.
- Pénzügyi, státusz- és dokumentumművelet hash-elt, időbélyegzett audit-eseményt kap; az auditnapló nem írható felül normál alkalmazásjoggal.
- Dokumentumok objektumtárba kerülnek, titkosítva, rövid élettartamú letöltési jogosultsággal; feltöltéskor fájltípus-, méret- és kártevőellenőrzés szükséges.
- Titkok kizárólag szerveroldali környezeti változóban vagy titokkezelőben lehetnek. A böngészőbe csak szándékosan nyilvános konfiguráció kerülhet.
- GDPR: célhoz kötött adatkezelés, megőrzési szabály, export/törlési folyamat és hozzáférési napló kell a bevezetési döntés előtt.

## Skálázási és integrációs irány

1. **Moduláris monolit kezdés**: egy Next.js alkalmazás, egy jól határolt domainréteg és egy relációs adatbázis. Ez gyors és konzisztens az első ügyfeleknél.
2. **Esemény-alapú bővítés**: outbox tábla + queue a telematika, OCR, e-mail, SAP B1, Transporeon, Project44 és számla integrációk számára. Nem külső API-hívásban tartjuk nyitva a felhasználói tranzakciót.
3. **Aszinkron számítások**: OCR, dokumentumpárosítás, útvonal-optimalizálás, prediktív ETA és nagy riportok feladatsorban futnak, állapottal és újrapróbálással.
4. **Adatparticionálás**: a nagy volumenű GPS- és eseményadat idő és tenant szerint particionálható; az operatív lekérdezésekhez célzott indexek és olvasási modellek készülnek.
5. **Megfigyelhetőség**: korrelációs azonosító minden megbízás- és integrációs folyamatban, strukturált napló, metrika, riasztás és hibakövetés.

## Kiadási sorrend

| Fázis             | Szállítandó üzleti érték                                                           |
| ----------------- | ---------------------------------------------------------------------------------- |
| 0. Alap           | tenant/role/audit modell, törzsadatok, CI, titok- és környezetkezelés              |
| 1. Core TMS       | megbízás, hitelkeret, megállók/áru, költség/fedezet, kiosztás, dokumentumkapcsolat |
| 2. Diszponálás    | naptár/drag-drop, élő státusz, mobil sofőrfolyamat, dokumentumhiány-kezelés        |
| 3. Pénzügy és ERP | számlaelőkészítés, PO/eltérés workflow, SAP B1 kétirányú interfész                 |
| 4. Optimalizálás  | telematika, ETA, AETR, útvonalajánlás, multi-depó és AI támogatás                  |

## Értékesíthető csomagolás

- **Core**: megbízás, diszponálás, flotta, dokumentumok és standard riportok.
- **Control**: költség/fedezet, számlaelőkészítés, több cég, partnerportál és integrációk.
- **Enterprise**: SAP B1, egyedi workflow, SSO, audit/export, dedikált környezet és optimalizálás.

A csomagok közös kódalapra épülnek; funkciókapcsoló és jogosultság dönti el, mi engedélyezett egy ügyfélnek. Ez eladható, de nem fragmentálja a terméket ügyfelenként.
