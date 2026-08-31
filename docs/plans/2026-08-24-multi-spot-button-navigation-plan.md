---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
---

# Multi-spot support en knopnavigatie

## Besluit

We starten met een vaste, zorgvuldig gekozen lijst van drie spots:

| Volgorde | Spot | Gebruik |
| --- | --- | --- |
| 1 | Edam | Huidige standaardspot |
| 2 | Brouwersdam | Kust- en kitesurfspot |
| 3 | Castricum aan Zee | Noord-Hollandse kustspot |

De linker bovenknop gaat naar de vorige spot. De rechter bovenknop gaat naar de volgende spot. Aan het einde van de lijst loopt de navigatie rond. De groene knop verandert niet.

Het scherm gebruikt eerst lokaal opgeslagen forecasts. Daardoor hoeft een druk op een knop normaal geen wifi-verbinding of API-call te veroorzaken en kan het apparaat zuinig blijven werken.

## Productgedrag

### Knoppen

| Knop | Huidig gedrag | Nieuw gedrag |
| --- | --- | --- |
| Links, `GPIO 5` | Forecast geforceerd verversen | Vorige spot |
| Rechts, `GPIO 4` | Scherm wissen | Volgende spot |
| Groen, `GPIO 3` | Wake/onderhoud | Ongewijzigd |

Een korte druk telt precies eenmaal. Extra drukken tijdens een schermupdate worden genegeerd. We tonen geen tussentijds laadscherm, omdat dat twee trage e-ink-updates zou veroorzaken.

De fysieke functie om het scherm te wissen verdwijnt. Deze is te destructief voor een gewone knop en is niet nodig voor dagelijks gebruik.

### Volgorde

Rechts navigeert als volgt:

`Edam -> Brouwersdam -> Castricum aan Zee -> Edam`

Links navigeert in de omgekeerde richting.

### Schermupdate

1. Bepaal de doelspot.
2. Lees de lokaal opgeslagen forecast voor die spot.
3. Gebruik alleen bij ontbrekende of onbruikbare data het netwerk.
4. Render het bestaande dashboard met de nieuwe plaatsnaam, coordinaten en forecast.
5. Sla de gekozen spot pas op nadat het scherm succesvol is bijgewerkt.

Als de netwerkfetch mislukt maar er nog bruikbare cachedata bestaat, tonen we die met de bestaande verouderingsstatus. Zonder cache tonen we de doelspot met de bestaande `UNAVAILABLE`-status.

## Requirements

| ID | Requirement |
| --- | --- |
| R1 | De firmware bevat een vaste spotcatalogus, onafhankelijk van forecast- en rendercode. |
| R2 | Edam, Brouwersdam en Castricum aan Zee staan in een expliciete, stabiele volgorde. |
| R3 | Elke spot heeft een stabiele ID, schermnaam, breedtegraad, lengtegraad en tijdzone. |
| R4 | De exacte surfgerichte coordinaten van Brouwersdam en Castricum aan Zee worden voor implementatie vastgezet. |
| R5 | Links kiest de vorige spot; rechts kiest de volgende spot; navigatie loopt rond. |
| R6 | Beide knoppen werken tijdens normaal gebruik en als wakebron vanuit deep sleep. |
| R7 | De rechter knop wist het scherm niet meer. |
| R8 | De actieve spot wordt persistent opgeslagen en overleeft slaap, reset en stroomverlies. |
| R9 | Forecastcache is per spot gescheiden, zodat data nooit onder de verkeerde plaatsnaam verschijnt. |
| R10 | Een cache-hit tijdens spotwisselen activeert geen wifi en doet geen API-call. |
| R11 | Iedere geplande forecastupdate probeert alle drie spots te verversen. |
| R12 | Een mislukte spotfetch blokkeert het verversen van de andere spots niet. |
| R13 | Een knopdruk veroorzaakt maximaal een paneelupdate. |
| R14 | De bestaande dashboardlayout, dithering en tijdstippen blijven ongewijzigd. |
| R15 | De groene knop en OTA-/onderhoudsflow blijven ongewijzigd. |

## Scope

### In scope

- Drie vaste Nederlandse spots.
- Vorige/volgende navigatie met de twee bovenknoppen.
- Persistent onthouden van de gekozen spot.
- Forecastcache en status per spot.
- Cache-first wisselen zonder onnodig netwerkgebruik.
- Prefetch van alle spots tijdens de bestaande geplande updates.
- Hosttests en een praktijktest op het apparaat.

### Niet in scope

- Spots toevoegen via een menu op het apparaat.
- Vrij zoeken op plaatsnaam of GPS.
- Een mobiele configuratie-app.
- Lange-drukfuncties.
- Wijzigingen aan het dashboardontwerp.
- Een eigen forecastbackend.

## Technisch ontwerp

### U1. Spotcatalogus

Voeg `wind_spots.h` en `wind_spots.c` toe. Een `wind_spot_t` bevat minimaal `id`, `display_name`, `latitude`, `longitude` en `timezone`.

De compile-time macros `WIND_SPOT_ID`, `WIND_SPOT_NAME`, `WIND_LATITUDE` en `WIND_LONGITUDE` zijn daarna niet meer de bron van waarheid. Edam blijft de standaard als nog geen keuze is opgeslagen.

### U2. Geselecteerde spot

Voeg een kleine selection-module toe die de stabiele spot-ID in NVS bewaart. Bij een onbekende of verwijderde ID valt de firmware veilig terug op Edam.

