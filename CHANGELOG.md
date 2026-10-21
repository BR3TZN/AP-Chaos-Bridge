# AP Chaos Bridge 0.3.2

- Alle sieben bereitgestellten APworlds unterstützt: **Minecraft**, **Pokémon Platin**, **Ratchet & Clank 2**, **The Binding of Isaac Repentance**, **Bloons TD6**, **Cyberpunk 2077** und **Kingdom Hearts III**.
- Vorbereitete Einstellungen werden per **SHA-256** am Dateiinhalt erkannt. Hochladen, umbenannte Dateien, eigene APworld-Ordner und deren Unterordner funktionieren damit **ohne Python**. Behebt die Meldung „0 Spiele eingelesen / Python benötigt“ für diese Dateien.
- **KH3 0.16.11** und die bereitgestellte **Bloons-Version 0.8.2** ergänzt. Identische vorhandene Dateien werden wiederverwendet; Bloons 0.8.3 bleibt ebenfalls verfügbar. Pro Spiel erscheint weiterhin ein Katalogeintrag; eine eigene Datei direkt im APworld-Ordner bestimmt die gewünschte Version.
- OptionCounter-Felder für Trap-, Item- und Junk-Gewichtungen sowie Freitextfelder wie Platin-DeathLink-Gruppen werden statisch erkannt. APworld-Code wird beim normalen Import weiterhin nicht ausgeführt.
- Die sieben Worlds mit jeweils einer Standard-YAML und einer geänderten Konfiguration durch Archipelagos echten Optionsparser geprüft: **14 Dateien akzeptiert**, einschließlich der Optionsprüfungen der jeweiligen APworld.
- Vollständiger Bestand mit YAML 1.1 und PyYAML geprüft; gezielte Regressionstests für Import ohne Python, Dateiumbenennung, eigene Ordner, HTTP-Upload und YAML-Export ergänzt.
- Das GitHub-Repository ist jetzt **öffentlich**. Programmupdates sind ohne GitHub-Token erreichbar.

## Aktualisieren

Ab Version 0.3.1: **Einrichtung → Programmupdates → Nach Updates suchen → Update herunterladen → Installieren & neu starten**. Ein zuvor gespeicherter, ungültiger GitHub-Token kann dort über **Zugang entfernen** gelöscht werden; für dieses öffentliche Repo ist er nicht erforderlich.

Alternativ **AP-Chaos-Bridge-v0.3.2.zip** vollständig entpacken, Bridge beenden und die Programmdateien ersetzen; **data beibehalten**. Node.js 22 oder neuer bleibt erforderlich. Die Bridge startet im Testmodus mit pausierter Ausführung.

Im Spielekatalog den eigenen APworld-Ordner **neu einlesen** oder die Dateien erneut hochladen. Danach die gewünschten Einstellungen öffnen und YAMLs neu erzeugen. Die passende APworld muss auch im Archipelago-Generator installiert sein; YAMLs gehören für die Seed-Generierung in dessen **Players**-Ordner. Unterschiedliche Versionen eines Spiels dort nicht gleichzeitig installieren.

**Prüfgrenze:** Die Prüfung umfasst YAML-Format, Datentypen und für die sieben Nutzerdateien die echten Optionsklassen von Archipelago 0.6.7. Vollständige Seeds, ROM-Patches und Spielclients wurden nicht für alle Spiele ausgeführt. Unbekannte APworld-Versionen benötigen für die statische Analyse weiterhin Python ab 3.10. APworld-Import erzeugt keine zusätzlichen Live-Traps oder Run-Reset-Funktionen.
