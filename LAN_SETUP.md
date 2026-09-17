# VibePOS local-network setup

One Windows or macOS computer runs the installed VibePOS app and acts as the
host. Every cashier or inventory operator uses that same host and database.

## Connect another computer or tablet

1. Put the host and client devices on the same Wi-Fi/Ethernet network.
2. Start VibePOS on the host computer and keep it running.
3. Find the host's IPv4 address:
   - Windows: run `ipconfig` and use the Wi-Fi/Ethernet **IPv4 Address**.
   - macOS: System Settings > Network > Wi-Fi/Ethernet > Details > TCP/IP.
4. On another device, open `http://HOST_IP:4321` in a browser. For example:
   `http://192.168.1.25:4321`.

`http://pos.local:4321` is also advertised, but `.local`/mDNS is not supported
reliably by every Windows, Android, router, or guest-network configuration. The
numeric IP address is the reliable fallback. Reserve that IP in the router's
DHCP settings so the address does not change.

## Firewall

Allow the VibePOS/Node frontend through the host firewall on **Private networks**.
The required inbound TCP port is:

- `4321`: VibePOS web interface

Browser API requests are proxied through port `4321`, so LAN clients do not
need direct access to backend port `8000`.

Do not expose this port to the public internet. Use it only on a trusted
local network. Guest Wi-Fi commonly blocks devices from talking to one another;
disable client/AP isolation or use the main LAN.
