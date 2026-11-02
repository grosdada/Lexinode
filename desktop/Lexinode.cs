// Lanceur de Lexinode pour Windows. Compilé avec le csc de Windows (C# 5, .NET Framework 4) : voir build.js.
//  - démarre le serveur (node\node.exe app\server.js) sans fenêtre, sur 127.0.0.1 et un port libre
//  - ouvre l'interface dans une fenêtre d'application Edge (ou Chrome) avec un profil à part
//  - arrête le serveur quand la fenêtre se ferme
// Les données de l'utilisateur vivent dans %APPDATA%\Lexinode (LEXINODE_HOME) ; le dossier d'installation reste en lecture seule.
// Option : --no-window (serveur seul, pour les essais).
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Management;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;

static class LexinodeLauncher
{
    const int FirstPort = 5177;
    static string appDir, home, logFile, portFile;

    [STAThread]
    static int Main(string[] args)
    {
        bool noWindow = Array.IndexOf(args, "--no-window") >= 0;
        appDir = AppDomain.CurrentDomain.BaseDirectory;
        home = Environment.GetEnvironmentVariable("LEXINODE_HOME");
        if (string.IsNullOrEmpty(home))
            home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Lexinode");
        Directory.CreateDirectory(home);
        logFile = Path.Combine(home, "server.log");
        portFile = Path.Combine(home, "port.txt");

        bool first;
        using (Mutex mutex = new Mutex(true, "Lexinode.SingleInstance." + Hash(home), out first))
        {
            if (!first)
            {
                // déjà lancé : on ouvre seulement une nouvelle fenêtre sur le serveur qui tourne
                int running = ReadPort();
                string e2, p2;
                if (running > 0 && IsUp(running) && !noWindow) OpenWindow(running, out e2, out p2);
                return 0;
            }
            return Run(noWindow);
        }
    }

