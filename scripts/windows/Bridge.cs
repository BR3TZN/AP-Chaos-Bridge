using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class Program
{
    internal static string Root, RootId, Origin;
    internal static bool Smoke;
    internal static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] internal static extern uint RegisterWindowMessage(string name);
    [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern uint GetLongPathName(string path, StringBuilder result, uint length);
    internal static uint RestoreMessage;

    [STAThread]
    private static int Main(string[] args)
    {
        Smoke = Array.IndexOf(args, "--smoke-test") >= 0;
        try
        {
            Root = LongPath(FindRoot());
            string canonical = Path.Combine(Root, "assets", "windows", "AP-Chaos-Bridge.exe");
            Directory.CreateDirectory(Path.Combine(Root, "data"));
            File.AppendAllText(Path.Combine(Root, "data", "desktop-start.log"), DateTime.UtcNow.ToString("o") + " PID " + Process.GetCurrentProcess().Id + " " + Assembly.GetExecutingAssembly().Location + Environment.NewLine);
            if (!String.Equals(LongPath(Assembly.GetExecutingAssembly().Location), LongPath(canonical), StringComparison.OrdinalIgnoreCase))
            {
                Process.Start(new ProcessStartInfo(canonical, Smoke ? "--smoke-test" : "") { WorkingDirectory = Root, UseShellExecute = false, CreateNoWindow = true });
                return 0;
            }
            using (SHA256 sha = SHA256.Create()) RootId = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(Root.ToLowerInvariant()))).Replace("-", "").ToLowerInvariant();
            int port = 17381;
            string configured = Environment.GetEnvironmentVariable("AP_BRIDGE_PORT");
            if (!String.IsNullOrEmpty(configured) && (!Int32.TryParse(configured, out port) || port < 1024 || port > 65535)) throw new Exception("AP_BRIDGE_PORT muss zwischen 1024 und 65535 liegen.");
            Origin = "http://127.0.0.1:" + port;
            RestoreMessage = RegisterWindowMessage("APChaosBridge.Restore." + RootId);
            bool created;
            using (Mutex mutex = new Mutex(true, "Local\\APChaosBridge-" + RootId, out created))
            {
                if (!created) { PostMessage(new IntPtr(0xffff), RestoreMessage, IntPtr.Zero, IntPtr.Zero); return 0; }
                try { RunWindow(); } finally { mutex.ReleaseMutex(); }
            }
            return Environment.ExitCode;
        }
        catch (Exception error) { Fail(error); return 1; }
    }

    private static string LongPath(string path)
    {
        StringBuilder buffer = new StringBuilder(32768);
        uint length = GetLongPathName(Path.GetFullPath(path), buffer, (uint)buffer.Capacity);
        return length > 0 && length < buffer.Capacity ? buffer.ToString() : Path.GetFullPath(path);
    }

    private static string FindRoot()
    {
        DirectoryInfo folder = new FileInfo(Assembly.GetExecutingAssembly().Location).Directory;
        for (int i = 0; i < 5 && folder != null; i++, folder = folder.Parent)
        {
            string package = Path.Combine(folder.FullName, "package.json");
            if (File.Exists(package) && File.Exists(Path.Combine(folder.FullName, "server.mjs")))
            {
                var config = Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(package));
                if (config.ContainsKey("name") && (string)config["name"] == "ap-chaos-bridge") return folder.FullName.TrimEnd(Path.DirectorySeparatorChar);
            }
        }
        throw new Exception("Die EXE bitte im vollständig entpackten Programmpaket lassen. server.mjs oder package.json fehlt.");
    }

    // Keep WebView2 types out of the small root launcher's startup path.
    [MethodImpl(MethodImplOptions.NoInlining)]
    private static void RunWindow()
    {
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        using (BridgeForm window = new BridgeForm()) Application.Run(window);
    }

    internal static void Fail(Exception error)
    {
        Environment.ExitCode = 1;
        string message = error.GetBaseException().Message;
        try { Directory.CreateDirectory(Path.Combine(Root, "data")); File.AppendAllText(Path.Combine(Root, "data", "desktop-error.log"), DateTime.UtcNow.ToString("o") + " " + message + Environment.NewLine); } catch { }
        if (!Smoke) MessageBox.Show(message, "AP Chaos Bridge", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }

    internal static bool IsLocal(string url)
    {
        Uri uri; return Uri.TryCreate(url, UriKind.Absolute, out uri) && uri.Scheme == "http" && uri.Host == "127.0.0.1" && uri.Port == new Uri(Origin).Port;
    }

    internal static void External(string url)
    {
        Uri uri;
        if (!Uri.TryCreate(url, UriKind.Absolute, out uri) || !(uri.Scheme == "https" || IsLocal(url))) return;
        Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
    }
}

