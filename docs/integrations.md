# Integrációs beállítások

A kapcsolati állapot, a külső szolgáltató elérhetősége és az üzleti folyamat teljes integrációja külön fogalom. A felület ezeket külön jelzi: a konfigurált kulcs önmagában nem bizonyít sikeres kapcsolatot, a kapcsolatteszt pedig nem jelent pénzügyi feladást vagy teljes szolgáltatói lefedettséget.

## Munkatérhez kötés és titkok

Minden szolgáltatói kulcs kizárólag a szerver futtatási környezetéből olvasható. A kötelező `TMS_INTEGRATION_WORKSPACE_ID` értéke a kiválasztott ügyfél **pontos munkatér-azonosítója**. Ezt a provisioning parancs kimenete, a hitelesített `/api/session` válasz vagy a rendszerfelület mutatja.

A globális szolgáltatói változók egy telepítésen belül egyszerre egy munkatérhez rendelhetők. A többi munkatér számára ugyanaz a szolgáltatás nem konfiguráltnak látszik és nem használható. Több ügyfél eltérő szolgáltatói fiókjához jelenleg külön telepítés vagy később fejlesztendő, munkatérhez rendelt titokkezelés szükséges.

A böngésző az elvárt változók **nevét**, a kapcsolat állapotát és a képességhatárt kapja meg; a kulcsok és jelszavak értékét nem. A környezeti változó megváltoztatása után indítsd újra az alkalmazást. Egyik változó neve sem `NEXT_PUBLIC_` kezdetű.

| Változó                        | Rendeltetés                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `TMS_INTEGRATION_WORKSPACE_ID` | A szolgáltatói beállításokhoz jogosult munkatér pontos UUID-je.                      |
| `TMS_HERE_API_KEY`             | HERE Routing API v8 szolgáltatói kulcs.                                              |
| `TMS_GOOGLE_MAPS_API_KEY`      | Google Routes API-kulcs, engedélyezett Routes szolgáltatással.                       |
| `TMS_SAP_BASE_URL`             | Teljes HTTPS Service Layer alap-URL, például `https://sap.example.com:50000/b1s/v2`. |
| `TMS_SAP_COMPANY_DB`           | SAP CompanyDB.                                                                       |
| `TMS_SAP_USERNAME`             | Elkülönített SAP integrációs felhasználó.                                            |
| `TMS_SAP_PASSWORD`             | SAP integrációs felhasználó jelszava.                                                |
| `TMS_WEBHOOK_URL`              | Az üzemeltető által engedélyezett HTTPS kapcsolatteszt-cél.                          |

A katalógusban szereplő `TMS_SCANR_BASE_URL` és `TMS_SCANR_API_KEY` tervezett konfigurációs nevek. Beállításuk nem kapcsol be OCR-adaptert; a scanR API-szerződése még szükséges.

## Megvalósított adapterek

### HERE Routing

A szerver a `https://router.hereapi.com/v8/routes` végpontot `transportMode=truck` és `return=summary` paraméterekkel hívja. Az útvonalszakaszok hosszát és időtartamát összeadja. Igény esetén a teljes járműössztömeg, magasság, szélesség és hossz megadható.

Az adatokból távolság és menetidő készül. A térképen megjelenített sematikus vonalak nem a szolgáltató úthálózati geometriái. Az ADR, a vezetési/pihenőidő és a tachográf megfelelőségének ellenőrzése külön feladat. A `truckRestrictionsApplied` a HERE teherautós mód használatát jelzi; csak a kifejezetten megadott járműparamétereket lehet figyelembe venni.

