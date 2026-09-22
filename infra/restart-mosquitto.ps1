# =====================================================
#  Restart the local AquaSweep Mosquitto broker with the
#  project config. MUST run as Administrator.
#  Installs infra/mosquitto.conf as the service config,
#  restarts the service, verifies listeners + firewall.
# =====================================================
$ErrorActionPreference = 'Continue'

$log = 'D:\Projects\aquasweep-dashboard\infra\log\mosquitto-restart.log'
function Note($m) {
  $line = "$(Get-Date -Format s)  $m"
  $line | Tee-Object -FilePath $log -Append | Out-Null
}

$mqttDir        = 'C:\Program Files\Mosquitto'
$repoConf       = 'D:\Projects\aquasweep-dashboard\infra\mosquitto.conf'
$installConf    = Join-Path $mqttDir 'mosquitto.conf'
$backup         = 'D:\Projects\aquasweep-dashboard\infra\mosquitto.conf.original.bak'

if (-not (Test-Path $repoConf)) { Note "FATAL: repo config missing: $repoConf"; exit 1 }
if (-not (Test-Path $installConf)) { Note "FATAL: install config missing: $installConf"; exit 1 }

# Back up the stock config once, then install ours (the Windows service always
# reads <install-dir>\mosquitto.conf, so restarting the service picks it up).
if (-not (Test-Path $backup)) {
  Copy-Item $installConf $backup -Force
  Note "backed up stock config -> $backup"
}
Copy-Item $repoConf $installConf -Force
Note "installed repo config -> $installConf"

# Restart the service
sc.exe stop mosquitto | Out-Null
Start-Sleep -Seconds 2
sc.exe start mosquitto | Out-Null
Start-Sleep -Seconds 3

$svc = Get-Service mosquitto -ErrorAction SilentlyContinue
Note "service state: $($svc.Status)"

# Verify listeners
$listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in 1883, 9001 }
if ($listeners) {
  $listeners | ForEach-Object { Note "listening $($_.LocalAddress):$($_.LocalPort) (pid $($_.OwningProcess))" }
} else {
  Note "WARNING: no listener on 1883/9001 after restart"
}

# Inbound firewall rules so the ESP32 (LAN) can reach 1883 and dashboards on
# other machines can reach 9001. Loopback (localhost) is unaffected.
foreach ($r in @(
  @{ Name = 'AquaSweep-MQTT-1883'; Port = 1883 },
  @{ Name = 'AquaSweep-MQTT-WS-9001'; Port = 9001 }
)) {
  if (-not (Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $r.Port | Out-Null
    Note "firewall rule added: $($r.Name) (TCP $($r.Port))"
  } else {
    Note "firewall rule present: $($r.Name)"
  }
}

Note "done."