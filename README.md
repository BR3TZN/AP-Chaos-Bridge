# AP Chaos Bridge 0.7.6

Lokales Tool für Zuschaueraktionen in Archipelago-Multiworlds. Charity-Royale-Spenden, Twitch-Ereignisse und externe Trigger laufen durch dieselbe Regel-Engine und können zusätzliche AP-Items, Hinweise, Chatnachrichten, Stream-Alerts oder DeathLink auslösen.

**Windows starten:** Das vollständige Release-ZIP in einen beschreibbaren Ordner entpacken und einmal **`Start.cmd`** öffnen. Die Bridge startet als **eigenes Programmfenster** und legt **`AP-Chaos-Bridge.exe`** im Hauptordner an. Danach direkt diese EXE starten. Die portable Node-Laufzeit liegt bei; eine Node-Installation ist im Windows-Vollpaket nicht nötig.

**Schließen und Minimieren** legen die Bridge in den **Infobereich (Tray)**. Doppelklick auf das Tray-Symbol öffnet sie wieder; **Rechtsklick → Beenden** schließt Fenster und Hintergrunddienst. Es bleibt kein Node-Konsolenfenster offen. Falls die Microsoft WebView2 Runtime fehlt, bietet die Bridge die offizielle Downloadseite an. Die Twitch-Freigabe öffnet sich im Standardbrowser und übernimmt die Verbindung danach ins Programmfenster.

Für macOS/Linux oder zum direkten Start:

```sh
node server.mjs
```

Das native Fenster wird beim Release unter Windows aus `scripts/windows/Bridge.cs` gebaut; `powershell -File scripts/windows/build.ps1` erstellt es auch lokal. Die Laufzeitquellen und SHA256-Werte stehen in `scripts/windows/runtime-sources.json`. Quellcodekopien ohne gebaute EXE und macOS/Linux verwenden weiterhin die lokale Browseroberfläche.

Bei einer reinen Quellcode-Kopie ohne `node_modules` zuerst `npm ci --ignore-scripts` ausführen. Für einen anderen lokalen Port die Umgebungsvariable `AP_BRIDGE_PORT` setzen; dann auch die Twitch-Redirect-URL und externe Integrationen anpassen.

## Update auf 0.7.6

Ab Version 0.3.1 unter **Einstellungen → Programmupdates** prüfen, herunterladen und **Installieren & neu starten** wählen. Das Repository ist öffentlich; ein GitHub-Token ist nicht erforderlich. Für ältere Versionen: Bridge beenden, neue Dateien über den bisherigen Programmordner kopieren und **`data` beibehalten**. Anschließend `Start.cmd` öffnen. Das Update-Paket enthält keine persönlichen Daten.

**Neu in 0.7.6:** Unter **Einstellungen → Sprache der Spieleinstellungen** zwischen **Deutsch** (Standard) und **English · Originaltexte** wählen. Überschriften und Beschreibungen im YAML-Editor werden lokal übersetzt, auch für neu importierte Dateien. **Originaltext anzeigen** klappt die Quelle auf. Die erzeugten YAMLs und Optionswerte bleiben unverändert. Das vollständige Paket enthält das Modell; Quellcodekopien benötigen einmal `node scripts/prepare_translation_model.mjs` nach `npm ci --ignore-scripts`.

**Seit 0.7.5:** Regeln direkt per Schalter auf ihren Karten aktivieren oder deaktivieren. Der Wechsel auf Live startet aktive Regeln unmittelbar. DeathLink ist in der Bridge standardmäßig freigegeben und bleibt pro Raum umschaltbar. YAMLs, ZIPs und JSON-Exporte landen im eigenen Windows-Fenster ohne Dialog oder Downloadverlauf im Downloads-Ordner; gleiche Dateinamen erhalten einen Zähler. Unveränderte Statusabfragen verursachen keine Änderungen am Seiteninhalt. Twitch steht vor Charity Royale.

Zusätzlich: Kanalpunkte-Belohnungen direkt unter **Verbindungen → Kanalpunkte-Belohnungen** oder aus einer offenen Regel anlegen. Twitch dafür einmal über **Belohnungen freigeben** mit den zusätzlichen Rechten anmelden. **Alle Abos** fasst neue Abos, geteilte Resubs und Geschenkpakete in einer Regel zusammen. Regeln lassen sich als JSON exportieren, als gemeinsame Vorlage speichern und aus anderen Räumen übernehmen. **Zufälliger Hinweis aus allen erlaubten Items** fordert pro getroffenem Spieler einen AP-Admin-Hinweis an. Der Tray-Fix aus 0.7.1 ist enthalten.

**Seit 0.7.1:** Wiederöffnen aus dem Tray korrigiert. Das Fenster bleibt mit seiner Oberfläche verbunden und wird auf einem sichtbaren Bildschirm geöffnet.

**Seit 0.7.0:** Windows-Fenster, Tray und portable Laufzeit; mehrere getrennt angemeldete Twitch-Kanäle mit Kanalfilter und Herkunft im Protokoll; verständliche Felder je Ereignistyp; leere Regeln in neuen Räumen. Datenaktualisierungen erhalten Dropdowns, offene Dialoge, Listen, Suchfilter und ungespeicherte Eingaben. Kontextabhängige Felder wechseln mit kurzen Animationen, die sich unter Design abschalten lassen.

**Seit 0.6.2:** Dokumentierte Listenwerte lassen sich in einer aufklappbaren Mehrfachauswahl einzeln anklicken, einschließlich der sieben Fallen aus der Peliarch-YAML. Beschreibungen stehen direkt bei den Werten; eigene Werte bleiben möglich. Freie Felder zeigen Eingabeformat, Vorlagenwert und vorhandene Schlüssel- oder Wertelisten. Unbekannte Grenzen werden nicht erfunden.

