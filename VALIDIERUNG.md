# Prüfung der Version 0.7.0

Ausgeführt unter Linux mit Node.js 24.19.0 und Python 3.12.14. Node.js ab 22 ist erforderlich. Vorbereitete APworld-Versionen funktionieren ohne Python; die statische Analyse bisher unbekannter Versionen benötigt Python ab 3.10.

## Windows-Fenster und Updates

Der Workflow `windows-desktop.yml` baut die x64-WinForms-EXE mit dem Windows-.NET-Framework-Compiler. WebView2 SDK **1.0.4314.35** und die portable Node-Laufzeit **24.19.0** werden anhand fester SHA256-Werte vorbereitet. Das vollständige Release enthält die gebauten Dateien unter `assets/windows`; Quellcodepakete enthalten deren Bauanleitung und Quellen.

Der Integrationstest startet ein echtes WebView2-Fenster und lädt die Bridge. Er generiert eine Factorio-YAML über die Oberfläche, prüft den Dateidownload, schließt das Fenster in den Tray und öffnet es wieder. Ein zweiter Start verwendet die vorhandene Instanz. Anschließend ersetzt ein Update sowohl die EXE als auch die portable Node-Laufzeit, startet das Fenster neu und prüft erhaltene Regeln und Raumdaten. Ein weiterer Start über `server.mjs` deckt den Einstieg älterer Updater ab. Die Release-Veröffentlichung hängt von diesem erfolgreichen Windows-Test ab.

## Automatisierte Prüfungen

**159 Tests** über `npm test` führen die echten Module, HTTP-Routen, Formularhandler in JSDOM und lokale WebSocket-Gegenstellen aus.

| Bereich | Prüfumfang |
|---|---|
| Regeln und Versand | Ereignisse, Deduplizierung, Limits, Cooldowns, Pause, Notaus, Testmodus, persistierte Aufträge und AP-Protokoll |
| Live-Oberfläche | Unveränderte DOM-Knoten bei periodischer und SSE-Aktualisierung, offene Dialoge und Bereiche, fokussierte Dropdowns, ungespeicherte Spieler und Verbindungen sowie Suchfilter im YAML-Editor |
| Twitch-Kanäle | Zwei echte lokale EventSub-WebSocket-Gegenstellen, unabhängige Anmeldung und Trennung, falsches Konto abweisen, identische Ereignis-IDs verschiedener Broadcaster, kanalbezogene Regeln, Herkunft im Auftrag, parallele OAuth-States, Raumwechsel, verschlüsselte Persistenz und Wiederverbindung nach Neustart |
| Verbindungen | Maskierte und verschlüsselte Zugangsdaten, AP-Wiederverbindung, Twitch-Code-Flow, Tokenwechsel, Refresh und Origin-Schutz |
| Programmupdates | Versionsvergleich, Token ohne Weitergabe bei Redirects, SHA-256, ZIP-Pfade, vollständiges Manifest, erhaltene Räume und eigene APworlds, Sicherungen, Rücknahme bei Schreibfehlern, echter Neustart und Rückkehr zu Programm und Daten der vorherigen Version bei Startfehlern |
| Raumarchiv | Archivieren des geöffneten Raums mit Wechsel, Wiederherstellung nach Neustart, erhaltene Regeln, Historie und Zugangsdaten |
| Löschen | Exakte Namensbestätigung, eigene Raumdateien und Zugangsdaten entfernen, gemeinsame Daten erhalten, kein Wiederanlegen des gelöschten Standardraums |
| APworlds | CRC-Prüfung, Pfade, Größenbegrenzung, rekursive Ordner, Vorrang eigener APworlds, Windows-Archivpfade, getrennter manueller YAML-Import, passende Metadaten-Hashes unabhängig von Dateiname und Ordner, HTTP-Upload aller sieben Nutzerdateien ohne Python, keine Ausführung des World-Codes |
| AST-Analyse | Modulbereiche, Import-Aliase, Konstanten, gleichnamige Klassen, Choice, TextChoice, NamedRange, dynamische Standards und Manifest-Fallback |
| Spielerziele | Einzelperson, alle, markierte Gruppe oder Zufall aus der Auswahl; nur freigegebene eigene Team-Slots; gespeicherte Profil-IDs beim Bearbeiten erhalten |
| YAMLs | Separate Spielerdateien, Slotvalidierung, gewichtete Zusatzoptionen, skalare Sammlungs-Presets und Zufallsbereiche |
| Design und Alerts | Kontraste für neutrale, helle und getönte Modi einschließlich freier Randfarben; globale Designpersistenz, getrennte Raum-Alerts, Medienupload, Vorschau ohne AP-Aktion, keine historischen Alerts, Reihenfolge und Raumwechsel |
| Neue Aktionen | Eigene Itempools, Ausschluss markierter Fallen, gleichverteilte Auswahl möglicher Aktionsarten, Chat-Präfix gegen Befehlsausführung, Hint-Befehl und reine Alerts ohne AP-Verbindung |
| Oberfläche | Regelerstellung trotz benanntem id-Feld, Katalogsuche, Mehrspieler-Vorschau, Raumarchiv, Löschbestätigung, eigene Range-Werte, Plus-Spielerzeilen und Zufallsziel aus einer gespeicherten Gruppe |

