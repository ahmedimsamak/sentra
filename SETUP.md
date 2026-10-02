## Environment Setup
pip install --upgrade pip
pip install -r requirements.txt

python backend/app.py

Browser:
http://localhost:5000

---

## Esp32 Arduino IDE Setup

- To use #include <ArduinoJson.h> on an ESP32 Dev Board T-Display in the Arduino IDE, you must install the ArduinoJson library. 

	- Open the Arduino IDE.
	- Go to Sketch > Include Library > Manage Libraries...
	- Search for ArduinoJson (by Benoit Blanchon). 
	- Click Install.

- In the Arduino IDE: Sketch → Include Library → Manage Libraries → search "DHT sensor library" → Install. 
- Install DHT sensor library + Adafruit Unified Sensor (dependency)

---

## Resolving Connection Issues

# Resolving "Connection Refused" — ESP32 → Flask Server

The log shows your ESP32 is reaching the network layer but the TCP connection is being **actively rejected** — not timed out, not DNS failure. That's the signature of a **Windows Firewall drop** or a **wrong IP address**. Below is the complete fix for both scenarios.

> **Note on the payload:** Your log shows `"temperature":0,"humidity":0,"gas_level":0`. This is a separate issue — likely the warm-up block returning early before sensor values are populated. Fix the connection first, then address the zero readings.

---

## Scenario A — Router Connection (Both on Same Wi-Fi)

### Step 1: Verify Flask is binding to all interfaces

Your `app.py` already has the correct line:

```python
app.run(host="0.0.0.0", port=5000, debug=True)
```

`0.0.0.0` means "listen on every network interface." If you see `Running on http://127.0.0.1:5000` **without** `http://192.168.x.x:5000`, Flask is only listening locally. Confirm the startup log shows **both** lines:

```
* Running on all addresses (0.0.0.0)
* Running on http://127.0.0.1:5000
* Running on http://192.168.1.100:5000   ← your LAN IP
```

If the last line is missing, check for a `.env` file or environment variable overriding `host`.

### Step 2: Find the correct PC IP address

```powershell
ipconfig
```

Look for the **IPv4 Address** under your active Wi-Fi adapter. Example:

```
Wireless LAN adapter Wi-Fi:
   IPv4 Address. . . . . . . . . . . : 192.168.1.100
```

Update your ESP32 code:

```cpp
const char* API_URL = "http://192.168.1.100:5000/api/predict";
```

### Step 3: Set the network profile to Private (most common fix)

Windows treats **Public** networks as untrusted and blocks all incoming connections from other devices — even on the same subnet. This is the #1 cause of "connection refused" in ESP32 + Flask setups.

**GUI method:**
1. Open **Settings → Network & Internet → Wi-Fi**
2. Click your connected network name
3. Under **Network profile type**, select **Private network**

**PowerShell method (run as Administrator):**

```powershell
# List all network profiles
Get-NetConnectionProfile

# Set the Wi-Fi profile to Private (replace "YourWiFiName")
Set-NetConnectionProfile -Name "YourWiFiName" -NetworkCategory Private
```

### Step 4: Add a Windows Firewall inbound rule for port 5000

Even with the Private profile, Windows Defender blocks unsolicited inbound TCP by default. You must explicitly allow port 5000.

**Option A — GUI:**
1. Press `Win + R`, type `wf.msc`, press Enter
2. Click **Inbound Rules → New Rule…**
3. Type: **Port** → Next
4. Protocol: **TCP** → Specific local ports: **5000** → Next
5. Action: **Allow the connection** → Next
6. Profiles: check **Private** (and Domain if applicable) → Next
7. Name: `Flask API 5000` → Finish

**Option B — PowerShell (one-liner, run as Administrator):**

```powershell
New-NetFirewallRule -DisplayName "Flask API 5000" `
  -Direction Inbound -Protocol TCP -LocalPort 5000 `
  -Action Allow -Profile Private
```

**Option C — `netsh` (equivalent, works on older Windows):**