**Seit 0.6.0/0.6.1:** Eigene `.yaml`- und `.yml`-Spielerdateien direkt im Spielekatalog importieren, ohne Python und ohne eine in der Bridge lesbare APworld. Alle enthaltenen Spieleinstellungen werden bearbeitbar, klare Auswahl- und Zahlenbereichskommentare liefern Dropdowns. Die mitgelieferte Peliarch-Beispiel-YAML enthält 91 Felder. Mehrere Vorlagen und eine APworld desselben Spielnamens bleiben getrennte Quellen; eigene Werte und Slotnamen werden pro Quelle und Raum gespeichert. Unterschiedliche Spiel-IDs wie `EldenRing` und `Elden Ring` bleiben als eigene Katalogeinträge sichtbar.

**Neu in 0.5.3:** 33 weitere Spiele aus den neuen Uploads, mit vorbereiteten Formularen und Mehrspieler-YAMLs ohne Python. Grandia (43 MiB) und Metroid: Samus Returns (32 MiB) liegen dem vollständigen Paket bereits unverändert bei. Made in Abyss ist als APworld gepackt; Crash 3, LEGO Harry Potter 5–7 und Codename: Kids Next Door wurden ergänzt. Ältere Optionswörterbücher, Trap-Gewichtungen, DeathLink-Mixins und entfernte Optionen werden korrekt gelesen. Der Katalog umfasst jetzt 848 Spiele.