`npm run check` prüft die JavaScript-Syntax, JSON-Dateien, HTML-Verweise und vorhandene Laufzeitpakete.

## Prüfung des APworld-Bestands

Der vollständige Lauf prüfte **768 APworld-Dateien**, **784 World-Varianten** und den Standardwert-Export für **760 Spielnamen**, ohne Validierungsfehler. Nur APAPI bleibt als Hilfsbibliothek ohne eigenes Spiel separat aufgeführt. Donkey Kong 64 und Spirit Tracks sind nun erkannt; FNF weist auf den unterstützten Engine-Export hin. Der Fall wird ohne verfügbaren Python-Interpreter geprüft.

`npm run validate:worlds` prüft Herkunft und SHA-256 jeder Datei, den Laufzeit-ZIP-Leser und den YAML-Export der statisch erkannten Standards jeder World-Variante. Das Ergebnis steht in `assets/apworld-validation.json`. Erkannte und teilweise dynamische Einstellungen sowie Importfehler stehen in `APWORLDS-MANUELL.md`.

Der Bestandsprüfer führt keine APworld-Module aus und generiert keinen Archipelago-Seed. Dynamische Felder bleiben ausdrücklich offen. Eine erfolgreiche YAML-Ausgabe belegt keine Kompatibilität einer beliebigen World-Version mit einer beliebigen Archipelago-Installation.

## Große Worlds und Battle for Bikini Bottom

Die unveränderte **BfBB 1.2.5** hat 79.701.854 Bytes und enthält unkomprimiert rund 119 MB, darunter native Client-Bibliotheken. Geprüft wurden der echte Upload über HTTP, ein Scan aus einem eigenen Ordner, ein umbenannter Dateiname und YAMLs für zwei Spieler ohne Python-Aufruf. Die Oberfläche prüft dieselbe Archivgrenze wie Server, statischer Cache-Builder und Downloader. Grenztests prüfen maximal 128 MiB pro Archiv, 512 MiB deklarierte entpackte Daten, 8 MiB je ausgewählter Quelldatei und zusammen 32 MiB Quelltext. Nicht benötigte Binärdateien werden beim Metadatenlesen nicht entpackt oder ausgeführt.

Standard-YAML und geänderte Optionen wurden zusätzlich mit **Archipelago 0.6.7** und der originalen BfBB-APworld durch `Generate.roll_settings` geprüft. Beide akzeptiert; **23 reale Optionsklassen** verarbeitet, 22 Formularfelder statisch erkannt. Kein vollständiger Seed, kein ROM-Patch und kein Dolphin-Client wurden gestartet. Ergebnis: `assets/bfbb-validation.json`.

## Prüfgrenzen

- Kein echter Twitch-Konto-Login, keine Spende und kein echter Spieleffekt wurden ausgelöst.
- Die neuen Oberflächenabläufe wurden mit JSDOM und der echten lokalen API geprüft. Diese Version wurde nicht zusätzlich in einem interaktiven Chromium-Browser geprüft.
- Der Release-Workflow führt die automatisierten Tests zusätzlich unter Windows und Linux aus. Das manuelle Öffnen der Windows-Startdatei wurde hier nicht geprüft.
- Die 55 vorbereiteten Core-Spiele setzen für die Generierung Archipelago 0.6.8 voraus. Änderungen in anderen Core-Versionen werden nicht automatisch übernommen.
- APworld-Import erzeugt keine universellen Live-Aktionen und keine Run-Reset-Funktion.