Szolgáltatói leírás: [HERE Routing API v8](https://docs.here.com/routing/docs/routing-v8-get-started).

### Google Routes

A szerver a `directions/v2:computeRoutes` végpontot hívja `DRIVE`, `TRAFFIC_AWARE`, magyar nyelv és metrikus mértékegységek beállítással. A válaszból a távolságot és az időtartamot használja.

A Google-adapter nem teherautós megfelelőségi szolgáltatás. Ha a kérés teherautó-méretparamétert tartalmaz, az alkalmazás 422 hibával elutasítja, ahelyett hogy figyelmen kívül hagyná. A menetidő az adott kérés eredménye; folyamatos GPS- vagy automatikus ETA-frissítés nincs.

Szolgáltatói leírás: [Google Routes – útvonalszámítás](https://developers.google.com/maps/documentation/routes/compute_route_directions).

### SAP Business One

A kapcsolatteszt a beállított Service Layer környezetben:

1. `POST /Login` a szolgáltatói hitelesítő adatokkal;
2. `GET /$metadata` a kapott SAP-munkamenettel;
3. `POST /Logout` a teszt lezárására.

A teszt üzleti adatot nem ír, számlát nem ad fel, partnert nem hoz létre. Az alkalmazáson belüli outbox egyelőre a számlaelőkészítés állapotát és az átadandó adatcsomag helyi ellenőrzését mutatja. A kétirányú pénzügyi interfészhez az NTT DATA-val egyeztetett objektum-/mezőmapping, felelősségi határ, idempotencia, hibasor és UAT szükséges.

Az SAP URL HTTPS legyen és a tanúsítványláncot a Node futtatókörnyezet fogadja el. Nincs beépített TLS-ellenőrzést megkerülő kapcsoló.

Szolgáltatói leírás: [SAP Business One Service Layer API Reference](https://help.sap.com/doc/056f69366b5345a386bb8149f1700c19/10.0/en-US/Service%20Layer%20API%20Reference.html).

### Egyedi webhook

Az adapter `HEAD` kéréssel ellenőrzi a beállított HTTPS-végpont elérhetőségét. Nem küld fuvaradatot vagy eseményt. Aláírt üzenetküldés, eseményfeliratkozás, kézbesítési visszaigazolás és újrapróbálás nincs implementálva.

## API-szerződés

Minden végpont hitelesített munkamenetet igényel. A módosító kérésekhez a saját alkalmazás `Origin` fejlécének is egyeznie kell. A végpontok a szerveroldali munkatér- és szerepkör-ellenőrzést használják; nincs publikus partneri API-kulcsos rendelésfogadás.

| Végpont                        | Jogosultság                       | Eredmény                                                                               |
| ------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /api/integrations`        | Bejelentkezett felhasználó        | Katalógus, képességhatárok, változónevek, státusz és munkatérkötés; titokérték nélkül. |
| `POST /api/integrations/test`  | Adminisztrátor                    | `{ "id": "here" }`, `google`, `sap` vagy `webhook` kapcsolat ellenőrzése.              |
| `POST /api/integrations/route` | Adminisztrátor vagy fuvarszervező | HERE/Google útvonaleredmény koordinátapárból.                                          |

Példa útvonalkérés a már bejelentkezett alkalmazásból:

```json
{
  "provider": "here",
  "origin": { "lat": 47.4979, "lng": 19.0402 },
  "destination": { "lat": 47.6875, "lng": 17.6504 },
  "truck": {
    "grossWeightKg": 40000,
    "heightCm": 400,
    "widthCm": 255,
    "lengthCm": 1650
  }
}
```

A `grossWeightKg` a teljes járműössztömeg, nem csupán az áru tömege. Google esetén a `truck` mezőt hagyd el. A válasz tartalmazza a `provider`, `kilometers`, `minutes`, `truckRestrictionsApplied`, `calculatedAt` és `notice` mezőket. A perc felfelé kerekített, a távolság tizedkilométeres.

Az adapterek 12 másodperces időkorlátot alkalmaznak és nem követnek átirányítást. Jogosultsághiba: 403; be nem állított kapcsolat: 503; szolgáltatói hiba: 502; hibás bemenet: 422. A HERE/Google kapcsolatteszt is valódi szolgáltatói útvonalkérést indít, ezért a szolgáltató kvótája és díjszabása vonatkozik rá.

## Szerződést és további fejlesztést igénylő kapcsolatok

| Kapcsolat                   | Következő konkrét bemenet                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| Tesotter scanR              | Hitelesített feltöltési/lekérdezési végpont, válaszséma, pontosság/ellenőrzési állapot és hibaszerződés. |
| Transporeon                 | Partneri hozzáférés, rendelés- és státuszadatok sémája, külső azonosítók és idempotenciakulcs.           |
| project44 / GPS             | Engedélyezett járműazonosítók, webhook/polling szerződés, GPS-időbélyeg és késleltetés kezelése.         |
| SMTP / e-mail               | Küldő domain és szolgáltató, címzési szabály, jóváhagyás, kézbesítési állapot és retry.                  |
| AI sérülésfelismerés / Tess | Modellszolgáltató, felhasználási jogosultság, értékelési adatkészlet és emberi jóváhagyási szabály.      |

A hiányzó szolgáltatói hozzáférést az alkalmazás nem szimulálja sikeres éles kapcsolatként.
