# 0.7.5 – Direkt bedienbare Regeln, ruhige Oberfläche und Downloads

- Regeln direkt auf den Karten in Übersicht und Regelseite per Schalter aktivieren/deaktivieren. Noch wartende Live-Aufträge deaktivierter Regeln werden verworfen; offene Entwürfe bleiben erhalten.
- YAMLs, Mehrspieler-ZIPs und JSON-Exporte im eigenen Windows-Fenster ohne Speichern-Dialog oder Downloadverlauf im tatsächlichen Downloads-Ordner speichern. Gleichnamige Dateien erhalten einen Zähler und werden nicht überschrieben.
- Unveränderte Statusabfragen verändern weder Seiteninhalt noch Design oder Kopfzeile. Verspätete ältere Antworten überschreiben keine neueren Daten. Native Hintergrundfarbe folgt dem gewählten Design und vermeidet weiße Zwischenbilder.
- Twitch steht in den Verbindungen vor Charity Royale. Direkte Buttons für JSON-Export, Import und Kopieren aus anderen Räumen auf der Regelseite.
- Moduswechsel startet die Verarbeitung unmittelbar; kein zusätzlicher Klick auf „Ausführung starten“. Start und Raumwechsel bleiben im Testmodus. Explizite Pausen, Notaus und unklare Zustellungen bleiben beachtet.
- DeathLink-Freigabe der Bridge ist standardmäßig eingeschaltet und wird pro Raum gespeichert. Die Option im Spielclient bleibt erforderlich. Beim ersten Update werden die alten, bei jedem Start zurückgesetzten Flags einmal auf die neuen Standards umgestellt.
- Kanalpunkte-Belohnungen mit Titel, Preis, Beschreibung, Farbe, Abklingzeit und optionaler Zuschauernachricht direkt aus der Bridge in Twitch anlegen. Ein zusätzlicher Dialog erhält offene Regelentwürfe und übernimmt die neue Belohnung automatisch. Getrennte Kanalwahl und OAuth-Freigabe mit channel:manage:redemptions.
- „Alle Abos“ bündelt neue Abos, geteilte Resubs und Geschenk-Abos. Fehlende Abo-EventSub-Typen werden beim Speichern auf der bestehenden Verbindung ergänzt. Geschenkempfänger werden nicht zusätzlich zum Paket gezählt. Stille Verlängerungen ohne Twitch-Ereignis werden ausdrücklich erklärt.
- Regeln einzeln auswählen und als JSON exportieren, als gemeinsame Vorlage speichern sowie aus anderen Räumen, archivierten Räumen, Vorlagen und Dateien übernehmen. Vorlagen überstehen Neustarts und das Löschen ihres Ursprungsraums.
- Importierte Regeln beginnen inaktiv, erhalten neue IDs und übernehmen keine Verbindungen oder Slot-Freigaben. Spieler- und Kanalidentitäten werden zugeordnet; ungeklärte Zuordnungen blockieren die Aktivierung bis zur Prüfung. Die Vorschau bleibt beim Import unverändert, auch bei Dateien ohne Regel-IDs.
- Neue Aktion „Zufälliger Hinweis aus allen erlaubten Items“, auch im Zufallsaktions-Mix. Je Zielspieler ein zufälliges, freigegebenes Item aus seinem eigenen Raumkatalog; Versand über den bestehenden AP-Admin-Hinweis, ohne zusätzliche Items.
- Enthält den Tray-Fix aus 0.7.1 einschließlich nativer Sichtbarkeitsprüfung und Wiederherstellung der normalen Fensterposition.

# 0.7.1 – Fenster zuverlässig aus dem Tray öffnen

- Beim Minimieren konnte Windows die Position des ausgeblendeten Fensters als -32000/-32000 melden. Die letzte normale Fensterposition wird nun separat gespeichert und erst nach dem nativen Wiederherstellen gesetzt. Der Fenster-Handle und der WebView2-Verbund bleiben erhalten.
- Wiederherstellung hebt Minimieren und Ausblenden direkt über Windows auf, setzt den Fokus und holt ein außerhalb der sichtbaren Bildschirme liegendes Fenster zurück. Maximierte Fenster behalten ihren Zustand.
- Fenstergröße beim Start auf den verfügbaren Bildschirm begrenzen.
- Windows-Test um zehn Tray-Zyklen, erhaltenen Fenster-Handle und Oberflächenzustand, sichtbare native Fenster, maximierte Fenster und Bildschirmwechsel ergänzt.