## YAML-1.1- und Platin-Prüfung

Alle **803 APworld-Varianten und 55 Core-Worlds** wurden exportiert und sowohl mit dem YAML-1.1-Leser der JavaScript-Bibliothek als auch mit **PyYAML 6.0.3** erneut gelesen. Sämtliche Werte, Schlüssel und Datentypen wurden mit den Exportdaten verglichen: keine Abweichungen. `npm run validate:worlds -- --pyyaml` reproduziert diese Prüfung; dazu Python mit PyYAML installieren (`python -m pip install PyYAML==6.0.3`). Die normale Bridge benötigt PyYAML nicht.

Pokémon Platin wurde zusätzlich mit dem unveränderten **Archipelago 0.6.7** (Commit `debe4cf035c7c15efe6fb95f72343af0d420c68c`) und der mitgelieferten **APworld 0.2.2** geprüft. Archipelagos `Generate.roll_settings` und `PokemonPlatinumOptions.validate` akzeptieren die Standarddatei sowie zwei Varianten mit geänderten Optionen. Jeweils **99 reale Optionsklassen** wurden verarbeitet. Der vorherige Export scheiterte nachweislich an `hm_reader: no`, das PyYAML als `false` statt als Auswahltext interpretierte. Ergebnis und APworld-Prüfsumme stehen in `assets/pokemon-platinum-validation.json`.

Die vollständige Prüfung aller Worlds umfasst YAML-Format und Datentypen; sie ist keine Seed-Generierung für sämtliche Spiele. Laufzeitabhängige Optionen, benutzerdefinierte Zusatzoptionen, ROM-Ausgabe und Spielclients müssen mit der jeweils passenden APworld geprüft werden. Der produktive Katalogimport bleibt statisch und führt keinen World-Code aus.

Für eine gezielte Entwicklerprüfung kann `scripts/validate_archipelago.py --archipelago PFAD_ZUM_AP_QUELLCODE --apworld DATEI.apworld Spieler.yaml` verwendet werden. Dieser ausdrückliche Prüfaufruf importiert die ausgewählte APworld und benötigt deren passende Python-Laufzeitpakete.

## Sieben Nutzer-APworlds in 0.3.2

Die sieben bereitgestellten Archive wurden unverändert per SHA-256 zugeordnet. Fünf waren bereits identisch enthalten; KH3 0.16.11 und Bloons TD6 0.8.2 wurden ergänzt. Bloons 0.8.3 bleibt verfügbar. Pro Spiel gibt es einen Katalogeintrag; eine eigene World im Hauptordner hat Vorrang.

Für alle sieben wurden frische Kopien in einem fremden Ordner und umbenannte Dateien eingelesen sowie echte HTTP-Uploads ausgeführt. Die Tests sperren den Python-Aufruf ausdrücklich: Scan, Neustart, Upload und YAML-Export funktionieren trotzdem. Ein anderer Dateiinhalt darf keine Metadaten eines bekannten Dateinamens übernehmen.

Zusätzlich wurden Standard-YAML und eine geänderte Konfiguration jeder World mit dem echten **Archipelago 0.6.7** und exakt der hochgeladenen APworld geprüft. `Generate.roll_settings` führt auch die `verify`-Methoden der Optionsklassen aus; anschließend wird eine vorhandene `options.validate()` aufgerufen. Alle **14 YAML-Dateien** wurden akzeptiert. Ergebnis, Versionen und Hashes: `assets/uploaded-worlds-validation.json`.

| Spiel | World-Version | Optionsklassen pro YAML | Ergebnis |
|---|---|---:|---|
| Bloons TD6 | 0.8.2 | 43 | Standard und geändert akzeptiert |
| Cyberpunk 2077 | 0.7.0 | 49 | Standard und geändert akzeptiert |
| Kingdom Hearts III | 0.16.11 | 113 | Standard und geändert akzeptiert |
| Minecraft | 2.2.0 | 27 | Standard und geändert akzeptiert |
| Pokemon Platinum | 0.2.2 | 99 | Standard und geändert akzeptiert |
| Ratchet & Clank 2 | nicht im Manifest angegeben | 27 | Standard und geändert akzeptiert |
| The Binding of Isaac Repentance | 0.4.3 | 52 | Standard und geändert akzeptiert |

