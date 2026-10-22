# AP Chaos Bridge 0.5.2 · Einrichtung

## Start und Update

1. ZIP vollständig entpacken. Für ein Update die neue Version über den bisherigen Programmordner kopieren und **`data` beibehalten**. Die laufende Bridge vorher unter Einstellungen beenden.
2. [Node.js 22 oder neuer](https://nodejs.org/en/download) installieren. Die npm-Pakete liegen bereits bei.
3. `Start.cmd` öffnen. Oberfläche: **http://127.0.0.1:17381**. Nach einem Update mit Strg+F5 neu laden.
4. Vorbereitete APworld-Versionen einschließlich der sieben Nutzerdateien funktionieren ohne Python, auch in einem eigenen Ordner. Für bisher unbekannte Versionen zusätzlich [Python 3.10 oder neuer](https://www.python.org/downloads/windows/) installieren und bei der Installation zu PATH hinzufügen. Bereits vorhandenes Python wird über `py -3`, `python` oder `python3` erkannt. Anschließend die Bridge neu starten.

## Räume und mehrere Spieler

1. Unter **Räume → Raum anlegen** z. B. „Stardew Charity“ oder „Factorio Run“ anlegen.
2. Oben im Raum-Menü wechseln. Regeln, Zugangsdaten und Protokolle sind pro Raum getrennt.
3. Die echten Zielspieler erscheinen nach dem Verbinden des AP-Raums automatisch unter **Spieler & Effekte**. Dort pro Spieler **Items & Fallen auswählen**, den Slot aktivieren und gewünschte Items erlauben.
4. Optional unter **Namen für YAMLs und Spielerauswahl merken** auf **+ Spieler** klicken. Pro Teilnehmer eine Zeile mit Slotname und optional Spiel ausfüllen und **Spieler speichern** wählen. Diese Namensliste ist nur eine Eingabehilfe für YAMLs und Auswahlfelder.

Slotnamen für die Generierung: eindeutig, maximal 16 Zeichen. Die gespeicherte Namensliste fügt einem laufenden Seed keine Spieler hinzu. Eine Bridge-Anmeldung mit Adminrechten reicht für Items und Hinweise an mehrere Zielspieler im eigenen AP-Team. Eure normalen Spielclients bleiben verbunden.

## APworlds und YAML-Editor

Viele direkt verfügbare APworlds sind bereits enthalten und vorbereitet. Die **[Liste manueller Downloads](APWORLDS-MANUELL.md)** nennt fehlende Dateien und teilweise dynamische Einstellungen. Die Unterordner des APworld-Ordners werden mit eingelesen; YAML-Vorlagen werden dort ignoriert.

1. `.apworld`-Dateien mit Originalnamen in den Ordner **`apworlds`** neben `Start.cmd` kopieren. Alternativ im Spielekatalog über **APworld hinzufügen** mehrere Dateien auswählen.
2. Unter **Spielekatalog → Ordner neu einlesen** aktualisieren. Ein anderer Ordner kann dort eingetragen werden.
3. Spiel suchen und **Einstellungen & YAML** öffnen.
4. Einstellungen setzen und Slotnamen eintragen, ein Name pro Zeile. **Gespeicherte Spielernamen übernehmen** füllt die zum Spiel passenden Profile ein.
5. **Einstellungen speichern** behält die Vorlage in diesem Raum. **YAML-Vorschau** zeigt den Export. **YAMLs herunterladen** erzeugt eine einzelne YAML oder ein ZIP mit einer Datei pro Spieler.
6. Die Dateien anschließend mit der passenden APworld-Version in Archipelago zum Seed generieren. Die Bridge verändert durch den YAML-Export keinen bereits laufenden Seed.

**Donkey Kong 64** und **Spirit Tracks** werden jetzt erkannt. Die zusätzliche `APAPI.apworld` ist eine Hilfsbibliothek ohne eigenes Spiel und wird separat erklärt. **Friday Night Funkin** liegt als eigene World vor, verlangt für unterstützte YAMLs aber den Export aus der **Mixtape Engine**; die Spielseite enthält den Hinweis und die Anleitung.

Die Formularfelder basieren auf den deklarierten APworld-Optionen. Dynamische Angaben werden auf der Spielseite aufgelistet. Für solche Worlds die fehlenden Angaben bei **Erweiterte Zusatzoptionen als YAML** setzen. Diese Zusatzoptionen überschreiben gleichnamige Formularfelder. APworld-Code wird beim Einlesen nicht ausgeführt.

## Core-Spiele direkt verwenden

Die 55 bisher fehlenden Core-Spiele stehen ab 0.5.0 ohne eigene Dateien und ohne Python im Spielekatalog. Nach dem Spiel suchen und **Einstellungen & YAML** öffnen; das Kennzeichen lautet **Core 0.6.8**. Namen und Optionen einstellen und exportieren. Zur Generierung **Archipelago 0.6.8** verwenden. Diese Worlds sind dort bereits enthalten; keine zweite APworld installieren. Core-Spiele bleiben auch bei einem eigenen APworld-Ordner verfügbar.

Die [Liste der 50 weiterhin fehlenden Spiele](https://github.com/BR3TZN/AP-Chaos-Bridge/blob/main/FEHLENDE-SPIELE.md#50-spiele-apworld-manuell-beschaffen) enthält die manuellen Downloadlinks.

## Worlds aus Release-ZIPs: SpongeBob

**Battle for Bikini Bottom 1.2.5** ist ab Bridge 0.4.1 enthalten: im **Spielekatalog** nach **Bikini Bottom** suchen, **Einstellungen & YAML** öffnen und pro Mitspieler einen Slotnamen eintragen. Die 22 vorbereiteten Felder funktionieren ohne Python. Unter anderem sind goldene Pfannenwender, Socken, Fähigkeiten, Tor-Kosten, DeathLink und RingLink einstellbar.

Andere Spiele werden häufig ebenfalls als Release-ZIP mit einer enthaltenen `.apworld` und zusätzlichen Client-Dateien verteilt:

1. Das passende Release des World-Entwicklers herunterladen und das ZIP entpacken.
2. Die originale `.apworld` unter **Spielekatalog → + APworld hinzufügen** hochladen oder in den APworld-Ordner kopieren und **Ordner neu einlesen** wählen. Bis **128 MiB pro APworld** werden unterstützt.
3. Alternativ den **APworld-Ordner** der Bridge auf Archipelagos **`custom_worlds`** setzen, wenn die Worlds dort bereits installiert sind. Bekannte Dateiversionen brauchen kein Python; bisher unbekannte Versionen benötigen Python ab 3.10 für die statische Analyse.
4. Das eingelesene Spiel öffnen und die Spieler-YAMLs exportieren. Reine Quellcode-Repositories benötigen zunächst eine passende APworld-Datei.

Für das eigentliche Spielen bleiben die Installationsschritte des World-Entwicklers nötig: die passende APworld in Archipelagos `custom_worlds`, gegebenenfalls die mitgelieferten Bibliotheken in Archipelagos `lib`. Die Bridge liest nur Einstellungen; sie installiert keinen Spielclient.

Das hier unterstützte SpongeBob nutzt die ursprüngliche **US-Fassung für GameCube mit Dolphin**. World 1.2.5 verlangt **Archipelago ab 0.6.7**; das angebotene Windows-Paket ist für Archipelagos **Python 3.13** gebaut. Dessen Python-Version ist von einem gegebenenfalls separat für die Bridge installierten Python zu unterscheiden. Anschließend die erzeugten YAMLs in Archipelagos `Players` legen und den Seed generieren.

Quellen: [BfBB 1.2.5](https://github.com/Cyb3RGER/bfbb_ap_world/releases/tag/v1.2.5), [Installationsanleitung](https://github.com/Cyb3RGER/bfbb_ap_world/blob/v1.2.5/docs/setup_en.md), [World-Manifest](https://github.com/Cyb3RGER/bfbb_ap_world/blob/v1.2.5/archipelago.json). Standard-YAML und geänderte Optionen wurden mit dem echten Archipelago 0.6.7 akzeptiert; Ergebnis: `assets/bfbb-validation.json`.

## Archipelago-Raum verbinden

Unter **Verbindungen → Archipelago-Raum**:

| Hosting | Eingabe |
| --- | --- |
| Lokal · dieser PC | Raumport; Host ist automatisch `127.0.0.1` |
| Extern · archipelago.gg | Raumport; Host ist automatisch `archipelago.gg` |
| Extern · eigener Host / IP | Hostname oder IP und Raumport |

Dann einen **bereits existierenden Slotnamen** wählen. Raumpasswort eintragen, falls gesetzt. Das **Server-Adminpasswort** ist separat und wird für zusätzliche Items benötigt. Der Host muss dafür `server_password` setzen. **Raum verbinden** klicken.

„AP verbunden“ und „Admin angemeldet“ sind getrennte Statusanzeigen. Passwörter bleiben maskiert im Formular und werden lokal gemerkt. Die Bridge meldet sich als zusätzlicher TextOnly-Client an; eure Spielclients bleiben weiterhin geöffnet. Ein solcher Bridge-Client kann mehrere freigegebene Zielslots im eigenen Team bedienen.

## Twitch verbinden

1. [Twitch Developer Console](https://dev.twitch.tv/console/apps) öffnen und eine Anwendung registrieren.
2. OAuth Redirect URL exakt **`http://localhost:17381/oauth/callback`** eintragen. Anwendungstyp **Confidential**. Bei einem anderen Bridge-Port die Redirect-URL entsprechend ändern.
3. Unter **Verbindungen → Twitch EventSub** die **Client-ID** eintragen.
4. Für automatische Token-Erneuerung in Twitch ein **Client Secret** erstellen und zusätzlich eintragen. Ohne Secret funktioniert die Anmeldung ebenfalls; nach Ablauf des gespeicherten Tokens ist eine erneute Anmeldung nötig.
5. Gewünschte Ereignisse auswählen. Die Broadcaster-ID kann leer bleiben; sie wird aus dem Token erkannt.
6. **Mit Twitch anmelden** klicken und mit dem Twitch-Kanal anmelden, dessen Ereignisse die Bridge auslösen sollen. Berechtigungen bestätigen.
7. Die Rückleitung meldet die übernommene Anmeldung. Das Anmeldefenster schließen; in der Bridge steht bei Twitch **Verbunden**. Fehlende Berechtigungen erscheinen direkt unter dem Status.

| Ereignisse | Twitch-Berechtigung |
| --- | --- |
| Subs, Resubs, Gift Subs | `channel:read:subscriptions` |
| Bits | `bits:read` |
| Kanalpunkte | `channel:read:redemptions` |

Die in 0.1.1 blockierte Rückleitung von Twitch ist behoben. Zugangsdaten werden lokal gespeichert; mit Client Secret wird ein Refresh Token für die Erneuerung genutzt. Nach Widerruf einer Anmeldung ist erneut zu autorisieren.

## Charity Royale

1. Unter **Verbindungen → Charity Royale** nur deinen Slug, z. B. **`br3tzn`**, eintragen; keine vollständige JSON-Adresse.
2. Projekt **`charityroyale2026`**. **Spenden verbinden** klicken.
3. In der Regel die genaue Aktion des Spendenbuttons eintragen. Ein Test mit `metadata.action: trap` braucht `trap`, nicht `random-trap`.
4. Der Netto-Betrag wird in Cent ausgewertet: `amount_net: 1000` entspricht 10 Euro.
5. Offizielle Testspenden bzw. `id: null` werden als Simulation verarbeitet. Die Bridge filtert nach dem Streamer-Slug; eine noch fehlende öffentliche JSON-Seite verhindert solche Testereignisse nicht.

## Regeln und mehrere Ziele

1. Unter **Spieler & Effekte → Items & Fallen auswählen** den gewünschten Slot aktivieren. **Erlaubt** nimmt ein Item in den erlaubten Pool auf; **Falle** markiert es zusätzlich für Fallenaktionen. Die Bridge kann nicht alle schädlichen Items automatisch erkennen.
2. Unter **Regeln → + Neue Regel** zuerst Quelle, Ereignisart und Schwellen festlegen. Exakte Aktionscodes und Twitch-Reward-IDs stehen unter den erweiterten Filtern.
3. Die Aktion wählen:

| Aktion | Verhalten |
| --- | --- |
| Zufällige Falle | Aus erlaubten und als Falle markierten Items |
| Zufälliges Item ohne markierte Fallen | Aus erlaubten Items ohne eure Fallenmarkierung |
| Zufälliges Item aus allen erlaubten | Erlaubte Items einschließlich Fallen |
| Zufälliges Item aus eigener Liste | Eigene exakte Itemnamen, begrenzt durch Freigaben und Raumkatalog |
| Bestimmtes Item senden | Exaktes erlaubtes Item |
| Hinweis zu einem Item | Kostenloser Admin-Hinweis an das AP-Team des Zielspielers |
| Nachricht im AP-Chat | Eine Raumchatnachricht mit Präfix `[AP Chaos]`; keine Adminrechte nötig |
| Nur Stream-Alert | Nur Anzeige; funktioniert auch ohne AP-Verbindung |
| DeathLink an die Gruppe | Eigenes teilnehmendes AP-Team; Gruppenfreigabe nötig |
| Zufall aus gewählten Aktionen | Eine mögliche gewählte Aktionsart zufällig auswählen und ausführen |

4. **Nur Spieler dieses Spiels** kommt aus den verbundenen AP-Slots und filtert deren Spielzuordnung. Es liest keine YAMLs. Bei Item- und Hinweisaktionen die gewünschten Empfänger wählen; die Vorschau zeigt passende freigegebene Spieler. **Zufällig aus ausgewählten Spielern** trifft genau eine geeignete Person aus eurer Auswahl.
5. Beim Zufallsmix die erlaubten Aktionsarten ankreuzen. Jede aktuell mögliche ausgewählte Art hat dieselbe Chance; leere Pools und gesperrte Aktionen werden ausgelassen. Chat, Alert und DeathLink werden je einmal ausgeführt und durch die Item-Zielliste nicht auf einzelne Spieler begrenzt.
6. Für DeathLink sowohl die Option im Spielclient als auch **DeathLink-Gruppenaktionen für diese Sitzung erlauben** unter **Spieler & Effekte → Optional: DeathLink für die Gruppe** aktivieren.
7. **Regel speichern** und zunächst **Simulieren** wählen. Für echte Spielaktionen den AP-Raum verbinden, Live-Modus wählen, Ausführung starten und die aktive Regel mit **Live-Test** prüfen.

Unter **Protokoll** stehen Eingänge, Aufträge und Systemprotokoll. „AP bestätigt“ bestätigt den Itemversand am Server; die tatsächliche Wirkung im Spiel wird hier nicht quittiert. Der Alert-Test löst keine Spielaktion aus. Nachrichten können `{user}` und `{rule}` verwenden.

## Stream-Alerts und OBS

OBS ist für die Spielaktionen nicht erforderlich. Es zeigt die Animation im Stream.

1. Unter **Stream-Alerts** **Alert testen** wählen. Die integrierte Vorschau zeigt nur eine Animation, keinen Spieleffekt.
2. Optional GIF, PNG/APNG, WebP, WebM oder MP4 bis 10 MiB über **Animation hochladen** auswählen. Videos werden stumm abgespielt.
3. Position, Größe, Dauer und Anzeige wählen; **Alert-Einstellungen speichern**. Die Einstellungen gelten für diesen Raum.
4. In OBS eine Browserquelle mit **http://127.0.0.1:17381/overlay**, Größe **1920 × 1080**, hinzufügen. OBS muss die lokale Bridge auf diesem PC erreichen können.

Mehrere Alerts laufen nacheinander. Simulationen lassen sich ausblenden; der ausdrückliche Vorschautest bleibt möglich. Alte Protokolle werden beim Öffnen nicht erneut angezeigt.

## Design anpassen

Unter **Design** neutralen Darkmode, Lightmode oder **Klassisch** wählen. Eine Farbvorgabe oder eigene HEX-Farbe einstellen und **Design speichern**. Klassisch färbt auch die Flächen; das ursprüngliche Grün steht als Schaltfläche bereit. Design und Akzent gelten für alle Räume, Alert-Einstellungen jeweils nur für den geöffneten Raum. Animationen können reduziert werden.

## Gespeicherte Verbindungen

Zuletzt aktiv verbundene Quellen werden beim Neustart oder Öffnen des Raums wieder verbunden. Ausführung und Live-Modus starten dabei pausiert im Testmodus. **Trennen** beendet die automatische Wiederverbindung für diese Quelle. **Gespeicherte … vergessen** entfernt deren lokale Zugangsdaten.

Zur Sicherung die geschlossene Bridge und ihren gesamten **`data`-Ordner** kopieren. Der Ordner enthält auch die verschlüsselten Zugangsdaten und den zugehörigen lokalen Schlüssel. Der Konfigurationsexport enthält keine Passwörter oder Twitch-Tokens.

## Quellen

- [Make-A-Wish / Charity Royale API](https://streamer.make-a-wish.at/api)
- [Archipelago-Kommandos](https://archipelago.gg/tutorial/Archipelago/commands_en)
- [Archipelago YAML-Optionen](https://archipelago.gg/tutorial/Archipelago/advanced_settings_en)
- [Twitch OAuth](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/)
- [Twitch Token-Erneuerung](https://dev.twitch.tv/docs/authentication/refresh-tokens/)
- [Twitch EventSub-WebSockets](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/)

## Räume archivieren oder löschen

Unter **Räume** archivieren, nach **Archiviert** filtern und bei Bedarf **Wiederherstellen** wählen. Regeln, Protokolle und Zugangsdaten bleiben beim Archivieren erhalten. **Löschen** verlangt den exakten Raumnamen und entfernt die lokalen Daten dieses Raums endgültig. Der Spielekatalog bleibt erhalten. Beim Archivieren oder Löschen des geöffneten Raums wechselt die Bridge in einen anderen Raum.

## Gezielt oder zufällig einen Spieler treffen

1. AP-Raum verbinden. Die Zielspieler erscheinen automatisch unter **Spieler & Effekte**; die zusätzliche gespeicherte Namensliste ist optional.
2. Für die tatsächlichen AP-Slots unter **Items & Fallen auswählen** die gewünschten Items oder Fallen erlauben.
3. In der Regel als **Ziel** einen bestimmten Spieler, **Alle freigegebenen Spieler**, **Zufälliger freigegebener Spieler**, **Mehrere ausgewählte Spieler** oder **Zufällig aus ausgewählten Spielern** wählen. Bei den letzten beiden Modi die Teilnehmer markieren; **Gespeicherte Spieler auswählen** übernimmt eure Liste.
4. Die Regel zuerst simulieren. Zufall aus der Auswahl trifft pro Auslösung genau eine geeignete Person; mehrere oder alle erzeugt Aktionen pro geeignetem Spieler.

Die Spielerliste erzeugt keine zusätzlichen Serververbindungen: Eine Bridge-Verbindung zu eurem AP-Raum reicht aus. DeathLink bleibt eine Gruppenaktion des AP-Teams.

## Programmupdates

1. **Einstellungen → Programmupdates → Nach Updates suchen** öffnen.
2. Das Repository ist öffentlich; **kein GitHub-Token nötig**. Ein früher gespeicherter ungültiger Token kann unter **Zugang entfernen** gelöscht werden.
3. **Update herunterladen** wählen und die Prüfung abwarten.
4. **Installieren & neu starten** wählen. Räume, Regeln und Zugangsdaten bleiben erhalten; die Bridge startet im Testmodus und pausiert.
5. Bei einem Fehler wird die vorherige Version wiederhergestellt. Protokolle: `data/updates/install.log` und `restart.log`; Sicherungen: `data/updates/backups/`. Falls die Oberfläche nicht zurückkommt, `Start.cmd` öffnen.

Die erste Installation der Updatefunktion erfolgt manuell mit dem vollständigen Release-ZIP. `data` dabei beibehalten.

## Spieler-YAMLs verwenden

Der Katalog zeigt nur eingelesene APworlds. Nach diesem Update alte Platin-YAMLs erneut exportieren. Die angezeigte World-Version und Mindestversion von Archipelago beachten. Die passende `.apworld` in Archipelagos `custom_worlds` installieren, Spieler-YAMLs in `Players` legen und daraus den Seed generieren. Die YAML ist eine Konfigurationsdatei für den Generator.