internal sealed class BridgeForm : Form
{
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window, out NativeRect rectangle);
    [StructLayout(LayoutKind.Sequential)] private struct NativeRect { public int Left, Top, Right, Bottom; }
    private readonly Label loading;
    private readonly NotifyIcon tray;
    private readonly System.Windows.Forms.Timer monitor;
    private WebView2 view;
    private Process backend;
    private int backendPid;
    private string session;
    private bool exiting, stopping, ready, downloaded;
    private bool restoring;
    private FormWindowState restoreState = FormWindowState.Normal;
    private readonly object logLock = new object();

    internal BridgeForm()
    {
        Rectangle area = Screen.FromPoint(Cursor.Position).WorkingArea;
        Text = "AP Chaos Bridge"; Width = Math.Min(1320, area.Width); Height = Math.Min(900, area.Height);
        MinimumSize = new Size(Math.Min(900, area.Width), Math.Min(620, area.Height)); StartPosition = FormStartPosition.CenterScreen;
        Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
        loading = new Label { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, Text = "AP Chaos Bridge wird gestartet …", Font = new Font("Segoe UI", 13) };
        Controls.Add(loading);
        ContextMenuStrip menu = new ContextMenuStrip();
        menu.Items.Add("Öffnen", null, (sender, args) => RestoreWindow());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Beenden", null, async (sender, args) => await Quit());
        tray = new NotifyIcon { Icon = Icon, Text = "AP Chaos Bridge", ContextMenuStrip = menu, Visible = true };
        tray.DoubleClick += (sender, args) => RestoreWindow();
        monitor = new System.Windows.Forms.Timer { Interval = 500 };
        monitor.Tick += (sender, args) => { if (backendPid != 0 && !Alive(backendPid) && !stopping) ExitWindow(); };
        Resize += (sender, args) =>
        {
            if (restoring || exiting) return;
            if (WindowState == FormWindowState.Minimized) { if (ready) HideWindow(); }
            else restoreState = WindowState;
        };
        FormClosing += (sender, args) => { if (!exiting && args.CloseReason == CloseReason.UserClosing) { args.Cancel = true; HideWindow(); } };
        Shown += async (sender, args) => await Start();
    }

    protected override void WndProc(ref Message message)
    {
        if (message.Msg == Program.RestoreMessage) { RestoreWindow(); return; }
        base.WndProc(ref message);
    }
    private void RestoreWindow()
    {
        if (exiting || restoring || IsDisposed) return;
        restoring = true;
        try
        {
            // ShowInTaskbar changes recreate the top-level HWND and can detach
            // WebView2. Keep that handle alive throughout the entire tray cycle.
            WindowState = FormWindowState.Normal;
            Rectangle area = Screen.FromRectangle(Bounds).WorkingArea;
            int width = Math.Min(Width, area.Width), height = Math.Min(Height, area.Height);
            SetBounds(Math.Max(area.Left, Math.Min(Left, area.Right - width)), Math.Max(area.Top, Math.Min(Top, area.Bottom - height)), width, height);
            Show(); WindowState = restoreState;
            ShowWindow(Handle, restoreState == FormWindowState.Maximized ? 3 : 9);
            SetWindowPos(Handle, IntPtr.Zero, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0040);
            if (view != null && !view.IsDisposed) { view.Show(); view.BringToFront(); view.Invalidate(true); }
            Activate(); SetForegroundWindow(Handle);
        }
        finally { restoring = false; }
    }
    private void HideWindow()
    {
        if (restoring || exiting) return;
        if (WindowState != FormWindowState.Minimized) restoreState = WindowState;
        Hide();
    }
    private bool WindowIsUsable()
    {
        NativeRect rectangle;
        if (!Visible || !IsWindowVisible(Handle) || IsIconic(Handle) || !GetWindowRect(Handle, out rectangle)) return false;
        Rectangle bounds = Rectangle.FromLTRB(rectangle.Left, rectangle.Top, rectangle.Right, rectangle.Bottom);
        foreach (Screen screen in Screen.AllScreens) if (screen.WorkingArea.IntersectsWith(bounds)) return view != null && view.Visible && IsWindowVisible(view.Handle);
        return false;
    }
    private static bool Alive(int pid) { try { using (Process process = Process.GetProcessById(pid)) return !process.HasExited; } catch { return false; } }
    private void ExitWindow() { if (exiting) return; exiting = true; monitor.Stop(); tray.Visible = false; if (view != null) view.Dispose(); Close(); }

    private async Task<Dictionary<string, object>> Request(string path, string body = null)
    {
        HttpWebRequest request = (HttpWebRequest)WebRequest.Create(Program.Origin + path);
        request.Proxy = null; request.Timeout = 1500; request.ReadWriteTimeout = 1500;
        if (body != null)
        {
            request.Method = "POST"; request.ContentType = "application/json"; request.Headers["X-Bridge-Session"] = session;
            byte[] bytes = Encoding.UTF8.GetBytes(body); request.ContentLength = bytes.Length;
            using (Stream stream = await request.GetRequestStreamAsync()) await stream.WriteAsync(bytes, 0, bytes.Length);
        }
        using (WebResponse response = await request.GetResponseAsync())
        using (StreamReader reader = new StreamReader(response.GetResponseStream())) return Program.Json.Deserialize<Dictionary<string, object>>(await reader.ReadToEndAsync());
    }

    private async Task<bool> Attach()
    {
        Dictionary<string, object> state;
        try { state = await Request("/api/desktop"); } catch (WebException) { return false; }
        if (!state.ContainsKey("rootId") || (string)state["rootId"] != Program.RootId) throw new Exception("Der Bridge-Port wird von einer anderen Installation verwendet. Diese zuerst beenden oder AP_BRIDGE_PORT ändern.");
        backendPid = Convert.ToInt32(state["pid"]); session = (string)state["session"]; Text = "AP Chaos Bridge " + state["version"];
        return true;
    }

    private void Log(string file, string line)
    {
        if (line == null) return;
        try { lock (logLock) File.AppendAllText(Path.Combine(Program.Root, "data", file), line + Environment.NewLine); } catch { }
    }

    private async Task Start()
    {
        Exception failure = null;
        try
        {
            Directory.CreateDirectory(Path.Combine(Program.Root, "data"));
            // An Evergreen runtime is shared with Windows; it is not the Chrome browser.
            try { CoreWebView2Environment.GetAvailableBrowserVersionString(); }
            catch (WebView2RuntimeNotFoundException)
            {
                if (Program.Smoke) throw;
                if (MessageBox.Show("Die Microsoft Edge WebView2 Runtime fehlt. Downloadseite öffnen? Nach der Installation die Bridge erneut starten.", "WebView2 Runtime erforderlich", MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes) Program.External("https://developer.microsoft.com/microsoft-edge/webview2/#download");
                Environment.ExitCode = 1; ExitWindow(); return;
            }
            bool attached = await Attach();
            if (exiting || stopping) return;
            if (!attached)
            {
                string node = Path.Combine(Program.Root, "assets", "windows", "node.exe");
                if (!File.Exists(node)) throw new Exception("Die portable Node-Laufzeit fehlt. Das vollständige Release-ZIP erneut entpacken.");
                ProcessStartInfo info = new ProcessStartInfo(node, "\"" + Path.Combine(Program.Root, "server.mjs") + "\"") { WorkingDirectory = Program.Root, UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
                info.EnvironmentVariables["AP_BRIDGE_DESKTOP_PID"] = Process.GetCurrentProcess().Id.ToString();
                backend = new Process { StartInfo = info };
                backend.OutputDataReceived += (sender, args) => Log("start.log", args.Data);
                backend.ErrorDataReceived += (sender, args) => Log("error.log", args.Data);
                backend.Start(); backend.BeginOutputReadLine(); backend.BeginErrorReadLine();
                bool found = false;
                for (int i = 0; i < 100; i++)
                {
                    if (exiting || stopping) return;
                    if (await Attach()) { found = true; break; }
                    if (backend.HasExited) throw new Exception("Der Hintergrunddienst konnte nicht starten. Details: data\\error.log.");
                    await Task.Delay(200);
                }
                if (!found) throw new Exception("Der Hintergrunddienst antwortet nicht. Details: data\\error.log.");
            }
            monitor.Start();
            view = new WebView2 { Dock = DockStyle.Fill };
            Controls.Add(view); view.BringToFront();
            CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Program.Root, "data", "desktop-profile"));
            if (exiting || stopping) return;
            await view.EnsureCoreWebView2Async(environment);
            if (exiting || stopping) return;
            view.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            view.CoreWebView2.Settings.IsStatusBarEnabled = false;
            view.CoreWebView2.Settings.IsPasswordAutosaveEnabled = false;
            view.CoreWebView2.Settings.IsGeneralAutofillEnabled = false;
            view.CoreWebView2.NavigationStarting += (sender, args) => { if (!Program.IsLocal(args.Uri) && args.Uri != "about:blank") { args.Cancel = true; Program.External(args.Uri); } };
            view.CoreWebView2.NewWindowRequested += (sender, args) => { args.Handled = true; Program.External(args.Uri); };
            view.CoreWebView2.WebMessageReceived += (sender, args) =>
            {
                if (!Program.IsLocal(args.Source)) return;
                try { var data = Program.Json.Deserialize<Dictionary<string, object>>(args.WebMessageAsJson); if ((string)data["type"] == "openExternal") Program.External((string)data["url"]); } catch { }
            };
            view.CoreWebView2.DownloadStarting += (sender, args) =>
            {
                if (Program.Smoke)
                {
                    args.ResultFilePath = Path.Combine(Program.Root, "data", "desktop-download.yaml"); args.Handled = true;
                    args.DownloadOperation.StateChanged += (downloadSender, downloadArgs) => { if (args.DownloadOperation.State == CoreWebView2DownloadState.Completed) downloaded = true; };
                    return;
                }
                CoreWebView2Deferral deferral = args.GetDeferral();
                // A modal dialog must run after the WebView2 event has returned.
                BeginInvoke(new Action(() =>
                {
                    try { using (SaveFileDialog dialog = new SaveFileDialog { FileName = Path.GetFileName(args.ResultFilePath), RestoreDirectory = true })
                    { if (dialog.ShowDialog(this) == DialogResult.OK) { args.ResultFilePath = dialog.FileName; args.Handled = false; } else args.Cancel = true; } }
                    finally { deferral.Complete(); }
                }));
            };
            view.Source = new Uri(Program.Origin);
            loading.Visible = false; ready = true;
            await UpdateRootLauncher();
            if (Program.Smoke) await SmokeTest();
        }
        catch (Exception error) { failure = error; }
        if (failure != null && !exiting) { Program.Fail(failure); await Quit(); }
    }

    private async Task UpdateRootLauncher()
    {
        for (int i = 0; i < 20; i++)
        {
            try { File.Copy(Assembly.GetExecutingAssembly().Location, Path.Combine(Program.Root, "AP-Chaos-Bridge.exe"), true); return; }
            catch (IOException) { }
            catch (Exception error) { Log("desktop-error.log", "Startverknüpfung: " + error.Message); return; }
            await Task.Delay(200);
        }
    }

    private async Task SmokeTest()
    {
        for (int i = 0; i < 160; i++)
        {
            string result = await view.ExecuteScriptAsync("Boolean(document.querySelector('#main [data-action]') && document.querySelector('#breadcrumb').textContent)");
            if (result == "true")
            {
                await SmokeDownload();
                IntPtr originalHandle = Handle;
                await view.ExecuteScriptAsync("window.__trayDraftMarker = 'draft-retained'");
                for (int cycle = 0; cycle < 10; cycle++)
                {
                    if (cycle % 2 == 0) WindowState = FormWindowState.Minimized; else Close();
                    await Task.Delay(80);
                    if (Visible || IsWindowVisible(Handle) || !tray.Visible) throw new Exception("Tray-Ausblenden fehlgeschlagen.");
                    RestoreWindow();
                    for (int attempt = 0; attempt < 40 && !WindowIsUsable(); attempt++) await Task.Delay(50);
                    if (!WindowIsUsable() || Handle != originalHandle)
                    {
                        Log("desktop-tray.log", Program.Json.Serialize(new { cycle, visible = Visible, nativeVisible = IsWindowVisible(Handle), iconic = IsIconic(Handle), state = WindowState.ToString(), restoredState = restoreState.ToString(), handle = Handle.ToInt64(), expectedHandle = originalHandle.ToInt64(), viewVisible = view.Visible, viewNativeVisible = IsWindowVisible(view.Handle), bounds = Bounds.ToString(), viewBounds = view.Bounds.ToString() }));
                        throw new Exception("Tray-Fenster ist nach Wiederherstellung nicht sichtbar oder sein Handle wurde ersetzt.");
                    }
                    if (await view.ExecuteScriptAsync("window.__trayDraftMarker") != "\"draft-retained\"") throw new Exception("Tray-Wiederherstellung hat den Oberflächenzustand verloren.");
                }
                Bounds = new Rectangle(-32000, -32000, 1100, 700); HideWindow(); RestoreWindow();
                if (!WindowIsUsable()) throw new Exception("Fenster außerhalb des Bildschirms wurde nicht zurückgeholt.");
                WindowState = FormWindowState.Maximized; await Task.Delay(80); WindowState = FormWindowState.Minimized; RestoreWindow();
                if (!WindowIsUsable() || WindowState != FormWindowState.Maximized) throw new Exception("Maximiertes Fenster wurde aus dem Tray nicht wiederhergestellt.");
                string bridgeRules = await view.ExecuteScriptAsync("S.rules.length");
                File.WriteAllText(Path.Combine(Program.Root, "data", "desktop-smoke.json"), Program.Json.Serialize(new { ready = true, tray = tray.Visible, trayCycles = 10, restoredVisible = WindowIsUsable(), handlePreserved = Handle == originalHandle, nativeWindow = true, download = downloaded, noConsole = backend == null || backend.StartInfo.CreateNoWindow, rules = bridgeRules, runtime = view.CoreWebView2.Environment.BrowserVersionString }));
                await Quit(); return;
            }
            await Task.Delay(250);
        }
        throw new Exception("Die eingebettete Oberfläche wurde nicht rechtzeitig geladen.");
    }

    private async Task SmokeDownload()
    {
        await view.ExecuteScriptAsync("location.hash = 'spiel/Factorio'");
        bool formReady = false;
        for (int i = 0; i < 100; i++)
        {
            if (await view.ExecuteScriptAsync("Boolean(document.querySelector('#studio-yaml-form'))") == "true") { formReady = true; break; }
            await Task.Delay(200);
        }
        if (!formReady) throw new Exception("YAML-Editor im eigenen Fenster fehlt.");
        await view.ExecuteScriptAsync("document.querySelector('#studio-yaml-form [name=playerNames]').value = 'SmokePlayer'; document.querySelector('#studio-yaml-form [type=submit]').click()");
        for (int i = 0; i < 100 && !downloaded; i++) await Task.Delay(200);
        if (!downloaded) throw new Exception("YAML-Download im eigenen Fenster fehlgeschlagen.");
    }

    private async Task Quit()
    {
        if (stopping) return; stopping = true; monitor.Stop();
        try
        {
            if (!String.IsNullOrEmpty(session)) await Request("/api/shutdown", "{}");
            if (backend != null)
            {
                for (int i = 0; i < 40 && !backend.HasExited; i++) await Task.Delay(100);
                if (!backend.HasExited) backend.Kill();
            }
        }
        catch (Exception error) { Log("desktop-error.log", error.Message); if (backend != null) { try { if (!backend.HasExited) backend.Kill(); } catch { } } }
        finally { ExitWindow(); }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) { tray.Dispose(); monitor.Dispose(); if (view != null) view.Dispose(); if (backend != null) backend.Dispose(); }
        base.Dispose(disposing);
    }
}