Geänderte Konfigurationen aktivieren DeathLink; Platin verwendet zusätzlich `hm_reader: precollected` und die DeathLink-Gruppe `Chaos`. Für Bloons und Isaac wurde zusätzlich eine Trap-Gewichtung geändert. Die Prüfungen generieren keine vollständigen Seeds oder ROM-Ausgaben und starten keine Spielclients.

Nach der Umstellung auf öffentliche Sichtbarkeit wurden die Release-Abfrage und der binäre Download über den echten Updater **ohne Token** mit HTTP 200 geprüft.

Das vollständige ZIP wurde mit dem echten Update-Entpacker und Dateimanifest geprüft und die entpackte Bridge gestartet. Mit einem absichtlich ungültigen Python-Pfad lud ein fremder APworld-Ordner alle sieben Nutzerdateien, erzeugte YAMLs und blieb im Testmodus mit pausierter Ausführung.

## Core-Integration 0.5.0

**55 zusätzliche Core-Spiele, 1.978 Felder und 815 Katalogspiele insgesamt.** Die Metadaten stammen aus Archipelago **0.6.8**, Commit `54803be064fc7e80c4628777ed0b46a9390f255f`. Sie werden beim Entwickler-Build mit den echten Optionsklassen erzeugt; beim Start und Einlesen führt die Bridge keinen Core- oder APworld-Code aus. Ein eigener APworld-Ordner, Neustart und Überschreiben/Entfernen einer Core-World durch eine eigene APworld sind geprüft. Reine YAML-Vorlagen bleiben ausgeschlossen.

**110 YAML-Konfigurationen** – Standard und eine geänderte Toggle-Option pro Spiel – wurden über `npm run validate:core -- --archipelago PFAD` mit den echten `Generate.roll_settings`-, `Option.verify`- und vorhandenen Dataclass-Validatoren akzeptiert. Factorios `world_gen` und StarCrafts `custom_mission_order` behalten dabei das ursprüngliche Eingabeformat; interne bereits umgewandelte Optionswerte würden beim zweiten Einlesen scheitern. Ergebnis: `assets/core-worlds-validation.json`. Die Erzeugung wurde mit unterschiedlichen Python-Hash-Seeds identisch reproduziert. Der Release-Workflow wiederholt Aufbau und Optionsprüfung vor dem Veröffentlichen.

Der allgemeine Bestandslauf umfasst **839 YAML-1.1-/PyYAML-Roundtrips**, einschließlich der 55 Core-Worlds. Die Core-Prüfung bestätigt Optionsannahme; sie erzeugt keine vollständigen Seeds oder ROM-Patches und startet keine Spielclients.

**Spirit Tracks 0.8.4:** Standard und geänderte YAML wurden zusätzlich mit der originalen APworld und Archipelago 0.6.8 durch `Generate.roll_settings` akzeptiert, jeweils 91 reale Optionstypen. **Donkey Kong 64:** 100 Felder werden statisch erkannt; die vollständige World wurde für diese Prüfung nicht importiert. **Friday Night Funkin 2.3.1:** 46 Felder einschließlich kopierter Standard-Songliste, Textauswahl und Trap-Gewichtung erkannt. Die Upstream-World fordert bei Initialisierung interaktive Eingaben und verlangt unterstützte YAMLs aus der Mixtape Engine; ein vollständiger FNF-Seed wurde hier nicht validiert. Diese Grenze steht in der Spieloberfläche und Anleitung.

## Paketprüfung 0.5.1

Der echte Download von 0.5.0 wurde korrekt per SHA-256 geprüft, aber vor der Installation wegen der neuen Hauptordner-Datei `FEHLENDE-SPIELE.md` abgewiesen. 0.5.1 verlagert sie im Laufzeitpaket in den erlaubten Ordner `assets`; Quellcode-Paket und GitHub-Liste behalten den bisherigen Pfad. Der Paketbau prüft nun das vollständige Manifest mit `validateManifest`. Ein Integrationstest baut ein echtes Paket, entpackt es über `extractRelease`, prüft alle Hashes und verifiziert die Zurückweisung unbekannter Hauptordner-Dateien.

## Spielsuche 0.5.2