# 0.7.0 – Eigenes Windows-Fenster, Tray und mehrere Twitch-Kanäle

- Windows-Vollpaket mit eigener EXE, eingebetteter WebView2-Oberfläche und portabler Node-Laufzeit. Schließen/Minimieren legt die Bridge in den Tray; dessen Menü öffnet oder beendet sie. Kein dauerhaftes Node-Konsolenfenster. Der erste Start über Start.cmd legt die EXE im Hauptordner an.
- Desktop-Updates warten auf Fenster und Hintergrunddienst. Der Installationshelfer verwendet eine eigene Laufzeitkopie, damit die portable node.exe ersetzt werden kann. Automatischer Fenster-Neustart und Kompatibilität mit älteren server.mjs-Updatern werden unter Windows geprüft.
- Bis zu 20 getrennte Twitch-Kanäle pro Raum, je Kanalname, Client-ID, Ereignisauswahl, Autorisierung, verschlüsselten Zugangsdaten und Wiederverbindung. Kanalfilter in Regeln, @Kanal im Protokoll und Nachrichtenvariable {channel}. Jeder Kanal benötigt seine eigene Twitch-Freigabe.
- Datenaktualisierungen gleichen bestehende Elemente ab. Dropdowns, Dialoge, offene Bereiche, Suchfilter und ungespeicherte Formulare bleiben erhalten; Statusdaten werden weiter aktualisiert.
- Regeln sind in neuen Räumen leer. Nur das exakt unveränderte und unbenutzte alte Beispiel wird entfernt; eigene Regeln bleiben erhalten.
- Regeln zeigen passende Auslöserfelder: Spendenbetrag für Charity; Subs, Resubs, Geschenkpakete, Bits und Kanalpunkte für Twitch, einschließlich benannter Belohnungen oder eigener ID. Versteckte, unpassende Schwellen werden beim Speichern gelöscht.
- Kurze, abbrechbare Feldübergänge mit Rücksicht auf reduzierte Bewegung. Neue Regressionsprüfungen für Drafts, Kanäle und Ereigniszuordnung.

# 0.6.2 – Mehrfachauswahl und verständliche Wertehinweise

- Dokumentierte YAML-Listen und bekannte APworld-Set-Werte als aufklappbare Mehrfachauswahl mit einzelnen Häkchen anzeigen. Beschreibungen der Einträge bleiben sichtbar; eigene Werte sind zeilenweise möglich.
- Die sieben Fallen aus der Peliarch-Vorlage lassen sich ohne JSON-Eingabe auswählen. Listenhinweise sind Vorschläge, keine erfundene vollständige Werteliste. Vorhandene eigene Werte, Listenreihenfolge und leere Listen bleiben erhalten.
- Freie Felder nennen Eingabeformat, Vorlagenwert und vorhandene Schlüssel- oder Wertelisten. Fehlende Wertehinweise werden ausdrücklich erklärt.
- Anleitung zum Ablauf Bridge-Raum → Spieler-YAMLs → Archipelago-Seed und Serverraum ergänzt. Die tatsächlich implementierten zwei Fallen in KH3 0.16.11 und ACWW 0.1.1 sowie die Slot-Freigabe erklärt.

# 0.6.1 – Unterschiedliche Elden-Ring-Worlds sichtbar halten

- `EldenRing` und `Elden Ring` bleiben eigene Katalogeinträge. Die tolerante Suche darf unterschiedliche Spiel-IDs nicht zu einem Eintrag zusammenfassen.
- Anleitung für die Peliarch-YAML ergänzt. Import, Kommentare, 91 Einstellungen und Mehrspieler-Export aus 0.6.0 bleiben erhalten.

# 0.6.0 – Spieler-YAMLs importieren und bearbeiten

