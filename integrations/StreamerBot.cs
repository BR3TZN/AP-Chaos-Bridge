using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using Newtonsoft.Json;

// In Streamer.bot als "Execute C# Code" verwenden.
// Globale Variable APChaosBridgeToken = Integration-Token.
// Vor diesem Code die in integrations/README.md beschriebenen Argumente setzen.
public class CPHInline
{
    private static readonly HttpClient BridgeClient = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
    public bool Execute()
    {
        string token = CPH.GetGlobalVar<string>("APChaosBridgeToken", true);
        string eventId, eventType, user, action, rewardId;
        int units = 1, amount = 0;
        bool testEvent = true;
        if (string.IsNullOrWhiteSpace(token) || !CPH.TryGetArg<string>("bridgeEventId", out eventId) || string.IsNullOrWhiteSpace(eventId))
        {
            CPH.LogError("AP Chaos Bridge: Token oder stabile bridgeEventId fehlt.");
            return false;
        }
        if (!CPH.TryGetArg<string>("bridgeType", out eventType)) eventType = "manual";
        if (!CPH.TryGetArg<string>("userName", out user)) user = "Anonym";
        if (!CPH.TryGetArg<string>("bridgeAction", out action)) action = "";
        if (!CPH.TryGetArg<string>("bridgeRewardId", out rewardId)) rewardId = "";
        int parsed;
        if (CPH.TryGetArg<int>("bridgeUnits", out parsed)) units = parsed;
        if (CPH.TryGetArg<int>("bridgeAmountCents", out parsed)) amount = parsed;
        bool parsedTest;
        if (CPH.TryGetArg<bool>("bridgeTest", out parsedTest)) testEvent = parsedTest;
        string json = JsonConvert.SerializeObject(new {
            id = eventId, type = eventType, user = user, units = units, amountCents = amount,
            action = action, rewardId = rewardId, test = testEvent,
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        });
        try
        {
            using (var request = new HttpRequestMessage(HttpMethod.Post, "http://127.0.0.1:17381/api/ingest"))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                request.Content = new StringContent(json, Encoding.UTF8, "application/json");
                using (var response = BridgeClient.SendAsync(request).GetAwaiter().GetResult())
                {
                    if (!response.IsSuccessStatusCode) { CPH.LogError("AP Chaos Bridge: HTTP " + (int)response.StatusCode); return false; }
                }
            }
            return true;
        }
        catch { CPH.LogError("AP Chaos Bridge nicht erreichbar. Gleiche Event-ID fuer einen bewussten Wiederholungsversuch behalten."); return false; }
    }
}