Die beiden neuen Regressionstests scheitern mit der vorherigen Oberfläche, weil `df` bei einer Aktualisierung zu einer leeren Zeichenfolge wird. Mit dem Fix bleiben Suchtext und gefilterte Treffer beim tatsächlichen 15-Sekunden-Callback erhalten, sowohl bei fokussiertem Suchfeld als auch nach Verlassen des Felds. Fokus und Textauswahl werden über den Neuaufbau hinweg wiederhergestellt. Ein absichtlich verzögerter Katalogabruf prüft zusätzlich den erzwungenen Neuaufbau während der Suche und behält 60 bereits angezeigte Treffer. Die Rückkehr aus einer Spielseite erhält den Filter; bewusstes Leeren und erneutes Suchen setzt die Anzahl wieder auf 24 Treffer zurück. Die Tests verwenden die echten UI-Handler und HTTP-Routen in JSDOM.

## Neue Nutzerdateien 0.5.3

**33 neue Spiele, 801 APworld-Dateien, 848 Katalogspiele insgesamt.** Alle neuen Dateien werden mit gesperrtem Python-Aufruf aus einem fremden Ordner unter anderen Dateinamen eingelesen. Standardwerte und geänderte Werte werden für zwei Spieler exportiert und erneut gelesen. Grandia (44.783.053 Bytes) und Metroid: Samus Returns (33.940.240 Bytes) stimmen exakt mit den angehängten Originalen und den festgelegten öffentlichen Release-Prüfsummen überein. Der Entwickler-Build bereitet diese großen Dateien vor; das vollständige ZIP enthält sie bereits.

Made in Abyss wurde aus dem Nutzerordner ohne .pyc-Dateien gepackt. Crash 3 verwendet ausschließlich die World-Dateien des festgelegten Commits `c24e490df153c610fded9b4c69d6fe2cb70cfa2a`. LEGO Harry Potter 5–7 und Codename: Kids Next Door wurden als Original-APworlds ergänzt. Quellen und Einzeldatei-Hashes: `assets/user-world-sources.json` und `assets/apworld-downloads.json`. Reine YAML-Dateien und Clientprogramme erzeugen keinen Katalogeintrag.

Die Parserkorrektur liest ältere Optionswörterbücher einschließlich importierter `option_definitions`, begrenzte deklarative Comprehensions und DeathLink-Mixins. Entfernte Optionen erscheinen nicht als Eingabefelder. Archivierte alte Clientquellen erzeugen keine falschen Spiele; identische geerbte World-Deklarationen werden zusammengeführt. Gegenüber dem bisherigen Bestand ging kein Spiel und kein bisher erkanntes Optionsfeld verloren.

**66 Konfigurationen aller 33 Ergänzungen** wurden mit Archipelago 0.6.8 akzeptiert: je Standard und ein geänderter Wert. `scripts/validate_user_worlds.py` lädt ausschließlich ausdrücklich geprüfte, per SHA-256 festgelegte Optionsmodule und erforderliche Datendeklarationen. Die Original-Optionsdataclass wird vorübergehend bei `Generate.roll_settings` registriert, anschließend folgen `Option.verify` und ein vorhandener Dataclass-Validator. Die eigentlichen World-Initialisierungen und Clients werden dabei nicht geladen. Für das ältere Space-Engineers-Wörterbuch werden die ursprünglichen Optionstypen in einer temporären Dataclass geprüft. Das bestätigt deren YAML-Eingaben, jedoch keine vollständige World-Kompatibilität oder Seed-Generierung; dieser Unterschied wird im Editor angezeigt. Ergebnisse: `assets/user-worlds-validation.json`; reproduzierbar mit `npm run validate:user-worlds -- --archipelago PFAD` und den Entwicklerabhängigkeiten aus `scripts/requirements-core-cache.txt`. Die normale Anwendung führt diesen Prüfcode nicht aus.

Der vollständige Bestandslauf bestätigt **858 YAML-1.1-/PyYAML-Roundtrips ohne Abweichungen**. Die 55 Core-Spiele wurden weiterhin mit 110 echten Optionskonfigurationen geprüft. APAPI bleibt als Hilfsbibliothek separat übersprungen. Die aktualisierte Liste nennt noch 18 Spiele ohne passende World-Datei.

## Manueller YAML-Import 0.6.0