- `.yaml` und `.yml` direkt über **Spielekatalog → + APworld / YAML hinzufügen** importieren. Das funktioniert ohne Python und ohne eine in der Bridge lesbare APworld.
- Alle enthaltenen Spieleinstellungen bleiben bearbeitbar. Eindeutige Auswahlwerte und Zahlenbereiche aus Kommentaren werden zu Dropdowns; andere Werte bleiben Texte, Zahlen oder JSON. Die bereitgestellte Peliarch-YAML umfasst 91 Felder.
- Kommentare, Zusatzfelder, Metadaten, gewichtete Einstellungen, Werte aus Aliasen und Sammlungen bleiben beim Export erhalten. Texte wie `off`, `on` und `no` bleiben unter YAML 1.1 Texte. Mehrspieler-Export und YAML-Vorschau sind weiterhin möglich.
- Mehrere YAML-Vorlagen und APworlds desselben Spielnamens sind getrennte Einstellungsquellen. Eigene Raum-Voreinstellungen bleiben pro Quelle erhalten. APworld-Defaults einer anderen Implementierung werden nicht untergemischt.
- Vorlagen bleiben bei Neustart und Ordnerscan gespeichert, die Quellenauswahl gilt pro Raum. Importierte Vorlagen lassen sich wieder entfernen. Mehrere Dokumente je Datei werden getrennt übernommen; ungültige Imports ändern den Bestand nicht.
- YAML-Import ersetzt keine passende World im Archipelago-Generator. Kommentare sind Eingabehilfen; sie bestätigen weder sämtliche Optionen noch eine vollständige Seed-Generierung.

# 0.5.3 – Neue APworlds und Importkorrekturen

- 33 weitere Spiele aus den Nutzerdateien und dazugehörigen World-Quellen vorbereitet; insgesamt 848 Katalogspiele. Alle neuen Versionen funktionieren auch umbenannt oder in eigenen Ordnern ohne Python.
- Grandia und Metroid: Samus Returns unverändert enthalten. Große Originaldateien werden beim Entwickler-Build aus festgelegten öffentlichen Releases mit exakten Größen und SHA-256-Prüfsummen vorbereitet; der fertige Download enthält sie bereits.
- Made in Abyss aus dem hochgeladenen World-Ordner gepackt. Crash 3 aus festgelegtem World-Quellstand gebaut; LEGO Harry Potter 5–7 und Codename: Kids Next Door als Original-APworld ergänzt. Reine YAML-Vorlagen und Clients erscheinen weiterhin nicht als Spiele.
- Ältere option_definitions-Wörterbücher, deklarative Trap-Gewichtungen und DeathLink-Mixins unterstützt. Entfernte Optionen und archivierte alte Clients erzeugen keine falschen Felder oder Spiele mehr. Worlds mit ausschließlich Standardoptionen erhalten keine falsche Warnung.
- Standards und geänderte YAMLs aller 33 Ergänzungen mit den originalen Optionstypen und Archipelago 0.6.8 geprüft: 66 akzeptierte Konfigurationen, ohne vollständige Seeds oder Spielclients. Space Engineers benötigt zum Generieren weiterhin eine zur älteren World passende Archipelago-Version.
- Fehlende-Spiele-Liste und Importstatus aktualisiert.

# AP Chaos Bridge 0.5.2

Die Spielsuche bleibt bei der automatischen Statusaktualisierung erhalten. Bisher wurde der Katalog alle 15 Sekunden neu aufgebaut und dabei Suchtext und Trefferliste zurückgesetzt. Auch eine verzögert geladene Katalogantwort konnte die Suche löschen.

- Suchtext, gefilterte Treffer und bereits über „Weitere Spiele anzeigen“ erweiterte Ergebnisse bleiben bei Aktualisierungen und bei der Rückkehr aus einer Spielseite erhalten.
- Ein aktives Suchfeld behält Fokus und Textauswahl; die Eingabe springt nicht an den Anfang. Status und Verbindungen werden weiterhin aktualisiert.
- Zwei Regressionstests reproduzieren das bisherige Löschen von `df` und prüfen den echten 15-Sekunden-Callback, den verspäteten Katalogabruf, Fokuswechsel, Navigation und bewusstes Leeren der Suche. **125 Tests** erfolgreich.

Unter **Updates → Nach Updates suchen → Herunterladen & prüfen → Update installieren** auf **0.5.2** aktualisieren.

---

# AP Chaos Bridge 0.5.1

