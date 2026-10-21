"""Produce the manual-download list and reference catalog from recorded provenance."""
import json
import zipfile
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent

def esc(text):
    return str(text).replace('|', '\\|').replace('\n', ' ').replace('\r', '')

def links(row):
    return ' · '.join(('[' + label + '](' + url.replace(')', '%29').replace('(', '%28') + ')' for column, label in [('E', 'Download'), ('F', 'Anleitung'), ('G', 'Support')] for url in row['links'].get(column, []) if url.startswith(('http://', 'https://'))))

def main():
    data = json.loads((ROOT / 'assets/apworld-downloads.json').read_text(encoding='utf-8'))
    cache = json.loads((ROOT / 'assets/apworld-settings.json').read_text(encoding='utf-8'))
    games = {}
    partial = {}
    for file, entry in cache['files'].items():
        for world in entry['worlds']:
            games[world['game']] = world
            if world['unresolved']:
                partial[world['game']] = world['unresolved']
    snapshot = json.loads((ROOT / 'assets/apworld-catalog.json').read_text(encoding='utf-8'))
    states = {r['row']: r for r in data['entries']}
    index = {'source': data['source'], 'date': data['retrievedAt'], 'games': [{**{k: r.get(k) for k in ['game', 'stability', 'core']}, 'downloadStatus': states.get(r['row'], {}).get('status', 'pending'), 'reason': states.get(r['row'], {}).get('reason', '')} for r in snapshot['rows']]}
    (ROOT / 'assets/game-index.json').write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding='utf-8')
    files = {f['file'] for row in data['entries'] for f in row.get('files', [])} | {f['file'] for f in data.get('userImports', [])}
    manual = [r for r in data['entries'] if r['status'] == 'manual']
    core = [r for r in data['entries'] if r['status'] == 'core']
    lines = ['# APworlds: manuelle Downloads und Importstatus', '', 'Stand: ' + data['retrievedAt'], '', '[Quelltabelle](' + data['source'] + ')', '', f"{data['processed']} von {data['total']} Tabellenzeilen geprüft. {data['stats']['downloaded']} Zeilen mit Download, {len(files)} unterschiedliche APworld-Dateien, {len(games)} erkannte Spielnamen. {len(manual)} manuelle Downloads und {len(core)} Core-Einträge ohne separate Datei.", '', '## Manuell hinzufügen', '', 'Die folgenden verlinkten Quellen liefern keinen frei direkt erreichbaren APworld-Download oder überschreiten die Importgrenzen. Discord-Dateien bitte selbst herunterladen. Die Links stammen aus der Tabelle.', '', '| Spiel | Grund | Links |', '|---|---|---|']
    if data.get('repositoryImports'):
        lines[6:6] = ['Zusätzlich sind die bereits im bestehenden GitHub-Repo hinterlegten APworlds berücksichtigt: ' + ', '.join(esc(item['game']) for item in data['repositoryImports']) + '.', '']
    if data.get('userImports'):
        lines[6:6] = ['Zusätzliche Nutzer-Uploads, unverändert und per SHA-256 erfasst: ' + ', '.join(esc(item['game']) for item in data['userImports']) + '. Bereits identische Dateien werden gemeinsam verwendet.', '']
    lines += [f"| {esc(r['game'])} | {esc(r['reason'])} | {links(r)} |" for r in manual]
    lines += ['', '## Core-Spiele', '', 'Diese Spiele sind bereits Bestandteil von Archipelago. Im Tabellenlink wurde keine separate APworld gefunden. Für ihren Einstellungseditor wird eine eigenständige APworld oder eine zusätzliche Core-Integration benötigt.', '', '| Spiel | Links |', '|---|---|']
    lines += [f"| {esc(r['game'])} | {links(r)} |" for r in core]
    lines += ['', '## Heruntergeladen, noch nicht auswertbar', '', 'Diese Dateien liegen im APworld-Ordner; der statische Leser konnte ihren Spielnamen nicht ermitteln.', '', '| Datei | Grund |', '|---|---|']
    lines += [f"| {esc(e['file'])} | {esc(e['error'])} |" for e in cache['errors']]
    packaging = []
    for name in sorted(files):
        path = ROOT / 'apworlds' / name
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            normalized = [n.replace('\\', '/') for n in names]
            roots = [n.split('/')[0] for n in normalized if n.endswith('/__init__.py') and n.count('/') == 1]
            notes = []
            install_name = roots[0] + '.apworld' if len(roots) == 1 else path.name
            if path.stem not in roots: notes.append('Beim Installieren auf den Namen des World-Ordners umbenennen.')
            if any('\\' in n for n in names): notes.append('Windows-Pfadtrenner im Archiv; die Bridge normalisiert sie nur beim Lesen. Für Archipelago gegebenenfalls ein korrigiertes Entwicklerpaket verwenden.')
            if notes: packaging.append((name, install_name, ' '.join(notes)))
    if packaging:
        lines += ['', '## Hinweise zur APworld-Installation', '', 'Die Downloads bleiben unverändert. Diese veröffentlichten Pakete haben abweichende Datei-/Ordnernamen oder Windows-Pfadtrenner. Der Einstellungseditor kann sie lesen; beim Installieren in Archipelago folgende Hinweise beachten.', '', '| Datei | Installationsname | Hinweis |', '|---|---|---|']
        lines += [f"| {esc(name)} | {esc(install_name)} | {esc(note)} |" for name, install_name, note in packaging]
    lines += ['', '## Teilweise dynamische Einstellungen', '', 'Statisch deklarierte Optionen stehen als Auswahl, Zahlenfeld oder strukturierte Eingabe bereit. Laufzeitabhängige Felder und Standards können ohne Ausführen des APworld-Codes nicht immer ermittelt werden. Sie werden im Editor angezeigt und können als erweiterte YAML-Zusatzoptionen gesetzt werden. Ohne eigenen Wert gelten die Standards des APworlds.', '', '| Spiel | Nicht statisch aufgelöst |', '|---|---|']
    lines += [f"| {esc(game)} | {esc('; '.join(values))} |" for game, values in sorted(partial.items())]
    lines += ['', '## Eigene Dateien einlesen', '', '1. Die originale `.apworld` in `apworlds/` oder einen Unterordner legen.', '2. Die Bridge starten und im Spielekatalog **Ordner neu einlesen** wählen. Vorbereitete Versionen werden am Dateiinhalt erkannt, auch in eigenen Ordnern oder nach Umbenennen; dafür ist kein Python nötig. Unbekannte Versionen benötigen Python 3.10 oder neuer.', '3. Das Spiel öffnen, Einstellungen und Slotnamen festlegen und YAMLs exportieren.', '', 'Die mitgelieferten Dateien liegen nach Quelle und Dateihash in Unterordnern. Ihre Originalnamen bleiben erhalten. Zum Installieren in Archipelago die betreffende Datei in dessen `custom_worlds` kopieren; abweichende Installationsnamen stehen oben. Unterschiedliche Versionen desselben Spiels bitte nicht gleichzeitig installieren.', '', 'Importgrenzen: 40 MiB pro Archiv, 100 MiB entpackt und 8 MiB pro ausgewählter Python-/Manifestdatei. Größere Worlds lassen sich nicht allein durch manuelles Kopieren freischalten.', '', 'Der Import liest Python-Deklarationen, führt die APworlds aber nicht aus. Die Prüfung ersetzt keine Seed-Generierung mit einer passenden Archipelago-Version. Das Einlesen installiert keine Spiel-Clients und erzeugt keine zusätzlichen Trap- oder Reset-Funktionen.', '']
    (ROOT / 'APWORLDS-MANUELL.md').write_text('\n'.join(lines), encoding='utf-8')
    print(json.dumps({'downloadedRows': data['stats']['downloaded'], 'files': len(files), 'games': len(games), 'manual': len(manual), 'core': len(core), 'partiallyDynamic': len(partial)}, ensure_ascii=False))
if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8', errors='backslashreplace')
    main()