Die bereitgestellte Peliarch-Datei `examples/elden-ring-peliarch.yaml` wird unverändert als Test- und Beispielvorlage mitgeliefert. Der Import erkennt **91 Einstellungen**, einschließlich zusätzlicher Felder, Gewichte und Sammlungseinstellungen. Ein Standardexport für zwei Spieler wird mit JavaScript-YAML 1.1 und PyYAML 6.0.3 gegen die eingelesenen Werte geprüft. `off`, `on`, `no`, Datumszeichenfolgen und exponentielle Zahlen behalten die erwarteten Datentypen. Kommentare und Top-Level-Metadaten bleiben erhalten; Slotname und Anzahl werden gezielt für die einzelnen Spielerdateien angepasst.

Die Tests prüfen geänderte Dropdowns, Zahlenbereiche, DeathLink, Trap-Gewichte, freie Zusatzfelder, YAML-Aliase und Merges, explizite Sets, Minimaldateien und mehrere Spieler-Dokumente. Eine gleichnamige APworld mit absichtlich anderen Feldern bestätigt, dass fremde World-Defaults nicht in die YAML gelangen. Neustart, geänderter APworld-Ordner, Quellenauswahl und Presets pro Raum, identische umbenannte Uploads und Entfernen von Vorlagen sind geprüft. Fehlende Spielnamen, ungültiges YAML, doppelte Schlüssel, unbekannte Tags, unsichere Schlüssel, übergroße Dateien und mehrdeutige Spielauswahl werden vor dem Speichern abgewiesen.

Der JSDOM-Test bedient die echte Dateiauswahl, importiert die vollständige Peliarch-Datei über die lokale API, bearbeitet die Dropdowns, speichert zwei Spielernamen und erstellt eine YAML-Vorschau. Er wechselt anschließend zur absichtlich anderen APworld und zurück: Beide Quellen behalten ihre eigenen Werte und Raum-Voreinstellungen. Das Entfernen stellt die verbleibende APworld-Quelle wieder her. Der Python-Aufruf wird für diese YAML-Abläufe ausdrücklich gesperrt.

Dies bestätigt Dateiimport, Wertübernahme und YAML-Format. Es ist **keine Prüfung aller Peliarch-Optionen mit einer konkreten Peliarch-APworld und keine Elden-Ring-Seed-Generierung**. Eindeutige `Values:`-Kommentare sind Eingabehilfen, keine vollständige World-Spezifikation. Die passende World und ihre Laufzeitbedingungen bleiben für den Generator erforderlich.

## Katalogeinträge 0.6.1

Der erweiterte JSDOM-Test enthält gleichzeitig `EldenRing` als APworld und `Elden Ring` als importierte Peliarch-Vorlage. Beide müssen bei der Suche nach `elden` mit ihrer exakten Spiel-ID erscheinen. Die vorherige Normalisierung führte beide zu einem Eintrag zusammen; der Test scheitert mit 0.6.0. Die Suche bleibt tolerant gegenüber Leerzeichen und Satzzeichen, die Katalogidentität verwendet die unveränderte Spiel-ID.

## Eingabehilfen 0.6.2

Die echte Peliarch-Vorlage liefert sieben dokumentierte Vorschläge für `traps`, einschließlich der 20-Sekunden-Beschreibung für `no_flask`. Der neue Modelltest prüft diese Hinweise sowie freie und geordnete Listenwerte. Die Vorschläge ändern weder den JSON-Optionstyp noch die zulässigen benutzerdefinierten Eingaben.

Zwei zusätzliche JSDOM-Tests prüfen einzelne Häkchen, Zähler, eigene Texte, Deduplizierung, leere Listen, erhaltene Reihenfolge und eigene Werte in APworld-Sets. Die echten Vorschau- und Speicher-Routen übernehmen die ausgewählten Werte. Formatbeschreibungen für Text, Listen und Wörterbücher sowie dokumentierte Schlüssel werden geprüft. Es werden keine zusätzlichen Falleneffekte implementiert und keine Spielclients gestartet.

## Regeln und Eingabehilfen 0.7.0

Neue Räume haben keine Beispielregel. Die Migration entfernt ausschließlich das alte unveränderte, unbenutzte Beispiel; bearbeitete, normalisiert gespeicherte oder bereits verwendete Regeln bleiben erhalten. Charity-, Twitch- und manuelle Auslöser zeigen passende Felder. Ausgeblendete Betragsschwellen und Belohnungsfilter werden serverseitig normalisiert, damit frühere Eingaben die aktuelle Plattformregel nicht unbemerkt blockieren.
