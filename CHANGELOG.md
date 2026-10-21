# AP Chaos Bridge 0.3.1

- Programmupdates unter **Einrichtung → Programmupdates**: stabile GitHub-Releases prüfen, vollständiges ZIP herunterladen, SHA-256 und Dateimanifest prüfen, installieren und automatisch neu starten.
- Sicherung geänderter Programmdateien und Daten; Rückkehr zur vorherigen Version bei Installations- oder Startfehlern. Räume, Regeln, Zugangsdaten und eigene APworlds bleiben erhalten.
- Optionaler, lokal verschlüsselt gespeicherter GitHub-Token mit Leserechten für private Repositories.
- YAML-Export für Archipelagos YAML-1.1-Leser korrigiert: Auswahlwerte wie `no`, `on` und `off` bleiben Texte; Zahlen in Exponentialschreibweise bleiben Zahlen. Behebt insbesondere den Fehler bei `hm_reader` in Pokémon Platin.
- 779 World-Varianten mit PyYAML geprüft. Pokémon Platin zusätzlich mit dem echten Optionsparser von Archipelago 0.6.7 und den Prüfungen der APworld 0.2.2 getestet.
- Im Spielekatalog erscheinen ausschließlich eingelesene APworlds. Referenzeinträge und YAML-Vorlagen ohne Worlddatei sind entfernt; gelöschte Worlds verschwinden nach erneutem Einlesen.
- Mindestversion von Archipelago und World-Version aus dem APworld-Manifest anzeigen; bekannte Mindestversion in der Spieler-YAML hinterlegen.
- 765 APworld-Dateien, Einstellungseditor, Spieler-YAMLs oder YAML-ZIP, **+ Spieler**, gezielte und zufällige Gruppen sowie archivierte und löschbare Räume.

## Installation

**AP-Chaos-Bridge-v0.3.1.zip** herunterladen und vollständig entpacken. Unter Windows Node.js 22 oder neuer installieren und **Start.cmd** öffnen. Laufzeitpakete und APworlds sind enthalten. Für neu hinzugefügte APworlds wird Python 3.10 oder neuer benötigt.

Von einer älteren Version einmal manuell aktualisieren: Bridge beenden, neue Programmdateien in den bisherigen Ordner kopieren und **data** beibehalten. Ab dieser Version stehen Updates in der Oberfläche bereit. Nach dem Neustart beginnt die Bridge im Testmodus mit pausierter Ausführung.

Bereits exportierte Platin-YAMLs im neuen Editor erneut erzeugen. Die passende APworld muss auch im Archipelago-Generator installiert sein. Die YAML kommt in dessen **Players**-Ordner und dient zur Seed-Generierung.

Das Source-ZIP enthält Quellcode ohne Laufzeitpakete und APworlds. Fehlende Downloads und Importgrenzen stehen in **APWORLDS-MANUELL.md**. Die Prüfung aller Varianten umfasst YAML-Format und Datentypen; vollständige Seeds oder ROM-Patches wurden nicht für alle Spiele generiert. Live-Aktionen und Run-Reset entstehen nicht automatisch aus einem APworld-Import.
