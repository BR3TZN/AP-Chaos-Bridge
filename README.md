# AP Chaos Bridge 0.2.0

Lokales Tool für Zuschaueraktionen in Archipelago-Multiworlds. Charity-Royale-Spenden, Twitch-Ereignisse und externe Trigger laufen durch dieselbe Regel-Engine und erzeugen zusätzliche AP-Items oder einen DeathLink an die eigene Teamgruppe.

**Windows starten:** ZIP vollständig in einen beschreibbaren Ordner entpacken, **Node.js 22 oder neuer** installieren und **`Start.cmd`** doppelklicken. Alle npm-Abhängigkeiten liegen dem Paket bei. Die Oberfläche öffnet sich unter **http://127.0.0.1:17381**. Das minimierte Node-Fenster gehört zur laufenden Anwendung. Beenden unter **Einrichtung → Tool beenden**.

[Node.js herunterladen](https://nodejs.org/en/download)

Für macOS/Linux oder zum direkten Start:

```sh
node server.mjs
```

Bei einer reinen Quellcode-Kopie ohne `node_modules` zuerst `npm ci --ignore-scripts` ausführen. Für einen anderen lokalen Port die Umgebungsvariable `AP_BRIDGE_PORT` setzen; dann auch die Twitch-Redirect-URL und externe Integrationen anpassen.

## Update auf 0.2.0

Bridge über **Einrichtung → Tool beenden** schließen. Neue Dateien über den bisherigen Programmordner kopieren; den bestehenden Ordner **`data` beibehalten**. Anschließend `Start.cmd` öffnen und die Oberfläche mit **Strg+F5** neu laden. Das Update-Paket enthält keine persönlichen Daten.

Neu: Spielekatalog mit YAML-Editor, APworld-Ordner und Dateiimport, YAML-Export pro Spieler, mehrere Zielslots pro Regel, gemischte Zufallsaktionen, getrennte Räume sowie gespeicherte Verbindungen. Der Twitch-OAuth-Callback wird bei der Rückleitung vom Anbieter korrekt zugelassen. Der Schutz der übrigen lokalen API bleibt bestehen.

Kurze Anleitung inklusive Twitch-Setup: **[ANLEITUNG.md](ANLEITUNG.md)**.

## In drei Minuten den Ablauf prüfen

1. Auf **Regie → Demo öffnen** klicken. Die drei Beispielslots haben keine Verbindung zu echten Spielen.
2. Bei der mitgelieferten Regel auf **Simulieren** klicken. Das funktioniert auch bei einer inaktiven Regel.
3. Unter **Ereignisse** den Auftrag mit Status **Simuliert** prüfen. In der Demo werden keine AP-Pakete gesendet.

Der Testmodus ist ein Ablauf-Test. Er bestätigt weder einen laufenden Spielclient noch einen sichtbaren Effekt im Spiel.

## Mit eurem echten Raum arbeiten

1. Seed normal aus den Spieler-YAMLs generieren und den AP-Raum starten. Jeder Teilnehmer verbindet zusätzlich seinen üblichen Spielclient.
2. Unter **Quellen → Archipelago-Raum** zwischen lokalem Server, archipelago.gg und eigener externer Adresse wählen. Port und einen existierenden Slotnamen aus diesem Raum eintragen. Die Bridge darf denselben Slot parallel als Text-Client verwenden. Sie empfängt keine `ReceivedItems` und prüft keine Spielorte ab.
3. Raumpasswort nur eintragen, wenn gesetzt. **Server-Adminpasswort ist eine andere Einstellung**: Der Host benötigt ein gesetztes `server_password`, damit die Bridge `!admin login …` und anschließend `!admin /send …` verwenden kann. Falls nötig, legt der Host dieses in seiner Serverkonfiguration oder über seine Serverkonsole mit `/option server_password <eigenes Passwort>` fest. Ohne Host-Zugriff ist zusätzlicher Itemversand über diese Bridge nicht möglich.
4. Bei normalen AP-Adressen `ws://host:port` verwenden. Ein eingefügter Host ohne Schema wird wie im AP-Client als `ws://` behandelt, ohne Port mit Standardport 38281. Für einen Server mit TLS explizit `wss://host:port` angeben; es gibt keinen automatischen Wechsel auf unverschlüsselte Übertragung. `archipelago://` wird ebenfalls erkannt. Zugangsdaten separat eintragen, nicht in die URL.
5. Unter **Spielslots → Effekte & Freigabe** passende Items aus dem geladenen Raumkatalog auswählen. **Erlaubt** gestattet gezielten Versand und gemischte Zufallsitems; **Zufall** nimmt das Item zusätzlich in den Pool für „Zufällige Falle“ auf. Der Slot muss ebenfalls freigegeben sein. „Alle Katalogitems für Zufallsaktionen erlauben“ nimmt auch hilfreiche Items auf. Ein Vorschlag ist noch kein bestätigter Spieleffekt.
6. Regeln zuerst simulieren. Dann den **Live-Modus** wählen. Der Wechsel pausiert die Warteschlange. Eine aktive Regel über **Live-Test** einmal auslösen, die Ausführung starten und den Effekt beim betroffenen Spieler prüfen. Die Aktion kann den Spielstand tatsächlich beeinflussen.
7. Erst für die erfolgreich geprüften Effekte eine echte Ereignisquelle verbinden und passende Regeln aktivieren.

Itemaktionen richten sich an freigegebene Spieler im **eigenen AP-Team**. Item-Link-Gruppen werden nicht als direkte Ziele angeboten. Mehrere Spieler innerhalb eines einzelnen Spielslots können trotzdem gemeinsam betroffen sein. Die Bridge weiß nicht zuverlässig, ob der Spielclient eines Slots online ist: AP kann zusätzliche Items für später aufbewahren.

Optional kann eine erwartete Seed-ID eingetragen werden. Bei Abweichung stoppt der Handshake vor der Anmeldung. Wartende Aufträge sind unabhängig davon immer an Serveradresse und Seed gebunden und werden in einem anderen Raum nicht ausgeführt.

## Charity Royale

**Quellen → Charity Royale:** exakten Streamer-Slug deiner Spendenseite und Projekt `charityroyale2026` eintragen. Dann **Spenden verbinden**.

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

Das Token wird beim Verbinden und anschließend stündlich validiert. Verbindungen werden für den geöffneten Raum lokal gespeichert. Mit Client Secret werden Authorization-Code-Flow und Refresh Token verwendet; ein abgelaufenes Access Token wird automatisch erneuert. Ohne Secret wird der gespeicherte Access Token bis zu seinem Ablauf wiederverwendet. Nach Widerruf oder ungültigem Refresh Token erneut anmelden. Abgelehnte Teilabonnements erscheinen unter Quellen. Während einer unerwarteten Verbindungslücke nach Twitch verlorene Ereignisse werden nicht automatisch nachgeliefert.

## Weitere Trigger und OBS

Für Streamer.bot oder andere lokale Anwendungen gibt es einen Bearer-geschützten HTTP-Eingang. PowerShell-Helfer, C#-Beispiel und Feldzuordnung: **[integrations/README.md](integrations/README.md)**. Regeln verwenden dafür die Quelle **Externer Trigger**. Native Twitch-Ereignisse nicht gleichzeitig nochmals über Streamer.bot einspeisen.

Optionale OBS-Browserquelle: **http://127.0.0.1:17381/overlay**, 1920 × 1080. Transparenter Hintergrund, Anzeige nach einem abgeschlossenen Auftrag, mit Kennzeichnung **TEST** oder **LIVE**. Bestehende Historie wird beim Öffnen nicht erneut abgespielt. OBS und Bridge müssen auf demselben PC laufen; die Anwendung ist absichtlich nur an Loopback gebunden.

## Spiele und YAMLs

Deine drei unveränderten YAMLs liegen unter `examples`. Sie sind als lokale Vorlagen eingelesen. Import unterstützt mehrere Dokumente mit `---`, einfache gewichtete Angaben und Namensplatzhalter; bei mehreren möglichen Spielen wird keine Wahl für den generierten Raum geraten.

| Spiel | Ausgangspunkt | Grenze |
| --- | --- | --- |
| Stardew Valley | 23 Fallen-Vorschläge aus deinem YAML; Abgleich mit dem Raumkatalog | Client/Mod-Version und Ausführung im Spiel prüfen. DeathLink im Beispiel aus. |
| Factorio | 9 Fallen-Vorschläge aus dem offiziellen Mod-Template | Explosive und andere Fallen können dauerhaft die Fabrik verändern. Die YAML-Werte 0 betreffen den generierten Pool. DeathLink im Beispiel aus. |
| Kingdom Hearts 2 | Raumkatalog für zusätzliche Items; dokumentierte DeathLink-Funktion im Client | Kein Fallenkatalog behauptet. DeathLink-Aktivierung und passende Client-/Lua-Version prüfen. |
| Andere AP-Spiele | Zusätzliche Items aus dem tatsächlichen `GetDataPackage` des Raums | Fallen manuell auswählen und testen; kein allgemeiner Zugriff auf beliebige Spieleffekte. |

Die Suche unter Einrichtung enthält **867 Referenzeinträge** aus deiner verlinkten Tabelle, Stand Abruf 20.10.2026. `Stable`, `Unstable` und `Broken on Main` bezeichnen den Status der AP-Integration in der Tabelle. **Diese 867 Einträge sind keine Liste getesteter Bridge-Effekte.** Der Umfang tatsächlicher Aktionen hängt vom jeweiligen APWorld, Serverkatalog und Spielclient ab. Die Tabelle ist ein Suchkatalog; beim Verbinden gibt der Raum den aktuellen Itemumfang vor.

Unter **Spielekatalog** kannst du Spiele suchen, YAML-Vorlagen importieren und eine eigene Einstellungsseite öffnen. Ein Name pro Zeile erzeugt eine YAML pro Spieler; mehrere Spieler werden als ZIP exportiert. Einstellungen und Namen bleiben pro Raum gespeichert. Gewichtete YAML-Werte bleiben erhalten und lassen sich im JSON-Feld bearbeiten. Erweiterte Zusatzoptionen werden als YAML angenommen und überschreiben gleichnamige Formularwerte.

Lege `.apworld`, `.yaml` oder `.yml` in den Ordner **`apworlds`** oder wähle im Spielekatalog einen anderen Ordner. **Ordner neu einlesen** aktualisiert den Katalog; beim Start wird ebenfalls gescannt. Alternativ mehrere Dateien direkt im Browser importieren. Für APworlds wird **Python 3.10 oder neuer** benötigt, automatisch über `py -3`, `python` oder `python3` erkannt. Bei Bedarf kann `AP_BRIDGE_PYTHON` den vollständigen Pfad vorgeben. Python-Download: https://www.python.org/downloads/windows/.

Der Import liest Python-Deklarationen mit dem AST-Parser und führt APworld-Code nicht aus. Choice-, Toggle-, Range-, Set-, Listen- und Dictionary-Optionen werden nach Möglichkeit in Formularfelder umgesetzt. Dynamische oder nicht auflösbare Angaben stehen ausdrücklich auf der Spielseite. Dafür eine vom APworld erzeugte YAML-Vorlage importieren oder Zusatzoptionen eintragen. Die installierte World-Version in der anschließenden Archipelago-Generierung muss zur Vorlage passen. Das Tool exportiert YAMLs und generiert selbst keinen Seed.

Ein APworld liefert nicht automatisch beliebige Live-Funktionen. Zusätzliche Items stammen weiterhin aus dem echten AP-Raumkatalog; erkannte Fallennamen sind Vorschläge für den Abgleich. Die tatsächliche Wirkung hängt vom verbundenen Spielclient ab. Einen Run-Reset enthält diese Version nicht.

## Mehrere Spieler und Zufallsaktionen

Unter **Spielslots → Spieler bearbeiten** mehrere Slotnamen hinterlegen, optional als `Name | Spiel`. Diese Profile stehen bei der Raumverbindung und im YAML-Editor bereit. Tatsächliche Spielslots entstehen bei der Seed-Generierung und werden aus dem verbundenen AP-Raum übernommen. Eine TextOnly-Verbindung genügt für mehrere Zielspieler desselben Teams.

| Regelaktion | Pool |
| --- | --- |
| Zufällige Falle | Nur im jeweiligen Slot als „Zufall“ markierte Items |
| Zufälliges Item · gut oder schlecht | Alle für den Slot erlaubten Katalogitems |
| Zufallsaktion | Erlaubte Katalogitems und auf Wunsch zusätzlich DeathLink |
| Bestimmtes Item | Genau das eingetragene und erlaubte Item |
| DeathLink | Die aktivierte DeathLink-Gruppe des eigenen AP-Teams |

Als Ziel stehen ein Slot, mehrere ausgewählte Slots, alle geeigneten Slots oder ein zufälliger geeigneter Slot zur Verfügung. DeathLink bleibt eine Gruppenaktion; die Item-Zielliste begrenzt dessen Empfänger nicht. Die separate Gruppenfreigabe ist zusätzlich nötig. Jede Zufallsauswahl wird beim Anlegen des Auftrags festgeschrieben; späteres Warten würfelt nicht erneut.

## Räume und Verbindungen

Unter **Räume** einen Arbeitsbereich pro Run oder Spiel anlegen. Jeder Raum speichert eigene Regeln, Spielerprofile, YAML-Presets, Freigaben und Protokolle. Nur der oben gewählte Raum empfängt und verarbeitet neue Ereignisse. Gemeinsame APworlds und YAML-Vorlagen bleiben im Spielekatalog verfügbar. Im Ereignisprotokoll kann zusätzlich nach Spiel gefiltert werden.

AP-Verbindung, Admin-Anmeldung, Charity und Twitch werden nach erfolgreicher Einrichtung für diesen Raum gemerkt. Nach Neustart oder Raumwechsel werden die zuletzt aktiv verbundenen Quellen wieder verbunden. **Trennen** beendet auch deren automatische Wiederverbindung. Die Ausführung beginnt dabei pausiert im Testmodus.

AP-Passwörter bleiben maskiert in den Formularen stehen. Die Maske steht für die gespeicherten Zugangsdaten; neben dem Formular wird der wirkliche Admin-Status angezeigt. „Gespeicherte Passwörter vergessen“ beziehungsweise die entsprechende Twitch-Funktion entfernt die lokalen Zugangsdaten. Zugangsdaten werden verschlüsselt lokal gespeichert und nicht im Konfigurationsexport ausgegeben.

Die YAML-Option **`triggers`** in den Advanced Settings verändert Optionen **während der Generierung**. Sie empfängt keine Twitch-/Spendenereignisse. Ein später geändertes YAML verändert den bestehenden Seed nicht. Diese Bridge setzt Live-Ereignisse stattdessen in `Say`-Adminbefehle oder einen `Bounce` um.

## DeathLink

DeathLink ist eine eigene **Gruppenaktion**. Die Bridge sendet nur den Tag `DeathLink` an das eigene AP-Team und gibt **keine Einzelziel-Auswahl** vor. Eine Kombination aus Tags und Slotfiltern kann je Protokollversion größere Empfängergruppen erreichen; deshalb wird dieser Weg für einzelne Spieler nicht angeboten.

Für echte DeathLink-Aktionen muss unter **Spielslots** die Gruppenfreigabe für die aktuelle Sitzung aktiviert werden. Betroffen sein können alle verbundenen Clients mit aktiviertem DeathLink im eigenen Team – auch Slots, die in dieser Bridge keine Itemfreigabe haben. Unterstützt ein Spielclient DeathLink nicht oder ist es dort ausgeschaltet, entsteht dort kein entsprechender Effekt. Die Bridge ändert diese Einstellung nicht.

## Verarbeitung, Wiederanlauf und Status

- Start immer im **Testmodus**, pausiert und ohne DeathLink-Gruppenfreigabe. Zuletzt aktiv verbundene Quellen werden mit den lokal gespeicherten Zugangsdaten wiederhergestellt.
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

Der ursprüngliche Raum bleibt in `data/state.json`; weitere Räume liegen unter `data/rooms/<Raum-ID>/state.json`. `data/rooms.json` merkt den geöffneten Raum. `data/game-library.json` enthält importierte Vorlagen. Verschlüsselte Zugangsdaten liegen in `data/connections.enc`, der lokale Schlüssel in `data/connections.key`. Der Ordner wird beim ersten Start erstellt. Der Token des lokalen HTTP-Eingangs liegt in `data/integration-key.txt`. Zum Sichern eigener Einstellungen den geschlossenen `data`-Ordner kopieren; nicht öffentlich weitergeben, da er Integrationszugriff und Ereignisnamen enthalten kann.

Konfigurationsexport enthält keine Zugangsdaten. Beim Import werden Slotfreigaben neu aufgebaut; Live-Modus und DeathLink werden nicht importiert. Eine beschädigte Zustandsdatei wird nicht stillschweigend überschrieben.

```sh
npm test
npm run check
```

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