```powershell
netsh advfirewall firewall add rule name="Flask API 5000" dir=in action=allow protocol=TCP localport=5000
```

### Step 5: Test from the PC first

Before touching the ESP32, verify the server is reachable from another device on the same network:

```bash
# From your PC
curl http://192.168.1.100:5000/api/status

# From your phone (same Wi-Fi) — open browser
http://192.168.1.100:5000/api/status
```

If the PC's `curl` works but the phone's browser doesn't, the firewall rule isn't applied to the right profile.

### Step 6: Test from the ESP32

Add this diagnostic block to your ESP32 sketch to isolate where the failure occurs:

```cpp
// At the top of setup(), after WiFi.begin()
Serial.print("[NET] ESP32 IP: ");
Serial.println(WiFi.localIP());
Serial.print("[NET] Gateway: ");
Serial.println(WiFi.gatewayIP());
Serial.print("[NET] Subnet: ");
Serial.println(WiFi.subnetMask());

// Ping the server IP
WiFiClient testClient;
if (testClient.connect("192.168.1.100", 5000)) {
    Serial.println("[NET] TCP connect OK — server is reachable");
    testClient.stop();
} else {
    Serial.println("[NET] TCP connect FAILED — firewall or wrong IP");
}
```

If the TCP connect succeeds but the HTTP POST fails, the issue is in the HTTP layer (headers, JSON format). If it fails, it's network/firewall.

---

## Scenario B — Windows Mobile Hotspot (PC as Access Point)

### How the hotspot network is structured

When you enable Windows Mobile Hotspot:

| Component | Address |
|---|---|
| **PC (server)** | `192.168.137.1` (fixed, always) |
| **ESP32 (client)** | `192.168.137.x` (assigned by Windows DHCP) |
| **Subnet mask** | `255.255.255.0` |

The PC's hotspot adapter is a **separate virtual network interface** (`Microsoft Wi-Fi Direct Virtual Adapter`). It has its **own network profile** — often set to **Public** by default. You must set it to **Private** independently from your regular Wi-Fi adapter.

### Step 1: Confirm the hotspot adapter IP

```powershell
ipconfig | findstr /C:"192.168.137"
```

You should see:

```
IPv4 Address. . . . . . . . . . . : 192.168.137.1
```

If the hotspot adapter shows a different address (or none), the hotspot isn't running properly. Toggle it off and on in **Settings → Network & Internet → Mobile hotspot**.

### Step 2: Set the hotspot network profile to Private

```powershell
# Find the hotspot profile name (usually "Local Area Connection* X")
Get-NetConnectionProfile

# Set it to Private
Set-NetConnectionProfile -InterfaceAlias "Local Area Connection* 1" -NetworkCategory Private
```

Replace `"Local Area Connection* 1"` with the actual alias from the first command.

### Step 3: Add the firewall rule for the hotspot profile

The firewall rule from Scenario A Step 4 covers **Private** profiles. If your hotspot adapter is on a **different profile**, add a rule specifically for it, or apply the rule to **all profiles**:

```powershell
New-NetFirewallRule -DisplayName "Flask API 5000 (All Profiles)" `
  -Direction Inbound -Protocol TCP -LocalPort 5000 `
  -Action Allow -Profile Any
```

### Step 4: Update the ESP32 URL

```cpp
const char* API_URL = "http://192.168.137.1:5000/api/predict";
```

**Important:** Do **not** use `localhost` or `127.0.0.1` — those refer to the ESP32 itself, not the PC.

### Step 5: Verify the ESP32 got an IP in the hotspot range

Add to your ESP32 diagnostic:

```cpp
Serial.print("[NET] ESP32 IP: ");
Serial.println(WiFi.localIP());   // must be 192.168.137.x

Serial.print("[NET] Gateway: ");
Serial.println(WiFi.gatewayIP()); // must be 192.168.137.1
```