- Paketierung für bestehende Updater korrigiert: Die Liste der fehlenden Spiele liegt im vollständigen ZIP unter `assets/FEHLENDE-SPIELE.md`. Auf GitHub bleibt sie direkt im Repo erreichbar. Der bisherige Updater verweigerte 0.5.0 wegen dieser neuen Datei im Paket-Hauptordner, bevor Programmdateien geändert wurden.
- Der Paketbau prüft nun jedes Dateimanifest mit den tatsächlichen Update-Pfadregeln vor der Veröffentlichung. Ein Integrationstest baut ein echtes ZIP, entpackt und verifiziert es mit dem Updater und weist unbekannte Hauptordner-Dateien zurück.
- Alle Funktionen aus 0.5.0 bleiben enthalten: **55 Core-Spiele**, 1.978 Felder, Donkey Kong 64 und Spirit Tracks sowie FNF-Hinweise. **123 Tests**, 110 akzeptierte Core-YAML-Konfigurationen und 839 YAML-Roundtrips.

Unter **Updates → Nach Updates suchen → Herunterladen & prüfen → Update installieren** auf **0.5.1** aktualisieren. Falls 0.5.0 bereits manuell installiert wurde, 0.5.1 über das vollständige ZIP ersetzen und `data` beibehalten. Alternativ **AP-Chaos-Bridge-v0.5.1.zip** verwenden. Räume und eigene Daten bleiben erhalten. Core-YAMLs sind für **Archipelago 0.6.8** vorbereitet.

---

# AP Chaos Bridge 0.5.0

