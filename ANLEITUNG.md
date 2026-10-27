# AP Chaos Bridge 0.8.0 · Einrichtung

## Start und Update

1. ZIP vollständig entpacken. Für ein Update die neue Version über den bisherigen Programmordner kopieren und **`data` beibehalten**. Die laufende Bridge vorher unter Einstellungen beenden.
2. Das **vollständige Windows-Release** enthält Node und die npm-Pakete bereits. Eine zusätzliche Node-Installation ist dafür nicht nötig. Quellcodekopien und macOS/Linux benötigen Node ab 22 sowie `npm ci --ignore-scripts`.
3. Beim ersten Start **`Start.cmd`** öffnen. Es öffnet das eigene Fenster und legt **`AP-Chaos-Bridge.exe`** im Hauptordner an. Danach diese EXE verwenden. Schließen oder Minimieren legt die Bridge in den Tray; Doppelklick auf das Symbol öffnet sie, **Rechtsklick → Beenden** beendet alles. Die Oberfläche bleibt für OBS und Integrationen lokal unter **http://127.0.0.1:17381** erreichbar. Fehlt WebView2, die vom Programm angebotene offizielle Runtime installieren und die Bridge erneut starten.
4. Vorbereitete APworld-Versionen einschließlich der sieben Nutzerdateien funktionieren ohne Python, auch in einem eigenen Ordner. Für bisher unbekannte Versionen zusätzlich [Python 3.10 oder neuer](https://www.python.org/downloads/windows/) installieren und bei der Installation zu PATH hinzufügen. Bereits vorhandenes Python wird über `py -3`, `python` oder `python3` erkannt. Anschließend die Bridge neu starten.

## Räume und mehrere Spieler

1. Unter **Räume → Raum anlegen** z. B. „Stardew Charity“ oder „Factorio Run“ anlegen.
2. Oben im Raum-Menü wechseln. Regeln, Zugangsdaten und Protokolle sind pro Raum getrennt.
3. Die echten Zielspieler erscheinen nach dem Verbinden des AP-Raums automatisch unter **Spieler & Effekte**. Dort pro Spieler **Items & Fallen auswählen**, den Slot aktivieren und gewünschte Items erlauben.
4. Optional unter **Namen für YAMLs und Spielerauswahl merken** auf **+ Spieler** klicken. Pro Teilnehmer eine Zeile mit Slotname und optional Spiel ausfüllen und **Spieler speichern** wählen. Diese Namensliste ist nur eine Eingabehilfe für YAMLs und Auswahlfelder.

Slotnamen für die Generierung: eindeutig, maximal 16 Zeichen. Die gespeicherte Namensliste fügt einem laufenden Seed keine Spieler hinzu. Eine Bridge-Anmeldung mit Adminrechten reicht für Items und Hinweise an mehrere Zielspieler im eigenen AP-Team. Eure normalen Spielclients bleiben verbunden.

## APworlds und YAML-Editor

Viele direkt verfügbare APworlds sind bereits enthalten und vorbereitet. Die **[Liste manueller Downloads](APWORLDS-MANUELL.md)** nennt fehlende Dateien und teilweise dynamische Einstellungen. Die Unterordner des APworld-Ordners werden mit eingelesen; YAML-Vorlagen werden über die Dateiauswahl ausdrücklich importiert.

1. `.apworld`-Dateien mit Originalnamen in den Ordner **`apworlds`** neben `Start.cmd` kopieren. Alternativ im Spielekatalog über **+ APworld / YAML hinzufügen** mehrere Dateien auswählen.
2. Unter **Spielekatalog → Ordner neu einlesen** aktualisieren. Ein anderer Ordner kann dort eingetragen werden.
3. Spiel suchen und **Einstellungen & YAML** öffnen.
4. Einstellungen setzen und Slotnamen eintragen, ein Name pro Zeile. **Gespeicherte Spielernamen übernehmen** füllt die zum Spiel passenden Profile ein.
5. **Einstellungen speichern** behält die Vorlage in diesem Raum. **YAML-Vorschau** zeigt den Export. **YAMLs herunterladen** erzeugt eine einzelne YAML oder ein ZIP mit einer Datei pro Spieler.
6. Die Dateien anschließend mit der passenden APworld-Version in Archipelago zum Seed generieren. Die Bridge verändert durch den YAML-Export keinen bereits laufenden Seed.

Ein Bridge-Raum ist der gespeicherte Arbeitsbereich für euren Run: Dort bleiben Spieler, Spieleinstellungen und Regeln zusammen. Für die YAML-Vorbereitung ist noch keine Serververbindung nötig. Nach dem Export erzeugt ihr den Seed mit Archipelago, startet beziehungsweise hostet dort den Serverraum und verbindet anschließend die Bridge.

**Eingaben im Editor:** Ja/Nein und bekannte Einzelwerte sind Dropdowns. Kleine Zahlenbereiche sind auswählbar; größere Bereiche zeigen Grenzen und erlauben eigene Werte. Bei bekannten Listen **Werte auswählen** öffnen und die gewünschten Einträge einzeln ankreuzen. **Weitere Werte** ergänzt eigene Texte, einen pro Zeile. Eine leere Auswahl bleibt eine leere Liste. Freie Felder zeigen Datentyp, Vorlagenwert und dokumentierte Schlüssel; die vollständige Beschreibung bleibt darunter erhalten. Wenn die Quelle keinen verbindlichen Wertebereich enthält, wird das ausdrücklich kenntlich gemacht.

Die APworld liefert die technischen Definitionen; eine zur verwendeten Version passende Spieler-YAML kann ausführlichere Beschreibungen bieten. Beide bleiben getrennte Einstellungsquellen. Eine andere World mit ähnlichem Spielnamen wird nicht automatisch dazu gemischt.

### Eigene YAMLs, etwa Elden Ring / Peliarch

1. **Spielekatalog → + APworld / YAML hinzufügen** öffnen.
2. Deine `EldenRing.yaml` beziehungsweise eine andere Archipelago-Spieler-YAML auswählen und **Importieren** klicken. Dafür ist kein Python erforderlich.
3. Das Spiel suchen und **Einstellungen & YAML** öffnen. Deine Peliarch-Datei zeigt **91 Felder**. Eindeutige Auswahlwerte und Zahlenbereiche aus den Kommentaren werden als Dropdown angeboten; andere Werte bleiben frei oder als JSON bearbeitbar.
4. Bei mehreren Dateien oder einer vorhandenen APworld unter **Einstellungsquelle** die gewünschte Vorlage wählen. Jede Quelle behält ihre Werte und ihre pro Raum gespeicherten Einstellungen; es wird nichts aus einer anderen World ergänzt.
5. Für jeden Spieler einen Slotnamen eintragen, Einstellungen speichern und YAMLs herunterladen. Kommentare und weitere Einstellungen bleiben erhalten.

Bis zu **2 MiB je YAML-Datei**; mehrere Dateien und mehrere Spieler-Dokumente sind möglich. Der normale Ordnerscan liest weiterhin APworlds. Importierte YAMLs bleiben unabhängig davon nach Neustarts erhalten. Über **YAML-Vorlage entfernen** kannst du eine Quelle aus dem gemeinsamen Katalog entfernen.

Eine YAML enthält Werte und gegebenenfalls Beschreibungen, aber kein garantiert vollständiges Optionsschema. Die Bridge kann daraus nicht alle unbekannten Auswahlwerte oder Spielbedingungen ableiten. Für die Seed-Generierung brauchst du weiterhin die zur Vorlage passende World im Archipelago-Generator. Eine vollständige Elden-Ring-Seed-Generierung wurde durch den Importtest nicht bestätigt.

Peliarch verwendet die Spiel-ID **`Elden Ring` mit Leerzeichen**. Die andere mitgelieferte World heißt **`EldenRing` ohne Leerzeichen**. Beide werden in der Suche gefunden und bleiben getrennt; für die bereitgestellte Vorlage den Eintrag mit Leerzeichen und Kennzeichnung **YAML-Vorlage** öffnen.

Unter **Trap Types / traps** sind die sieben beschriebenen Peliarch-Fallen als Mehrfachauswahl verfügbar. Die leere Liste bedeutet keine Fallen im Seed-Pool, auch wenn `trap_count` einen positiven Wert hat. Unter **spawn_traps** stehen weitere Gegnernamen und Modell-IDs in der Beschreibung; dieses Feld bleibt als JSON-Liste bearbeitbar.

Die mitgelieferte **KH3-World 0.16.11** implementiert **Burn Trap** und **Sneeze Trap**. **Animal Crossing: Wild World 0.1.1** implementiert **Bee Trap** und **Invisible Bee Trap**. Diese zwei Arten sind jeweils tatsächlich im World- und Clientcode hinterlegt. YAML-Import und ein höherer Trap-Anteil erzeugen keine zusätzlichen Effekte. Für Live-Aktionen unter **Spieler & Effekte** neben den Items auch die übergeordnete Slot-Freigabe aktivieren und speichern.

**Donkey Kong 64** und **Spirit Tracks** werden jetzt erkannt. Die zusätzliche `APAPI.apworld` ist eine Hilfsbibliothek ohne eigenes Spiel und wird separat erklärt. **Friday Night Funkin** liegt als eigene World vor, verlangt für unterstützte YAMLs aber den Export aus der **Mixtape Engine**; die Spielseite enthält den Hinweis und die Anleitung.

Die Formularfelder basieren auf den deklarierten APworld-Optionen. Dynamische Angaben werden auf der Spielseite aufgelistet. Für solche Worlds die fehlenden Angaben bei **Erweiterte Zusatzoptionen als YAML** setzen. Diese Zusatzoptionen überschreiben gleichnamige Formularfelder. APworld-Code wird beim Einlesen nicht ausgeführt.

## Core-Spiele direkt verwenden

Die 55 bisher fehlenden Core-Spiele stehen ab 0.5.0 ohne eigene Dateien und ohne Python im Spielekatalog. Nach dem Spiel suchen und **Einstellungen & YAML** öffnen; das Kennzeichen lautet **Core 0.6.8**. Namen und Optionen einstellen und exportieren. Zur Generierung **Archipelago 0.6.8** verwenden. Diese Worlds sind dort bereits enthalten; keine zweite APworld installieren. Core-Spiele bleiben auch bei einem eigenen APworld-Ordner verfügbar.

Die [Liste der 50 weiterhin fehlenden Spiele](https://github.com/BR3TZN/AP-Chaos-Bridge/blob/main/FEHLENDE-SPIELE.md#noch-fehlende-apworlds) enthält die manuellen Downloadlinks.

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

1. [Twitch Developer Console](https://dev.twitch.tv/console/apps) öffnen und eine Anwendung verwenden.
2. OAuth Redirect URL exakt **`http://localhost:17381/oauth/callback`** eintragen. Anwendungstyp **Confidential**. Bei einem anderen Bridge-Port die Redirect-URL ändern.
3. **Verbindungen → + Twitch-Kanal hinzufügen** öffnen. Den **Kanalnamen** ohne Link und die **Client-ID** eintragen. Für mehrere Kanäle darf dieselbe Client-ID verwendet werden.
4. Die gewünschten Ereignisse auswählen. Unter **Erweitert** ist ein **Client Secret** für automatische Token-Erneuerung optional. Ohne Secret bleibt die Anmeldung bis zum Tokenablauf gültig.
5. **Kanal hinzufügen & anmelden** klicken. Die Twitch-Anmeldung öffnet sich im Standardbrowser. **Jeder Kanalbesitzer muss seinen eigenen Kanal autorisieren**; Name und Client-ID allein reichen dafür nicht. Mit einem anderen Konto bricht die Bridge mit einer verständlichen Meldung ab.
6. Nach der Freigabe das Anmeldefenster schließen. Der jeweilige Kanal zeigt **Verbunden**, seine aktiven Ereignisse und gegebenenfalls fehlende Berechtigungen.
7. Für weitere Kollegen wieder **+ Twitch-Kanal hinzufügen** verwenden. Jeder Kanal lässt sich einzeln trennen, erneut anmelden oder entfernen. Gespeicherte Anmeldungen und die automatische Wiederverbindung gelten pro Kanal und Bridge-Raum.
8. In einer Twitch-Regel unter **Kanal** alle verbundenen Kanäle oder einen bestimmten Kollegen wählen. Im Protokoll und bei Aufträgen steht die Herkunft als **@Kanalname**; in Nachrichten und Alerts ist `{channel}` verfügbar.

| Ereignisse | Twitch-Berechtigung |
| --- | --- |
| Subs, Resubs, Gift Subs | `channel:read:subscriptions` |
| Bits | `bits:read` |
| Kanalpunkte | `channel:read:redemptions` |

Die in 0.1.1 blockierte Rückleitung von Twitch ist behoben. Zugangsdaten werden lokal gespeichert; mit Client Secret wird ein Refresh Token für die Erneuerung genutzt. Nach Widerruf einer Anmeldung ist erneut zu autorisieren.

## Kanalpunkte-Belohnungen im Programm anlegen

1. Unter **Verbindungen** beim gewünschten Twitch-Kanal **Kanalpunkte-Belohnungen** öffnen. Alternativ in einer Regel mit **Twitch → Kanalpunkte-Belohnung** auf **+ Belohnung bei Twitch anlegen** klicken; der Regelentwurf bleibt dabei offen.
2. Beim ersten Mal **Belohnungen freigeben** wählen. Twitch benötigt dafür zusätzlich `channel:manage:redemptions`. Die Freigabe öffnet sich im Standardbrowser; danach übernimmt die Bridge den aktualisierten Verbindungsstatus.
3. Kanal, eindeutigen Titel und Kanalpunkte-Preis eintragen. Beschreibung ist optional; unter **Weitere Einstellungen** stehen Farbe, Abklingzeit und die Zuschauernachricht.
4. **Bei Twitch anlegen** erstellt die Belohnung tatsächlich im ausgewählten Kanal. Twitch erlaubt höchstens 50 Belohnungen pro Kanal und Titel bis 45 Zeichen.
5. Aus der Liste **Regel für diese Belohnung** wählen oder die neu angelegte Belohnung im bisherigen Regelentwurf verwenden. Die Belohnungs-ID und der zugehörige Kanal werden übernommen. Danach die Spielaktion auswählen und die Regel speichern.

## Alle Twitch-Abos mit einer Regel

Unter **Regeln → Twitch → Alle Abos · neu, Resub & Geschenk** wählen. Neue Abos, geteilte Resub-Nachrichten und Geschenk-Abos verwenden damit dieselbe Aktion. Beim Speichern aktiviert die Bridge diese drei EventSub-Typen für den gewählten Kanal bzw. alle eingetragenen Kanäle; bereits verbundene Kanäle werden dafür nicht getrennt. Bei fehlender Abo-Berechtigung Twitch erneut anmelden.

Ein Geschenkpaket löst einmal aus; seine enthaltenen Abos werden nicht zusätzlich gezählt. **Stille automatische Verlängerungen stellt Twitch nicht als Ereignis bereit.** Resubs erscheinen, wenn der Zuschauer seine Resub-Nachricht teilt. Für gezielte Regeln bleiben die einzelnen Abo-Arten auswählbar.

## Charity Royale

1. Unter **Verbindungen → Charity Royale** nur deinen Slug, z. B. **`br3tzn`**, eintragen; keine vollständige JSON-Adresse.
2. Projekt **`charityroyale2026`**. **Spenden verbinden** klicken.
3. In der Regel als Quelle **Charity Royale** wählen und den Mindestbetrag in Euro eintragen. Für einen bestimmten Spendenbutton unter **Optional: Aktionscode filtern** zusätzlich dessen exakten `metadata.action`-Wert verwenden; ohne Aktionscode reagieren Regeln auf alle Spenden ab dem Betrag.
4. Der Netto-Betrag wird in Cent ausgewertet: `amount_net: 1000` entspricht 10 Euro.
5. Offizielle Testspenden bzw. `id: null` werden als Simulation verarbeitet. Die Bridge filtert nach dem Streamer-Slug; eine noch fehlende öffentliche JSON-Seite verhindert solche Testereignisse nicht.

## Regeln exportieren, speichern und übernehmen

- **Regeln → Exportieren:** gewünschte Regeln auswählen und eine JSON-Datei herunterladen. Diese Datei kann auch auf einem anderen PC eingelesen werden.
- **Regeln → Als Vorlage speichern:** einen Namen vergeben. Die Vorlage bleibt nach Neustarts erhalten und steht in allen lokalen Bridge-Räumen zur Verfügung, auch wenn der Ursprungsraum später gelöscht wird.
- **Regeln → Regeln übernehmen:** einen anderen Raum (auch archivierte Räume), eine gespeicherte Vorlage oder eine JSON-Datei wählen. Bestehende vollständige Bridge-Konfigurationsexporte sind hier ebenfalls als Regelquelle verwendbar.
- **Regeln anzeigen** lädt die Vorschau. Die gewünschten Regeln markieren und zu den vorhandenen Regeln hinzufügen oder diese ausdrücklich ersetzen. Beim Ersetzen wird die Ausführung pausiert.

Alle übernommenen Regeln starten **inaktiv** mit neuen IDs. Spieler werden anhand von Slotname und Spiel, Twitch-Kanäle bevorzugt anhand ihrer Broadcaster-ID zugeordnet. Fehlende Zuordnungen stehen als **Zuordnung prüfen** an der Regel. Diese Regeln vor der Aktivierung öffnen, Ziele/Kanal/Belohnung für den Zielraum wählen und die Prüfung bestätigen. Verbindungen, Zugangsdaten und Slot-Freigaben werden nicht aus der Vorlage übernommen.

## Zufällige Hinweise

Als Aktion **Zufälliger Hinweis aus allen erlaubten Items** wählen. Für jeden getroffenen Spieler zieht die Bridge ein Item aus dessen freigegebenem Pool und fordert dazu einen kostenlosen AP-Admin-Hinweis an. Fallen und andere erlaubte Items können gezogen werden. Die Auswahl funktioniert mit einem Spieler, allen passenden Spielern oder den beiden Gruppenmodi.

Pro getroffenem Spieler wird genau ein Hinweis angefordert. Das Server-Adminpasswort muss angemeldet sein. Der Hinweis erscheint im AP-Team; es wird kein Item verschickt. Ob das gezogene Item einen passenden Fundort im Seed hat oder bereits bekannt ist, bestimmt Archipelago.

## Regeln und mehrere Ziele

1. Unter **Spieler & Effekte → Items & Fallen auswählen** den gewünschten Slot aktivieren. **Erlaubt** nimmt ein Item in den erlaubten Pool auf; **Falle** markiert es zusätzlich für Fallenaktionen. Die Bridge kann nicht alle schädlichen Items automatisch erkennen.
2. Neue Räume starten **ohne Regeln**. Unter **Regeln → + Neue Regel** die Quelle wählen. Charity zeigt den Spendenbetrag; Twitch bietet neue Subs, Resub-Mitteilungen, Geschenk-Abo-Pakete, Bits und Kanalpunkte. Die Menge gilt **pro einzelnem Cheer oder Geschenkpaket**, nicht als laufender Zähler. Bei Kanalpunkten eine geladene Belohnung oder **Belohnungs-ID selbst eintragen** wählen. Manuelle Auslöser benötigen keine Plattformschwellen. Unpassende Felder werden ausgeblendet und blockieren die Regel nicht.
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

Der Katalog zeigt eingelesene APworlds, vorbereitete Core-Worlds und ausdrücklich importierte Spieler-YAMLs. Nach diesem Update alte Platin-YAMLs erneut exportieren. Die angezeigte World-Version und Mindestversion von Archipelago beachten. Die passende `.apworld` in Archipelagos `custom_worlds` installieren, Spieler-YAMLs in `Players` legen und daraus den Seed generieren. Die YAML ist eine Konfigurationsdatei für den Generator.

## Eingaben bei laufendem Betrieb

Die Statusdaten aktualisieren sich weiter, während offene Dropdowns, Dialoge, Suchfilter, aufgeklappte Abschnitte und ungespeicherte Eingaben erhalten bleiben. Erst ein bewusster Seiten- oder Raumwechsel schließt den bisherigen Dialog. Die kurzen Feldübergänge lassen sich unter **Design → Bewegung** abschalten; die Systemeinstellung für reduzierte Bewegung wird ebenfalls beachtet.

## Quellen zu den Twitch-Funktionen

- [Kanalpunkte-Belohnungen anlegen und Berechtigungen](https://dev.twitch.tv/docs/api/reference/#create-custom-rewards)
- [EventSub-Abos und Resub-Mitteilungen](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/)
- [Grenze bei stillen automatischen Verlängerungen](https://dev.twitch.tv/docs/pubsub/)