If the ESP32 shows an IP outside `192.168.137.x`, it connected to a **different network** (e.g., a phone hotspot with the same SSID, or a neighbor's Wi-Fi). Verify the SSID in your ESP32 code matches the Windows hotspot name exactly.

### Step 6: Windows Hotspot + ICS caveat

If **Internet Connection Sharing (ICS)** is enabled on the hotspot, Windows may block **inbound traffic to the host machine** on certain ports. Test by temporarily disabling ICS:

```powershell
# Check ICS status
Get-Service SharedAccess

# Stop it temporarily for testing
Stop-Service SharedAccess
```

If the ESP32 connects after stopping ICS, add an explicit firewall rule for the ICS interface, then restart the service.

---

## Diagnostic Flowchart

```
ESP32 says "connection refused"
        │
        ▼
Is Flask running? ──No──► Start `python app.py`
        │
        Yes
        ▼
Does `curl http://<PC-IP>:5000/api/status` work on the PC? ──No──► Flask bind issue
        │
        Yes
        ▼
Does it work from another device (phone) on the same network? ──No──► Firewall rule missing
        │
        Yes
        ▼
Is the ESP32 on the SAME subnet as the PC? ──No──► Wrong SSID / DHCP range
        │
        Yes
        ▼
Is Windows network profile set to Private? ──No──► Set-NetConnectionProfile
        │
        Yes
        ▼
Is port 5000 allowed inbound in Windows Firewall? ──No──► New-NetFirewallRule
        │
        Yes
        ▼
Does ESP32 ping the PC IP? ──No──► Router AP isolation / client isolation
        │
        Yes
        ▼
Enable Core Debug Level = Verbose in Arduino IDE → check serial output
```

---

## Quick Reference — All Fix Commands

| Fix | Command |
|---|---|
| **Find PC IP** | `ipconfig` |
| **Set network to Private** | `Set-NetConnectionProfile -Name "WiFiName" -NetworkCategory Private` |
| **Allow port 5000 (Private)** | `New-NetFirewallRule -DisplayName "Flask 5000" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -Profile Private` |
| **Allow port 5000 (All profiles)** | `New-NetFirewallRule -DisplayName "Flask 5000" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -Profile Any` |
| **Check firewall rules** | `Get-NetFirewallRule -DisplayName "*Flask*"` |
| **Delete a rule** | `Remove-NetFirewallRule -DisplayName "Flask 5000"` |
| **Check hotspot IP** | `ipconfig \| findstr /C:"192.168.137"` |
| **Test from PC** | `curl http://192.168.1.100:5000/api/status` |
| **Test TCP from ESP32** | `WiFiClient c; c.connect("192.168.1.100", 5000);` |

---

## Common Causes Ranked by Frequency

| Rank | Cause | Fix |
|---|---|---|
| **1** | Network profile set to **Public** | Change to Private |
| **2** | No inbound firewall rule for port 5000 | Add `New-NetFirewallRule` |
| **3** | Wrong IP in ESP32 code (`192.168.1.100` vs actual) | Re-run `ipconfig`, update code |
| **4** | ESP32 on a **different network** than the PC | Check SSID and subnet |
| **5** | Flask bound to `127.0.0.1` instead of `0.0.0.0` | Verify startup log |
| **6** | Router **AP isolation** enabled | Disable in router admin panel |
| **7** | Antivirus (third-party) blocking port 5000 | Add exception or test with it disabled |

---

## About the Zero Readings in Your Log

Once the connection works, your ESP32 will still send `"temperature":0,"humidity":0,"gas_level":0` if the **warm-up block** we discussed earlier is still gating the reads. The `return` inside `if (isWarmingUp)` skips `simReadSensors()` (or `dht.readTemperature()`), so the variables remain at their initial `0` values. Either:

- Wait 60 seconds after boot for warm-up to complete, **or**
- Apply Fix C from the previous discussion (push warm-up into the simulator) so the firmware path doesn't skip the read

The connection refusal is a **network issue**; the zero readings are a **firmware logic issue**. They are independent — fixing one will not fix the other.