Neu in 0.5.0: **55 Core-Spiele mit 1.978 echten Optionsfeldern**, vorbereitet für **Archipelago 0.6.8**, zusätzlich zum APworld-Katalog. Donkey Kong 64 und Spirit Tracks werden jetzt erkannt. FNF zeigt die vollständigen deklarierten Felder und den erforderlichen Mixtape-Engine-Ablauf. Die [aktualisierte Liste noch fehlender Spiele](https://github.com/BR3TZN/AP-Chaos-Bridge/blob/main/FEHLENDE-SPIELE.md#noch-fehlende-apworlds) enthält die verbleibenden Downloads.

Seit 0.4.0: klarere Menüs und geführte Regeln mit **Auslöser → Aktion → Empfänger**, zehn benannten Aktionsarten, neutralem Darkmode, Lightmode und einem farbigen klassischen Design. Die Akzentfarbe lässt sich frei wählen. **Stream-Alerts** unterstützen eigene GIFs, animierte Bilder und Videos. Anmeldung und Verbindungsaufbau bleiben unverändert.

Tatsächliche Spieler kommen automatisch aus eurem verbundenen AP-Raum. Unter **Spieler & Effekte** legt ihr deren erlaubte Items und Fallen fest. Die zusätzliche gespeicherte Namensliste ist optional. Bekannte Pakete ohne statisch lesbare World-Deklaration werden beim Einlesen separat als übersprungen gemeldet; dafür erscheint kein irreführender Python-Hinweis mehr.

Weiterhin enthalten: vorbereitete APworld-Einstellungen ohne Python für bekannte Dateiversionen, YAML-Export für mehrere Spieler, archivierte oder löschbare Räume und Programmupdates. Der Spielekatalog liest APworlds und vorbereitete Core-Worlds. Fehlende Downloads und Grenzen stehen in **[APWORLDS-MANUELL.md](APWORLDS-MANUELL.md)**. Bestehende Regeln und Räume bleiben erhalten.

Kurze Anleitung inklusive Twitch-Setup: **[ANLEITUNG.md](ANLEITUNG.md)**.

## Programmupdates

Unter **Einstellungen → Programmupdates** nach stabilen GitHub-Releases suchen. Die Bridge prüft beim normalen Start und alle zwölf Stunden automatisch. **Update herunterladen** lädt das vollständige ZIP und prüft SHA-256 sowie sämtliche Dateien. **Installieren & neu starten** pausiert die Ausführung, sichert Programmdateien und Daten und startet die neue Version im Testmodus. Bei Installations- oder Startfehlern wird die vorherige Version einschließlich ihrer Daten wiederhergestellt. Räume, Verbindungen und eigene APworlds bleiben erhalten. Sicherungen und Protokolle liegen unter `data/updates/`.

Das Repository `BR3TZN/AP-Chaos-Bridge` ist öffentlich; Updates benötigen **keinen Token**. Nur bei einer privaten Kopie unter **GitHub-Zugang für private Repositories** einen [Fine-grained Token](https://github.com/settings/personal-access-tokens/new) für `BR3TZN/AP-Chaos-Bridge` mit **Contents: Read-only** speichern. Der GitHub-Login im Browser wird nicht an den lokalen Updater übergeben. Für öffentliche Repositories ist kein Token erforderlich. Tokens bleiben lokal verschlüsselt und werden nicht exportiert.

Auf älteren Versionen die Updatefunktion einmal mit dem vollständigen neuen ZIP manuell einspielen und `data` beibehalten. GitHubs automatische „Source code“-Downloads enthalten keine Laufzeitpakete und sind keine Updatepakete.

Für einen Entwickler-Checkout vor `npm test` einmal `python scripts/prepare_large_apworlds.py` ausführen. Große Originaldateien wie BfBB, Grandia und Samus Returns werden dabei anhand festgelegter Release- und Datei-Prüfsummen vorbereitet. CI und vollständiger Paketbau führen diesen Schritt automatisch aus. Das fertige Programm benötigt dafür kein Python.

Neue Releases erstellt `.github/workflows/release.yml`: eine neue Versionsnummer in `package.json` nach `main` pushen. Der Workflow testet unter Windows und Linux, prüft die World-YAMLs mit PyYAML, baut die Pakete und veröffentlicht erst danach. Veröffentlichte Versionen werden nicht überschrieben.

## YAML-Kompatibilität

Der Katalog zeigt Spiele aus eingelesenen APworlds, den vorbereiteten offiziellen Core-Worlds und ausdrücklich importierten Spieler-YAMLs. Die Referenzliste bleibt als Downloadnachweis und manuelle Ergänzungsliste verfügbar.

Der Export verwendet YAML 1.1, passend zu Archipelagos Leser. Werte wie `no`, `on` und `off` werden als Text erhalten; exponentielle Zahlen werden ausdrücklich als Zahlen ausgegeben. Die Platin-YAML aus einer älteren Bridge-Version neu erzeugen. Das APworld-Manifest liefert World-Version und erforderliche Archipelago-Version. Die passende APworld muss zusätzlich im Generator installiert sein. YAMLs in Archipelagos `Players`-Ordner legen und daraus den Seed generieren.

Prüfumfang und Grenzen: **[VALIDIERUNG.md](VALIDIERUNG.md)**.


## In drei Minuten den Ablauf prüfen

1. Auf **Übersicht → Demo öffnen** klicken. Die drei Beispielslots haben keine Verbindung zu echten Spielen.
2. Bei der mitgelieferten Regel auf **Simulieren** klicken. Das funktioniert auch bei einer inaktiven Regel.
3. Unter **Protokoll** den Auftrag mit Status **Simuliert** prüfen. In der Demo werden keine AP-Pakete gesendet.

Der Testmodus ist ein Ablauf-Test. Er bestätigt weder einen laufenden Spielclient noch einen sichtbaren Effekt im Spiel.

## Mit eurem echten Raum arbeiten

1. Seed normal aus den Spieler-YAMLs generieren und den AP-Raum starten. Jeder Teilnehmer verbindet zusätzlich seinen üblichen Spielclient.
2. Unter **Verbindungen → Archipelago-Raum** zwischen lokalem Server, archipelago.gg und eigener externer Adresse wählen. Port und einen existierenden Slotnamen aus diesem Raum eintragen. Die Bridge darf denselben Slot parallel als Text-Client verwenden. Sie empfängt keine `ReceivedItems` und prüft keine Spielorte ab.
3. Raumpasswort nur eintragen, wenn gesetzt. **Server-Adminpasswort ist eine andere Einstellung**: Der Host benötigt ein gesetztes `server_password`, damit die Bridge `!admin login …` und anschließend `!admin /send …` verwenden kann. Falls nötig, legt der Host dieses in seiner Serverkonfiguration oder über seine Serverkonsole mit `/option server_password <eigenes Passwort>` fest. Ohne Host-Zugriff ist zusätzlicher Itemversand über diese Bridge nicht möglich.
4. Bei normalen AP-Adressen `ws://host:port` verwenden. Ein eingefügter Host ohne Schema wird wie im AP-Client als `ws://` behandelt, ohne Port mit Standardport 38281. Für einen Server mit TLS explizit `wss://host:port` angeben; es gibt keinen automatischen Wechsel auf unverschlüsselte Übertragung. `archipelago://` wird ebenfalls erkannt. Zugangsdaten separat eintragen, nicht in die URL.
5. Unter **Spieler & Effekte → Items & Fallen auswählen** passende Items aus dem geladenen Raumkatalog auswählen. **Erlaubt** gestattet gezielten Versand und gemischte Zufallsitems; **Falle** nimmt das Item zusätzlich in den Pool für „Zufällige Falle“ auf. Der Slot muss ebenfalls freigegeben sein. „Alle Katalogitems für Zufallsaktionen erlauben“ nimmt auch hilfreiche Items auf. Ein Vorschlag ist noch kein bestätigter Spieleffekt.
6. Regeln zuerst simulieren. Dann den **Live-Modus** wählen. Der Wechsel startet die Verarbeitung aktiver Regeln unmittelbar. Eine aktive Regel über **Live-Test** einmal auslösen, den Effekt beim betroffenen Spieler prüfen. Die Aktion kann den Spielstand tatsächlich beeinflussen.
7. Erst für die erfolgreich geprüften Effekte eine echte Ereignisquelle verbinden und passende Regeln aktivieren.

Itemaktionen richten sich an freigegebene Spieler im **eigenen AP-Team**. Item-Link-Gruppen werden nicht als direkte Ziele angeboten. Mehrere Spieler innerhalb eines einzelnen Spielslots können trotzdem gemeinsam betroffen sein. Die Bridge weiß nicht zuverlässig, ob der Spielclient eines Slots online ist: AP kann zusätzliche Items für später aufbewahren.

Optional kann eine erwartete Seed-ID eingetragen werden. Bei Abweichung stoppt der Handshake vor der Anmeldung. Wartende Aufträge sind unabhängig davon immer an Serveradresse und Seed gebunden und werden in einem anderen Raum nicht ausgeführt.

## Charity Royale

**Verbindungen → Charity Royale:** exakten Streamer-Slug deiner Spendenseite und Projekt `charityroyale2026` eintragen. Dann **Spenden verbinden**.

Die Bridge verwendet den dokumentierten öffentlichen Reverb/Pusher-WebSocket mit Kanal `donations`. Sie benötigt keinen öffentlich erreichbaren lokalen Webhook. Nur abgeschlossene Spenden für den konfigurierten Streamer werden normalisiert. Falls ein Ereignis ein Projektfeld enthält, wird es ebenfalls geprüft; laut API enthält nicht jedes Spendenereignis dieses Feld.

Die vorbereitete Regel erwartet:

| Feld | Wert |
| --- | --- |
| Quelle | Charity Royale |
| Ereignis | Spende |
| Exakte Aktion | `random-trap` |
| Minimum | 10,00 EUR netto |
| Effekt | Zufällige Falle |
| Ziel | Zufälliger freigegebener Slot mit freigegebenem Fallenpool |
| Regel-Cooldown | 20 Sekunden |

Die Regel ist anfangs inaktiv. Der Spendenbutton im Charity-Dashboard muss **denselben Aktionscode** liefern; die Bridge legt dort selbst keine Buttons oder Preise an. Das API-Feld `amount_net` wird in Cent ausgewertet. Gebühren im Bruttobetrag erhöhen nicht die Schwelle. Unterschiedliche Buttons können unterschiedliche Regeln bekommen.

Offizielle `DonationCompletedTest`-Ereignisse und Ereignisse mit `id: null` bleiben auch im Live-Modus Simulationen. Doppelte echte Spenden-IDs werden nicht ein zweites Mal eingeplant. Die öffentlichen Echtzeit-Ereignisse bieten hier kein automatisches Nachholen verlorener Spenden während einer Offline-Lücke. Die Anwendung protokolliert Verbindungsabbrüche; eventrelevante Lücken im Charity-Dashboard abgleichen.

## Twitch

Die direkte Anbindung unterstützt neue Subs, Resub-Nachrichten, Gift-Sub-Pakete, Bits und benutzerdefinierte Kanalpunkte-Einlösungen.

1. In der [Twitch Developer Console](https://dev.twitch.tv/console/apps) eine eigene App vom Typ **Confidential** mit OAuth-Redirect **`http://localhost:17381/oauth/callback`** registrieren.
2. Client-ID in der Bridge eintragen, gewünschte Ereignisse wählen und **Mit Twitch anmelden** anklicken. Als Broadcaster anmelden. Optional ein Client Secret eintragen, um den Authorization-Code-Flow mit automatischer Token-Erneuerung zu verwenden. Ohne Secret wird der Implicit-Flow genutzt.
3. Alternativ einen vorhandenen **User Access Token des Broadcasters** verwenden. Ein App Access Token genügt für EventSub-WebSockets nicht.
4. Regeln mit Quelle **Twitch** und passender Ereignisart anlegen. Bei Subs/Bit-Events ist die Euro-Schwelle normalerweise 0; mit **Einheiten** werden Subs oder Bits verglichen. Kanalpunkte lassen sich nach exakter Reward-ID filtern.

| Ereignis | Berechtigung |
| --- | --- |
| Subs, Resub-Nachrichten, Gift Subs | `channel:read:subscriptions` |
| Bits | `bits:read` |
| Kanalpunkte | `channel:read:redemptions` |

Es gibt feste Mengen **pro Ereignis**, nicht automatisch einen Effekt je Bit, Euro oder Geschenk. Ein Gift-Paket mit 10 Subs ist ein Ereignis mit `units: 10`; zugehörige einzelne Gift-Sub-Ereignisse werden ignoriert. Eine Resub-Nachricht ist ein Chat-Ereignis und kein allgemeiner Beleg für jede automatische Verlängerung.

Das Token wird beim Verbinden und anschließend stündlich validiert. Verbindungen werden für den geöffneten Raum lokal gespeichert. Mit Client Secret werden Authorization-Code-Flow und Refresh Token verwendet; ein abgelaufenes Access Token wird automatisch erneuert. Ohne Secret wird der gespeicherte Access Token bis zu seinem Ablauf wiederverwendet. Nach Widerruf oder ungültigem Refresh Token erneut anmelden. Abgelehnte Teilabonnements erscheinen unter Verbindungen. Während einer unerwarteten Verbindungslücke nach Twitch verlorene Ereignisse werden nicht automatisch nachgeliefert.

## Weitere Trigger und OBS

Für Streamer.bot oder andere lokale Anwendungen gibt es einen Bearer-geschützten HTTP-Eingang. PowerShell-Helfer, C#-Beispiel und Feldzuordnung: **[integrations/README.md](integrations/README.md)**. Regeln verwenden dafür die Quelle **Externer Trigger**. Native Twitch-Ereignisse nicht gleichzeitig nochmals über Streamer.bot einspeisen.

Unter **Stream-Alerts** Darstellung, Position, Dauer und eigene Animation wählen. Unterstützt werden GIF, PNG/APNG, WebP, WebM und MP4 bis 10 MiB; Videos laufen stumm. **Alert testen** erzeugt nur eine visuelle Vorschau, keinen Regeltest und keine Spielaktion. Die Vorschau funktioniert auch bei ausgeschalteten normalen Alerts. Die Einstellungen gelten für den geöffneten Raum.

OBS ist optional und zeigt nur die Animation im Stream. Als Browserquelle **http://127.0.0.1:17381/overlay**, Größe 1920 × 1080, eintragen. Die Quelle ist transparent, arbeitet mehrere Alerts nacheinander ab und kennzeichnet Simulationen mit **TEST**. Alte Aufträge werden beim Öffnen nicht erneut abgespielt. OBS muss die Bridge auf diesem PC erreichen können; die Anwendung ist an Loopback gebunden. „Nur Stream-Alert“ kann auch ohne AP-Verbindung verwendet werden.

## Design

Unter **Design** zwischen neutralem **Darkmode**, **Lightmode** und **Klassisch** mit farbig getöntem Hintergrund wählen. Farbvorgaben und eine freie HEX-Farbe ändern die Akzente; die Schaltfläche für das ursprüngliche Grün stellt den bisherigen Farbcharakter her. Die Vorschau wird erst mit **Design speichern** dauerhaft übernommen. Design und Akzentfarbe gelten für die gesamte Anwendung und das Overlay; Statusfarben für Erfolg, Warnung und Fehler bleiben unterscheidbar. Animationen lassen sich reduzieren.

## Spiele und YAMLs

Der **Spielekatalog** enthält eingelesene APworlds und 55 vorbereitete Core-Worlds aus dem offiziellen Archipelago 0.6.8. Eigene Spieler-YAMLs lassen sich zusätzlich ausdrücklich importieren und erscheinen als **YAML-Vorlage**. Tabellenreferenzen und zufällig im APworld-Ordner liegende YAMLs erzeugen weiterhin keine Einträge. Die Referenzeinträge aus deiner Tabelle dienen als Downloadnachweis und manuelle Ergänzungsliste. Stand, Downloadquellen und SHA-256-Prüfsummen sind unter `assets/apworld-downloads.json` dokumentiert. **[APWORLDS-MANUELL.md](APWORLDS-MANUELL.md)** nennt Discord-Downloads, nicht erreichbare Dateien, den Core-Status und teilweise dynamische Optionen. Die Referenzliste ist kein Nachweis getesteter Spieleffekte.

Im Katalog ein Spiel suchen und **Einstellungen & YAML** öffnen. Choice- und Toggle-Optionen erscheinen als Dropdown; kleine Zahlenbereiche ebenfalls. Größere Bereiche erlauben eigene Werte und Zufallsbereiche. Bekannte Set-Werte und dokumentierte YAML-Listen bieten eine aufklappbare Mehrfachauswahl mit einzelnen Häkchen. Zusätzliche Texte lassen sich zeilenweise ergänzen; bestehende eigene Werte und ihre Reihenfolge bleiben erhalten. Freie Felder zeigen Datentyp, Vorlagenwert und vorhandene Schlüssel- oder Wertelisten. Dictionaries und andere komplexe Angaben bleiben JSON-Eingaben mit ihren Beschreibungen. Ein Slotname pro Zeile erzeugt eine YAML pro Spieler, mehrere Spieler werden als ZIP exportiert. Einstellungen und Namen bleiben pro Raum gespeichert.

Eigene `.apworld`-Dateien in **`apworlds/`** oder einen Unterordner legen und **Ordner neu einlesen** wählen. Alternativ über **+ APworld / YAML hinzufügen** hochladen. Beim Start wird ebenfalls gescannt. Eigene Dateien direkt im APworld-Ordner haben Vorrang vor mitgelieferten Varianten in Unterordnern. YAML-Dateien werden in diesem Ordner nicht eingelesen. Vorbereitete APworld-Versionen werden am Dateiinhalt erkannt und benötigen auch nach Umbenennen oder in eigenen Ordnern **kein Python**. Für bisher unbekannte Versionen wird **Python 3.10 oder neuer** benötigt, automatisch über `py -3`, `python` oder `python3` erkannt. Bei Bedarf gibt `AP_BRIDGE_PYTHON` den vollständigen Pfad vor. Die mitgelieferten Metadaten sind bereits vorbereitet und werden nur bei passenden Datei-Prüfsummen verwendet.

### Vorhandene Spieler-YAML importieren

1. Unter **Spielekatalog → + APworld / YAML hinzufügen** eine `.yaml` oder `.yml` auswählen und **Importieren** klicken. Mehrere Dateien oder bis zu 20 Dokumente in einer Datei sind möglich; maximal 2 MiB je Datei.
2. Das Spiel suchen und **Einstellungen & YAML** öffnen. Die Quelle trägt **YAML-Vorlage**. Bei mehreren Versionen oder einer vorhandenen APworld unter **Einstellungsquelle** auswählen. Es werden keine Defaults einer anderen World in die YAML gemischt.
3. Einstellungen ändern, pro Mitspieler einen Slotnamen eintragen und speichern oder exportieren. Die Werte und Quellenauswahl werden pro Raum gespeichert und bleiben nach Neustarts und APworld-Scans erhalten. **YAML-Vorlage entfernen** löscht eine importierte Quelle wieder aus dem gemeinsamen Katalog.

Das Original bleibt als Vorlage erhalten: Kommentare, zusätzliche Spieleinstellungen, Top-Level-Metadaten, gewichtete Einstellungen und Sammlungen werden beim Export übernommen. Texte wie `off`, `on` und `no` bleiben für Archipelagos YAML-1.1-Leser Texte. Die angeforderten Slotnamen ersetzen `name`; `quantity` wird für separate Spielerdateien entfernt.

Eine YAML definiert ihre vorhandenen Werte. Sie enthält nicht zwingend alle erlaubten Auswahlmöglichkeiten, Bedingungen oder sämtliche World-Optionen. Die Bridge übernimmt eindeutige `Values:`-Kommentare als Eingabehilfe; ohne solche Angaben bleiben Text-, Zahlen- oder JSON-Felder. Die passende World muss für die eigentliche Seed-Generierung weiterhin in Archipelago installiert sein. Die mitgelieferte Datei [elden-ring-peliarch.yaml](examples/elden-ring-peliarch.yaml) ist die bereitgestellte Peliarch-Vorlage mit 91 Einstellungen; sie wird nicht automatisch mit einer anderen Elden-Ring-World gleichgesetzt.

Listenhinweise wie `Names: first, second` oder beschriebene Schlüssel wie `rune_thief: you lose half your runes` werden als Vorschläge übernommen. Sie werden nicht als vollständiges Optionsschema behandelt. Die Peliarch-Liste `traps` enthält dadurch sieben auswählbare Typen; `spawn_traps` bleibt mit seinen Namen- und Modell-ID-Hinweisen als JSON-Liste bearbeitbar.

Die Dateien liegen nach Quelle und Hash in Unterordnern; ihre **Originalnamen bleiben erhalten**. Für die eigentliche Archipelago-Generierung die gewünschte Datei in Archipelagos `custom_worlds` installieren. Abweichende Installationsnamen einzelner Entwicklerpakete stehen in der manuellen Liste. Nicht alle mitgelieferten Versionen gleichzeitig in Archipelago installieren. Den verwendeten Dateipfad zeigt der Editor als Quelle an.

**Donkey Kong 64** und **Spirit Tracks** werden mit 100 bzw. 90 Feldern erkannt. **Friday Night Funkin** hat 46 Felder; seine World verlangt für unterstützte YAMLs einen Export aus der **Mixtape Engine**, insbesondere bei eigenen Songs und Mods. Die Spielseite erklärt das und verlinkt die Anleitung. `APAPI.apworld` ist eine zusätzliche Hilfsbibliothek ohne eigenes Spiel und wird im Einlesebericht entsprechend getrennt aufgeführt.

Der Import wertet Python-Deklarationen statisch aus und führt APworld-Code nicht aus. Laufzeitabhängige Optionen und Standardwerte können dabei offen bleiben; die Spielseite weist darauf hin. Fehlende Werte bei **Erweiterte Zusatzoptionen als YAML** setzen oder die Standards der World übernehmen. Zusatzoptionen überschreiben gleichnamige Formularwerte. Die World-Version in der anschließenden Archipelago-Generierung muss zum Editor passen. Die Bridge exportiert YAMLs und generiert selbst keinen Seed.

Ein APworld liefert nicht automatisch beliebige Live-Funktionen. Zusätzliche Items stammen weiterhin aus dem echten AP-Raumkatalog; erkannte Fallennamen sind Vorschläge für den Abgleich. Die tatsächliche Wirkung hängt vom verbundenen Spielclient ab. Einen Run-Reset enthält diese Version nicht.

## Core-Spiele ohne eigene APworld

Die 55 zuvor fehlenden Core-Spiele sind sofort im Katalog verfügbar, mit Kennzeichnung **Core 0.6.8**. Spiel suchen, Einstellungen öffnen, Slotnamen eintragen und YAMLs exportieren. Diese Worlds sind in Archipelago bereits enthalten; keine zusätzliche APworld installieren. Für die Generierung **Archipelago 0.6.8** verwenden. Die YAML setzt `requires.version: 0.6.8`.

Der Core-Katalog bleibt nach Neustart und Wechsel des APworld-Ordners erhalten. Eine eigene APworld mit genau demselben Spielnamen hat Vorrang; nach ihrem Entfernen und erneutem Einlesen erscheint wieder die Core-Version. Die Einstellungen stammen aus echten Optionsklassen des festgelegten offiziellen Releases; die Anwendung liest nur die vorbereiteten JSON-Metadaten.

## Worlds aus Release-ZIPs: SpongeBob

**Battle for Bikini Bottom 1.2.5** ist ab Bridge 0.4.1 enthalten: im **Spielekatalog** nach **Bikini Bottom** suchen, **Einstellungen & YAML** öffnen und pro Mitspieler einen Slotnamen eintragen. Die 22 vorbereiteten Felder funktionieren ohne Python. Unter anderem sind goldene Pfannenwender, Socken, Fähigkeiten, Tor-Kosten, DeathLink und RingLink einstellbar.

Andere Spiele werden häufig ebenfalls als Release-ZIP mit einer enthaltenen `.apworld` und zusätzlichen Client-Dateien verteilt:

1. Das passende Release des World-Entwicklers herunterladen und das ZIP entpacken.
2. Die originale `.apworld` unter **Spielekatalog → + APworld / YAML hinzufügen** hochladen oder in den APworld-Ordner kopieren und **Ordner neu einlesen** wählen. Bis **128 MiB pro APworld** werden unterstützt.
3. Alternativ den **APworld-Ordner** der Bridge auf Archipelagos **`custom_worlds`** setzen, wenn die Worlds dort bereits installiert sind. Bekannte Dateiversionen brauchen kein Python; bisher unbekannte Versionen benötigen Python ab 3.10 für die statische Analyse.
4. Das eingelesene Spiel öffnen und die Spieler-YAMLs exportieren. Reine Quellcode-Repositories benötigen zunächst eine passende APworld-Datei.

Für das eigentliche Spielen bleiben die Installationsschritte des World-Entwicklers nötig: die passende APworld in Archipelagos `custom_worlds`, gegebenenfalls die mitgelieferten Bibliotheken in Archipelagos `lib`. Die Bridge liest nur Einstellungen; sie installiert keinen Spielclient.

Das hier unterstützte SpongeBob nutzt die ursprüngliche **US-Fassung für GameCube mit Dolphin**. World 1.2.5 verlangt **Archipelago ab 0.6.7**; das angebotene Windows-Paket ist für Archipelagos **Python 3.13** gebaut. Dessen Python-Version ist von einem gegebenenfalls separat für die Bridge installierten Python zu unterscheiden. Anschließend die erzeugten YAMLs in Archipelagos `Players` legen und den Seed generieren.

Quellen: [BfBB 1.2.5](https://github.com/Cyb3RGER/bfbb_ap_world/releases/tag/v1.2.5), [Installationsanleitung](https://github.com/Cyb3RGER/bfbb_ap_world/blob/v1.2.5/docs/setup_en.md), [World-Manifest](https://github.com/Cyb3RGER/bfbb_ap_world/blob/v1.2.5/archipelago.json). Standard-YAML und geänderte Optionen wurden mit dem echten Archipelago 0.6.7 akzeptiert; Ergebnis: `assets/bfbb-validation.json`.

## Mehrere Spieler und Zufallsaktionen

Die echten Zielspieler werden automatisch aus eurem verbundenen AP-Raum übernommen. Unter **Spieler & Effekte → Items & Fallen auswählen** jeden gewünschten Slot aktivieren und seine Items freigeben. Eine TextOnly-Verbindung mit Admin-Anmeldung genügt für zusätzliche Items und Hinweise an mehrere Spieler desselben Teams. Jeder Teilnehmer verbindet weiterhin seinen normalen Spielclient.

Die aufklappbare Namensliste unter **Optional: Namen für YAMLs und Spielerauswahl merken** ist eine Arbeitshilfe. Mit **+ Spieler** eigene Zeilen für Slotname und optional Spiel hinzufügen und **Spieler speichern** wählen. Bei verbundenem Raum wird der nächste noch nicht eingetragene Slot vorgeschlagen. Die Profile helfen im YAML-Editor und bei der Zielauswahl; sie erzeugen keine zusätzlichen Slots in einem bestehenden Seed und keine zusätzlichen Anmeldungen.

| Regelaktion | Verhalten |
| --- | --- |
| Zufällige Falle | Erlaubte Items, die beim Zielspieler als **Falle** markiert sind |
| Zufälliges Item ohne markierte Fallen | Erlaubte Items ohne eure Fallenmarkierung; keine automatische Garantie für einen hilfreichen Effekt |
| Zufälliges Item aus allen erlaubten | Alle erlaubten Katalogitems, einschließlich markierter Fallen |
| Zufälliges Item aus eigener Liste | Exakte Namen aus eurer Liste, begrenzt durch Raumkatalog und Freigaben des Zielspielers |
| Bestimmtes Item senden | Genau das eingetragene und erlaubte Item |
| Hinweis zu einem Item | Kostenloser Admin-Hinweis für das Item des Zielspielers; Ausgabe an dessen AP-Team, kein zusätzliches Item |
| Nachricht im AP-Chat | Eine Nachricht im Raumchat; benötigt eine AP-Verbindung, keine Admin-Anmeldung |
| Nur Stream-Alert | Eine visuelle Meldung; keine AP-Verbindung erforderlich |
| DeathLink an die Gruppe | Ein DeathLink an die teilnehmenden Clients des eigenen AP-Teams; standardmäßig erlaubte Gruppenaktion, pro Raum abschaltbar |
| Zufall aus gewählten Aktionen | Zuerst gleichverteilte Auswahl einer aktuell möglichen gewählten Aktionsart, dann deren Ausführung |

Beim Zufallsmix werden leere Item-Pools oder gesperrte Aktionen ausgelassen. Eine gewählte Aktionsart bekommt nicht durch einen größeren Item-Pool mehr Gewicht. Für Chat und Alerts sind `{user}` und `{rule}` als Platzhalter möglich. Chatnachrichten erhalten immer den Präfix `[AP Chaos]`, damit ihr Text nicht als AP-Befehl interpretiert wird.

**Nur Spieler dieses Spiels** liest die Spielzuordnung der tatsächlich verbundenen eigenen AP-Team-Slots. Der Filter begrenzt die Empfänger der Item- und Hinweisaktionen. Er verwendet weder den Spielekatalog noch YAMLs oder das Spiel des Zuschauers. Als Ziel stehen eine Person, alle passenden Spieler, mehrere markierte Spieler oder eine zufällige Person aus allen beziehungsweise den markierten Spielern zur Verfügung. Die Vorschau nennt passende freigegebene Personen; Item-Pool und Aktionsfreigabe werden zusätzlich geprüft.

DeathLink, Chat und reine Alerts werden einmal pro Auslösung ausgeführt. Der Spiel- und Spielerfilter begrenzt diese Gruppen- beziehungsweise Anzeigeaktionen auch im Zufallsmix nicht. Die Zufallsauswahl wird beim Anlegen des Auftrags festgeschrieben; späteres Warten würfelt nicht erneut. Alle passenden aktiven Regeln werden ausgewertet.

## Räume und Verbindungen

Unter **Räume** einen Arbeitsbereich pro Run oder Spiel anlegen. Jeder Raum speichert eigene Regeln, Spielerprofile, YAML-Presets, Freigaben, Alert-Einstellungen und Protokolle. Nur der oben gewählte Raum empfängt und verarbeitet neue Ereignisse. Gemeinsame APworlds bleiben im Spielekatalog verfügbar. Im Ereignisprotokoll kann zusätzlich nach Spiel gefiltert werden.

**Archivieren** bewahrt Regeln, Protokolle, Presets und Zugangsdaten. Die Filter **Aktive Räume / Archiviert / Alle** helfen beim Aufräumen. **Wiederherstellen** macht einen archivierten Raum wieder auswählbar. **Löschen** verlangt den exakten Raumnamen und entfernt die lokalen Raumdaten und Zugangsdaten endgültig. Der gemeinsame Spielekatalog bleibt erhalten. Wird der geöffnete Raum archiviert oder gelöscht, öffnet die Bridge einen anderen Raum.

AP-Verbindung, Admin-Anmeldung, Charity und Twitch werden nach erfolgreicher Einrichtung für diesen Raum gemerkt. Nach Neustart oder Raumwechsel werden die zuletzt aktiv verbundenen Quellen wieder verbunden. **Trennen** beendet auch deren automatische Wiederverbindung. Die Bridge beginnt dabei im Testmodus; eine bewusst gesetzte Pause bleibt erhalten. Der Wechsel auf Live startet aktive Regeln unmittelbar.

AP-Passwörter bleiben maskiert in den Formularen stehen. Die Maske steht für die gespeicherten Zugangsdaten; neben dem Formular wird der wirkliche Admin-Status angezeigt. „Gespeicherte Passwörter vergessen“ beziehungsweise die entsprechende Twitch-Funktion entfernt die lokalen Zugangsdaten. Zugangsdaten werden verschlüsselt lokal gespeichert und nicht im Konfigurationsexport ausgegeben.

Die YAML-Option **`triggers`** in den Advanced Settings verändert Optionen **während der Generierung**. Sie empfängt keine Twitch-/Spendenereignisse. Ein später geändertes YAML verändert den bestehenden Seed nicht. Diese Bridge setzt Live-Ereignisse stattdessen in `Say`-Adminbefehle oder einen `Bounce` um.

## DeathLink

DeathLink ist eine eigene **Gruppenaktion**. Die Bridge sendet nur den Tag `DeathLink` an das eigene AP-Team und gibt **keine Einzelziel-Auswahl** vor. Eine Kombination aus Tags und Slotfiltern kann je Protokollversion größere Empfängergruppen erreichen; deshalb wird dieser Weg für einzelne Spieler nicht angeboten.

Die Gruppenfreigabe unter **Spieler & Effekte → DeathLink** ist standardmäßig aktiv; eine bewusste Deaktivierung bleibt für diesen Raum gespeichert. Betroffen sein können alle verbundenen Clients mit aktiviertem DeathLink im eigenen Team – auch Slots, die in dieser Bridge keine Itemfreigabe haben. Unterstützt ein Spielclient DeathLink nicht oder ist es dort ausgeschaltet, entsteht dort kein entsprechender Effekt. Die Bridge ändert diese Einstellung nicht.

## Verarbeitung, Wiederanlauf und Status

- Start immer im **Testmodus**. Neue Räume verarbeiten Simulationen sofort und erlauben DeathLink standardmäßig; explizite Pausen und eine deaktivierte DeathLink-Freigabe bleiben gespeichert. Zuletzt aktiv verbundene Quellen werden mit den lokal gespeicherten Zugangsdaten wiederhergestellt.
- Ein bezahltes Live-Ereignis, das im Testmodus eintrifft, wird zur Simulation und später nicht automatisch zu einer Live-Aktion. Test- und Livebetrieb daher bewusst trennen.
- Pro Ereignis werden alle passenden aktiven Regeln ausgewertet. Separate Regeln dürfen bewusst mehrere Aktionen erzeugen.
- Die Pause hält die Ausführung an. Eingänge können weiter Aufträge erzeugen. Regel- und globale Cooldowns verzögern Aufträge; deren Ablaufzeit läuft weiter.
- **Notaus** pausiert, wechselt in Testmodus, sperrt DeathLink und verwirft noch wartende Aufträge. Er kann bereits gesendete AP-Items oder bereits laufende Spieleffekte nicht zurücknehmen.
- Vor dem Netzwerkversand wird der Auftrag gespeichert. Ein Neustart während des Versands erzeugt **Unklar**. Solche Aufträge werden nicht automatisch wiederholt.
- Bei einer vollen Warteschlange wird ein Ereignis protokolliert, ohne nur einen Teil der geplanten Menge einzuplanen. Abgelaufene Aufträge werden verworfen.
- Historie in der Oberfläche: bis zu 300 Ereignisse, 300 Systemmeldungen und 500 abgeschlossene Aufträge, zusätzlich alle wartenden Aufträge. Deduplizierungs-IDs werden mindestens einen Tag gehalten; alte Ereignisse werden zusätzlich am Zeitstempel abgewiesen.

| Status | Bedeutung |
| --- | --- |
| Wartet | Gespeichert und noch nicht gesendet |
| Simuliert | Ablauf geprüft, kein AP-Paket versendet |
| AP bestätigt | Server bestätigt ein zusätzliches Item; keine Quittung des Spielclients |
| Gesendet | DeathLink-Bounce wurde versendet; keine Ausführungsquittung |
| Unklar | Möglicherweise gesendet; automatische Wiederholung gesperrt |
| Fehlgeschlagen | Vorbedingung fehlt oder Server hat den Auftrag abgewiesen |
| Verworfen / Abgelaufen | Auftrag wird nicht mehr gesendet |

## Daten und Entwicklung

Der ursprüngliche Raum bleibt in `data/state.json`; weitere Räume liegen unter `data/rooms/<Raum-ID>/state.json`. `data/rooms.json` merkt den geöffneten Raum. `data/game-library.json` enthält die importierten APworld-Einstellungen, `data/yaml-templates.json` die manuell importierten YAML-Vorlagen. Verschlüsselte Zugangsdaten liegen in `data/connections.enc`, der lokale Schlüssel in `data/connections.key`. Der Ordner wird beim ersten Start erstellt. Der Token des lokalen HTTP-Eingangs liegt in `data/integration-key.txt`. Zum Sichern eigener Einstellungen den geschlossenen `data`-Ordner kopieren; nicht öffentlich weitergeben, da er Integrationszugriff und Ereignisnamen enthalten kann.

Konfigurationsexport enthält keine Zugangsdaten. Beim Import werden Slotfreigaben neu aufgebaut; Live-Modus und DeathLink werden nicht importiert. Eine beschädigte Zustandsdatei wird nicht stillschweigend überschrieben.

```sh
npm test
npm run check
npm run validate:worlds
```

APworld-Bestand herunterladen oder fortsetzen: `python scripts/sync_apworld_catalog.py`, danach `python scripts/build_apworld_cache.py` und `python scripts/build_catalog_report.py`. Der Download liest nur frei zugängliche Links und meldet fehlende Dateien; anschließend `npm run validate:worlds` ausführen. Die Python-Skripte nutzen ausschließlich die Standardbibliothek.

Tests und Prüfgrenzen: **[VALIDIERUNG.md](VALIDIERUNG.md)**. Drittanbieter-Lizenzen liegen bei den enthaltenen Paketen in `node_modules`.

## Primärquellen

- [Charity Royale / Make-A-Wish API](https://streamer.make-a-wish.at/api)
- [Archipelago-Netzwerkprotokoll, Version 0.6.8](https://github.com/ArchipelagoMW/Archipelago/blob/0.6.8/docs/network%20protocol.md)
- [AP-Befehle und Rechte](https://archipelago.gg/tutorial/Archipelago/commands_en)
- [AP-Serverimplementierung, Version 0.6.8](https://github.com/ArchipelagoMW/Archipelago/blob/0.6.8/MultiServer.py)
- [Advanced YAML Settings](https://archipelago.gg/tutorial/Archipelago/advanced_settings_en) und [YAML Triggers](https://archipelago.gg/tutorial/Archipelago/triggers_en)
- [Stardew-Items](https://github.com/ArchipelagoMW/Archipelago/blob/0.6.8/worlds/stardew_valley/data/items.csv)
- [Factorio-Fallen und Ausführung](https://github.com/ArchipelagoMW/Archipelago/blob/0.6.8/worlds/factorio/data/mod_template/control.lua)
- [KH2-Client einschließlich DeathLink](https://github.com/ArchipelagoMW/Archipelago/blob/0.6.8/worlds/kh2/ClientStuff/Client.py)
- [Twitch EventSub-WebSockets](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/), [Ereignistypen](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/), [OAuth](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/), [Tokenvalidierung](https://dev.twitch.tv/docs/authentication/validate-tokens/)
- [Deine AP-Spieleliste](https://docs.google.com/spreadsheets/d/1iuzDTOAvdoNe8Ne8i461qGNucg5OuEoF-Ikqs8aUQZw/edit?gid=58422002)

Design: `data/appearance.json`; hochgeladene Animationen: `data/alert-media/`. Beide bleiben bei Programmupdates erhalten.

### Core-Metadaten für Entwickler aktualisieren

Die normale Anwendung benötigt diese Schritte nicht. `assets/core-worlds-source.json` legt Release, Commit und 55 World-Module fest. Einen sauberen offiziellen Checkout dieses Commits verwenden, die Entwicklerabhängigkeiten mit `python -m pip install -r scripts/requirements-core-cache.txt` installieren und `python scripts/build_core_cache.py --archipelago PFAD` ausführen. `npm run validate:core -- --archipelago PFAD` prüft 110 aus der Bridge exportierte YAMLs mit `Generate.roll_settings`, `Option.verify` und vorhandenen Dataclass-Validatoren. Dabei wird ausschließlich der explizit gewählte offizielle Core-Quellcode importiert. Normale APworld-Imports bleiben statisch. Der Release-Workflow reproduziert diese Prüfung automatisch.