    static int Run(bool noWindow)
    {
        string node = Path.Combine(appDir, "node", "node.exe");
        string appFolder = Path.Combine(appDir, "app");
        string script = Path.Combine(appFolder, "server.js");
        if (!File.Exists(node) || !File.Exists(script))
        {
            Error("Fichiers de l'application introuvables dans " + appDir + ".\nRéinstallez Lexinode.");
            return 1;
        }

        int port = FindPort();
        if (port == 0) { Error("Aucun port libre entre " + FirstPort + " et " + (FirstPort + 40) + "."); return 1; }

        ProcessStartInfo psi = new ProcessStartInfo(node, "\"" + script + "\"");
        psi.WorkingDirectory = appFolder;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.StandardOutputEncoding = Encoding.UTF8;
        psi.StandardErrorEncoding = Encoding.UTF8;
        psi.EnvironmentVariables["LEXINODE_HOME"] = home;
        psi.EnvironmentVariables["PORT"] = port.ToString();
        psi.EnvironmentVariables["HOST"] = "127.0.0.1";
        psi.EnvironmentVariables["LEXINODE_PASSWORD"] = ""; // serveur local : pas de mot de passe
        psi.EnvironmentVariables["LEXINODE_PARENT_PID"] = Process.GetCurrentProcess().Id.ToString(); // le serveur s'arrête si on disparaît

        Process server;
        StreamWriter log = null;
        try
        {
            log = new StreamWriter(new FileStream(logFile, FileMode.Create, FileAccess.Write, FileShare.ReadWrite), new UTF8Encoding(false));
            log.AutoFlush = true;
        }
        catch (IOException) { /* journal ouvert ailleurs : on continue sans */ }
        try
        {
            server = Process.Start(psi);
        }
        catch (Exception e)
        {
            Error("Impossible de démarrer le serveur :\n" + e.Message);
            return 1;
        }
        DataReceivedEventHandler onLine = delegate (object s, DataReceivedEventArgs ev)
        {
            if (ev.Data == null || log == null) return;
            lock (log) { try { log.WriteLine(ev.Data); } catch (Exception) { } }
        };
        server.OutputDataReceived += onLine;
        server.ErrorDataReceived += onLine;
        server.BeginOutputReadLine();
        server.BeginErrorReadLine();

        DateTime limit = DateTime.UtcNow.AddSeconds(30);
        while (DateTime.UtcNow < limit && !server.HasExited && !IsUp(port)) Thread.Sleep(150);
        if (server.HasExited || !IsUp(port))
        {
            string tail = Tail(logFile);
            Stop(server);
            Error("Lexinode n'a pas pu démarrer.\n\n" + tail + "\n\nJournal : " + logFile);
            return 1;
        }
        try { File.WriteAllText(portFile, port.ToString()); } catch (IOException) { }

        try
        {
            if (noWindow)
            {
                server.WaitForExit();
            }
            else
            {
                string exeName, profile;
                Process window = OpenWindow(port, out exeName, out profile);
                if (window != null)
                {
                    // Edge se relance lui-même : le processus lancé se termine aussitôt. On surveille donc le profil du navigateur.
                    bool seen = false;
                    DateTime until = DateTime.UtcNow.AddSeconds(25);
                    while (DateTime.UtcNow < until && !seen && !server.HasExited) { seen = BrowserAlive(exeName, profile); if (!seen) Thread.Sleep(500); }
                    if (!seen) Error("La fenêtre de Lexinode n'a pas pu s'ouvrir.");
                    while (seen && !server.HasExited && BrowserAlive(exeName, profile)) Thread.Sleep(1000);
                }
                else MessageBox.Show("Lexinode tourne dans votre navigateur (http://127.0.0.1:" + port + ").\nCliquez sur OK pour l'arrêter.", "Lexinode", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }
        finally
        {
            Stop(server);
            try { File.Delete(portFile); } catch (IOException) { }
        }
        return 0;
    }

    static Process OpenWindow(int port, out string exeName, out string profile)
    {
        string url = "http://127.0.0.1:" + port + "/";
        string browser = FindBrowser();
        exeName = null;
        profile = Path.Combine(home, "browser-profile");
        if (browser == null)
        {
            try { Process.Start(url); } catch (Exception) { }
            return null;
        }
        exeName = Path.GetFileName(browser);
        string a = "--app=" + url + " --user-data-dir=\"" + profile + "\" --no-first-run --no-default-browser-check"
                 + " --disable-extensions --disable-sync --disable-background-mode --window-size=1500,950";
        ProcessStartInfo psi = new ProcessStartInfo(browser, a);
        psi.UseShellExecute = false;
        return Process.Start(psi);
    }

    // Vrai tant qu'un processus principal du navigateur (pas un sous-processus --type=) utilise ce profil
    static bool BrowserAlive(string exeName, string profile)
    {
        try
        {
            using (ManagementObjectSearcher q = new ManagementObjectSearcher("SELECT CommandLine FROM Win32_Process WHERE Name = '" + exeName + "'"))
            {
                foreach (ManagementObject o in q.Get())
                {
                    string cl = o["CommandLine"] as string;
                    if (cl != null && cl.IndexOf(profile, StringComparison.OrdinalIgnoreCase) >= 0 && cl.IndexOf("--type=", StringComparison.Ordinal) < 0) return true;
                }
            }
        }
        catch (Exception) { }
        return false;
    }

    static string FindBrowser()
    {
        string pf = Environment.GetEnvironmentVariable("ProgramFiles");
        string pf86 = Environment.GetEnvironmentVariable("ProgramFiles(x86)");
        string local = Environment.GetEnvironmentVariable("LOCALAPPDATA");
        string[] candidates = new string[] {
            Path.Combine(pf86 ?? "", @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(pf ?? "", @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(pf ?? "", @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(pf86 ?? "", @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(local ?? "", @"Google\Chrome\Application\chrome.exe")
        };
        foreach (string c in candidates) if (File.Exists(c)) return c;
        return null;
    }

    static int FindPort()
    {
        for (int p = FirstPort; p <= FirstPort + 40; p++)
        {
            try
            {
                TcpListener l = new TcpListener(IPAddress.Loopback, p);
                l.Start();
                l.Stop();
                return p;
            }
            catch (SocketException) { }
        }
        return 0;
    }

    static bool IsUp(int port)
    {
        try
        {
            HttpWebRequest r = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/api/status");
            r.Timeout = 1500;
            r.Proxy = null;
            using (r.GetResponse()) { return true; }
        }
        catch (WebException e) { return e.Response != null; } // une réponse HTTP, même 401, prouve que le serveur répond
        catch (Exception) { return false; }
    }

    static int ReadPort()
    {
        try { return int.Parse(File.ReadAllText(portFile).Trim()); } catch (Exception) { return 0; }
    }

    static void Stop(Process p)
    {
        try { if (!p.HasExited) { p.Kill(); p.WaitForExit(3000); } } catch (Exception) { }
    }

    static string Tail(string file)
    {
        try
        {
            using (FileStream fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                long n = Math.Min(fs.Length, 1200);
                fs.Seek(-n, SeekOrigin.End);
                byte[] b = new byte[n];
                fs.Read(b, 0, (int)n);
                return Encoding.UTF8.GetString(b);
            }
        }
        catch (Exception) { return ""; }
    }

    static string Hash(string s)
    {
        uint h = 2166136261;
        foreach (char c in s.ToLowerInvariant()) h = (h ^ c) * 16777619;
        return h.ToString("x");
    }

    static void Error(string msg)
    {
        MessageBox.Show(msg, "Lexinode", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}