De nieuwe selectie wordt pas opgeslagen nadat forecast en schermupdate succesvol zijn afgerond. Daardoor blijft de opgeslagen toestand gelijk aan wat fysiek op het scherm staat.

### U3. Cache per spot

Forecastcache krijgt een eigen sleutel of bestand per spot-ID. De cachecontrole valideert altijd dat spot-ID, coordinaten en model bij elkaar horen.

De panel-hash blijft globaal, omdat er maar een fysiek scherm is. De inhoud van de gekozen spot zit al in die hash.

### U4. Navigatieflow

Voeg in `wind_app` een expliciete operatie toe voor spotselectie. Die operatie:

1. Blokkeert nieuwe knopacties zolang de huidige actie loopt.
2. Berekent vorige of volgende index met wraparound.
3. Probeert eerst de cache van de doelspot.
4. Haalt alleen data op als dat nodig is.
5. Rendert en toont het doel-dashboard.
6. Slaat de selectie op na een geslaagde paneelupdate.

### U5. Knoppen en deep sleep

Pas `button_task` aan zodat `GPIO 5` en `GPIO 4` op loslaten eenmaal navigeren. De bestaande debounce en korte-drukdetectie blijven behouden.

Pas de deep-sleep wakeflow aan zodat beide knoppen eerst de huidige selectie laden en daarna respectievelijk vorige of volgende kiezen. Het speciale pad dat bij de rechter knop het scherm wist, wordt verwijderd.

### U6. Geplande updates

Op de bestaande tijden `00:05`, `07:00`, `11:00`, `15:00` en `19:00` worden alle spots bijgewerkt. Alleen de actieve spot wordt op het paneel gerenderd.

Voor drie spots betekent een eenvoudige sequentiele implementatie maximaal vijftien forecastrequests per apparaat per dag. Spotwisselen vanuit cache voegt daar niets aan toe. De provider blijft achter de bestaande abstractie, zodat later batching of een gedeelde backend mogelijk blijft zonder de UI te herschrijven.

Een gedeeltelijk mislukte update wordt per spot bijgehouden. Een fout bij Brouwersdam mag Edam en Castricum niet ongeldig maken.

## Acceptance criteria

| ID | Criterium |
| --- | --- |
| A1 | Vanaf Edam toont rechts Brouwersdam en daarna Castricum aan Zee. |
| A2 | Nogmaals rechts vanaf Castricum toont Edam. |
| A3 | Links doorloopt exact dezelfde lijst achteruit. |
| A4 | Iedere succesvolle wissel toont de juiste naam, coordinaten, windwaarden en richtingen. |
| A5 | Een cache-hit werkt zonder wifi en zonder forecastrequest. |
| A6 | De laatst getoonde spot keert terug na reset of stroomverlies. |
| A7 | Links en rechts werken ook als het apparaat vanuit deep sleep ontwaakt. |
| A8 | De rechter knop kan het scherm niet meer leegmaken. |
| A9 | Snel of lang indrukken veroorzaakt niet meerdere spotsprongen. |
| A10 | Een mislukte fetch toont cachedata of `UNAVAILABLE`, maar nooit data van een andere spot. |
| A11 | Iedere geplande update ververst onafhankelijk de caches van alle drie spots. |
| A12 | De groene knop, OTA en de bestaande updateschema's blijven werken. |

## Testplan

### Hosttests

- Catalogusvolgorde en unieke spot-ID's.
- Wraparound voor links en rechts.
- Terugval naar Edam bij ontbrekende of onbekende NVS-waarde.
- Gescheiden cache-identiteit per spot.
- Cache-hit zonder providercall.
- Cache-miss met providercall.
- Fetchfout met geldige cache.
- Fetchfout zonder cache.
- Geen persist bij mislukte paneelupdate.
- Een enkele actie per gedebouncete knopdruk.
- Alle spots worden eenmaal per nieuwe schedule-boundary aangeboden voor refresh.
- Een spotfout onderbreekt de overige refreshes niet.

### Apparaattest

- Doorloop alle spots vooruit en achteruit terwijl het apparaat wakker is.
- Herhaal vanuit deep sleep met beide knoppen.
- Trek USB los en bevestig dat wisselen vanuit cache blijft werken.
- Herstart en controleer dat de laatst getoonde spot terugkomt.
- Controleer via logs dat cachewissels wifi niet activeren.
- Controleer visueel dat geen dubbele e-ink-refresh plaatsvindt.

## Uitvoeringsvolgorde

1. Bevestig en documenteer de exacte Brouwersdam- en Castricum-aan-Zee-coordinaten.
2. Bouw spotcatalogus en selectie-opslag.
3. Maak providerconfiguratie en forecastcache runtime- en spotgebonden.
4. Bouw cache-first vorige/volgende navigatie.
5. Herbestem beide knoppen tijdens normaal gebruik.
6. Herbestem beide wakebronnen vanuit deep sleep.
7. Breid geplande updates uit naar alle spots.
8. Voeg hosttests toe.
9. Flash via OTA of USB en voer de apparaatacceptatietest uit.

## Productierisico

Drie spots direct ophalen is voor het huidige apparaat klein en beheersbaar. Bij brede distributie groeit het aantal API-calls echter per verkocht apparaat. Voor een publieke release moet daarom apart worden bevestigd dat de gekozen forecastprovider dit gebruik en het verwachte volume toestaat. De voorgestelde spot- en providergrenzen zorgen ervoor dat later een batchrequest of gedeelde backend kan worden toegevoegd zonder de knopnavigatie of dashboardrendering opnieuw te ontwerpen.