- **55 Core-Spiele** direkt im Katalog: **1.978 Einstellungsfelder** aus den echten offiziellen Archipelago-0.6.8-Optionsklassen. Dropdowns, Bereiche und strukturierte Felder funktionieren ohne zusätzliche APworlds und ohne Python. Die YAML enthält `requires.version: 0.6.8`.
- Core-Spiele bleiben nach Neustart und bei einem eigenen APworld-Ordner verfügbar. Eine eigene APworld desselben Spielnamens hat Vorrang; nach Entfernen und erneutem Einlesen erscheint wieder Core. Die Suche berücksichtigt abweichende Tabellennamen für Wind Waker und Super Mario Land 2.
- **Donkey Kong 64** erkannt: World-Klasse und Imports innerhalb einer Bedingung sowie Imports relativ zur Archivwurzel werden statisch gelesen. **100 Felder**.
- **Spirit Tracks** erkannt: Basisklassenalias innerhalb eines `try`-Imports unterstützt. **90 Felder**, einschließlich Plando-Eingabe. Standard und geänderte YAML mit 91 echten Optionsklassen akzeptiert.
- **Friday Night Funkin**: kopierte Standard-Songliste, Textauswahl und Trap-Bereich ergänzt; **46 Felder**. Die enthaltene Spiel-World war bereits vorhanden. `APAPI.apworld` wird korrekt als zusätzliche Hilfsbibliothek erklärt. Diese FNF-Version verlangt für unterstützte YAMLs den Export aus der **Mixtape Engine**; die Spielseite enthält Hinweis und Anleitung. Kein vollständiger FNF-Seed validiert.
- **[50 noch fehlende Spiele mit manuellen Downloadlinks](https://github.com/BR3TZN/AP-Chaos-Bridge/blob/main/FEHLENDE-SPIELE.md#50-spiele-apworld-manuell-beschaffen)** bereinigt; Core-Einträge stehen nun als verfügbar. Es werden weiterhin keine reinen YAML- oder Tabellen-Vorlagen als Spiele angelegt.
- Prüfung: **122 automatisierte Tests**, **110 Core-YAMLs von Archipelago 0.6.8 akzeptiert**, **839 YAML-1.1-/PyYAML-Roundtrips**. Der Katalog umfasst **815 Spielnamen**: 760 aus APworlds und 55 zusätzliche Core-Spiele. Der Release-Workflow reproduziert die offiziellen Core-Metadaten und prüft die exportierten Core-Optionen vor der Veröffentlichung.

## Update

Unter **Updates → Nach Updates suchen → Herunterladen & prüfen → Update installieren** aktualisieren. Räume, Regeln, Zugangsdaten, eigene APworlds und Einstellungen bleiben erhalten. Die Ausführung beginnt danach pausiert im Testmodus.

Alternativ **AP-Chaos-Bridge-v0.5.0.zip** vollständig entpacken und bei beendeter Bridge Programmdateien ersetzen; **data beibehalten**. Node.js ab 22 bleibt erforderlich. Core-YAMLs sind für **Archipelago 0.6.8** vorbereitet; normale APworlds verwenden weiterhin ihre eigenen Versionsanforderungen.

Die Optionsprüfung erzeugt keine vollständigen Seeds oder ROM-Patches und prüft keine Spielclients. Run-Reset bleibt ausgenommen.

---

# AP Chaos Bridge 0.4.1

- **SpongeBob SquarePants: Battle for Bikini Bottom 1.2.5** ergänzt. Im Spielekatalog nach **Bikini Bottom** suchen. 22 vorbereitete Einstellungen einschließlich Pfannenwender-Anzahl, Socken, Fähigkeiten, Tor-Kosten, DeathLink und RingLink; YAMLs für mehrere Slotnamen exportieren. Bekannte Dateiversion funktioniert ohne Python auch bei Upload, Umbenennung oder eigenem APworld-Ordner.
- Größere APworlds unterstützt: Die originale BfBB-Datei ist rund 80 MB groß und überschritt die bisherigen Grenzen. Jetzt **128 MiB pro APworld**, bis 512 MiB deklarierte entpackte Daten; ausgewählte Python-/Manifestdateien bleiben auf je 8 MiB und zusammen 32 MiB begrenzt. Client-Binärdateien werden beim Einlesen nicht entpackt oder ausgeführt.
- Gleiche Importgrenzen für Dateiauswahl, HTTP-Upload, Ordnerscan, Metadaten-Builder und Katalogdownload. Der Downloader kann größere Release-ZIPs mit enthaltenen APworlds lesen. Der Uploaddialog erklärt das vorherige Entpacken eines Release-ZIPs.
- Vollständiger Katalog: **768 APworld-Dateien, 782 World-Varianten, 758 erkannte Spiele**. Drei bekannte Pakete ohne statische World-Deklaration bleiben separat als übersprungen erklärt.
- **114 Tests**, darunter echter Upload der vollständigen BfBB-Datei, Import ohne Python, YAML-Export für mehrere Spieler und Größenbegrenzungen. Standard- und geänderte BfBB-YAML mit den echten Optionsklassen von **Archipelago 0.6.7** geprüft: beide akzeptiert. Gesamter YAML-Bestand erneut mit YAML 1.1 und PyYAML geprüft.

## Aktualisieren und verwenden

**Einstellungen → Programmupdates → Nach Updates suchen → Update herunterladen → Installieren & neu starten**. Danach bei Bedarf mit Strg+F5 neu laden. Aus Versionen vor 0.4.0 heißt die Seite noch **Einrichtung**. Zugangsdaten und Räume bleiben erhalten; die Bridge startet im Testmodus und pausiert.

Alternativ **AP-Chaos-Bridge-v0.4.1.zip** vollständig entpacken, Bridge beenden und Programmdateien ersetzen; **data beibehalten**. Node.js ab 22 bleibt erforderlich.

Für weitere Spiele das passende Release-ZIP entpacken und die enthaltene `.apworld` hochladen. Die Bridge kann auch direkt Archipelagos `custom_worlds` als APworld-Ordner einlesen. Unbekannte Dateiversionen benötigen Python ab 3.10 für die statische Analyse. Die eigentliche Archipelago-Installation und die vom World-Entwickler benötigten Spielclients/Bibliotheken bleiben zusätzlich notwendig.

BfBB 1.2.5 benötigt Archipelago ab 0.6.7 und für das veröffentlichte Windows-Paket dessen Python 3.13. Gespielt wird die US-GameCube-Fassung über Dolphin. [Offizielle Einrichtung](https://github.com/Cyb3RGER/bfbb_ap_world/blob/v1.2.5/docs/setup_en.md).

Prüfgrenze: YAML-Format und Optionsprüfungen wurden ausgeführt; keine vollständige Seed-/ROM-Generierung und kein Spieleffekt in Dolphin. Die Oberflächenabläufe sind automatisiert mit JSDOM geprüft.
