# Externe Trigger

Ereignisse werden an `http://127.0.0.1:17381/api/ingest` gesendet. Das Tool muss laufen. Der Integration-Token steht unter **Quellen → Integrationsdaten anzeigen**. Regeln benötigen die Quelle **Externer Trigger**.

## PowerShell

Der mitgelieferte Helfer liest den Token aus dem eigenen `data`-Ordner. Er gibt ihn nicht aus. Beispiel für einen ungefährlichen Test:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\integrations\Send-BridgeEvent.ps1 -EventId "mein-test-001" -Type sub -UserName "Daniel" -Units 1 -TestEvent
```

`-TestEvent` erzwingt Simulation. Ohne diese Option entscheidet der Modus der Bridge. Für jedes neue Ereignis eine eindeutige ID verwenden; bei einem erneuten Versand desselben Ereignisses dieselbe ID behalten.

## Streamer.bot

1. Globale persistente Variable `APChaosBridgeToken` mit dem Integration-Token anlegen. Den Wert nicht in Chat oder Log ausgeben.
2. Aktion mit dem gewünschten Trigger erstellen, z. B. Twitch-Sub oder Kanalpunkte.
3. Vor dem C#-Schritt folgende Argumente setzen. Die Variablennamen des Originaltriggers im eigenen Streamer.bot prüfen; sie unterscheiden sich je Ereignis.
4. `StreamerBot.cs` als **Execute C# Code** einfügen. Falls der Editor Referenzen verlangt: `System.Net.Http` und das mit Streamer.bot ausgelieferte `Newtonsoft.Json` hinzufügen.
5. Bridge-Regel mit Quelle **Externer Trigger**, passender Ereignisart und passenden Filtern aktivieren.

| Argument | Inhalt |
| --- | --- |
| `bridgeEventId` | Stabile Original-Ereignis-ID, z. B. Twitch-Message- oder Redemption-ID. Für einen Wiederholungsversuch beibehalten. |
| `bridgeType` | `sub`, `resub`, `gift_sub`, `cheer`, `channel_points`, `donation` oder `manual` |
| `userName` | Anzeigename des Zuschauers |
| `bridgeUnits` | Anzahl Subs im Paket / Bits, sonst 1 |
| `bridgeAmountCents` | Netto-Betrag in ganzen EUR-Cent, bei Twitch-Subs und Bits 0 |
| `bridgeAction` | Optionaler exakter Aktionscode, sonst leer |
| `bridgeRewardId` | Optional: Kanalpunkte-Reward-ID |
| `bridgeTest` | Für Tests `true`; für echte Ereignisse bewusst `false`. Ohne Argument bleibt der Helfer im Testmodus. |

Ein Gift-Paket soll genau einen Trigger liefern. Nicht zusätzlich dieselben Einzelgeschenke auslösen lassen. Wenn Twitch bereits direkt in der Bridge verbunden ist, dieselben Ereignisse nicht erneut aus Streamer.bot einspeisen: Anbieterübergreifende IDs können unterschiedlich sein.

Der C#-Helfer ist ein konfigurierbares Beispiel. Er wurde hier nicht innerhalb von Streamer.bot kompiliert oder ausgeführt. HTTP-Eingang und entsprechendes Ereignisformat sind automatisiert geprüft.

## JSON-Vertrag

```json
{
  "id": "provider-event-123",
  "type": "donation",
  "user": "Zuschauer",
  "amountCents": 1000,
  "units": 0,
  "action": "random-trap",
  "rewardId": "",
  "timestamp": 1792479000000,
  "test": true
}
```

Den Beispielzeitstempel durch die aktuelle Unix-Zeit in Millisekunden ersetzen. Quelle wird serverseitig immer `external`; Clients können sich nicht als native Charity- oder Twitch-Quelle ausgeben. Erfolgreiche HTTP-Annahme heißt nicht, dass ein Spieleffekt ausgeführt wurde: `receipt.jobs` und `receipt.errors` prüfen oder das Protokoll öffnen.

Quellen: [Streamer.bot POST-Beispiel](https://docs.streamer.bot/examples/http-post), [TryGetArg](https://docs.streamer.bot/api/csharp/methods/core/arguments/try-get-arg), [GetGlobalVar](https://docs.streamer.bot/api/csharp/methods/core/globals/get-global-var).
