# OPTIONAL. Run from an *administrator* PowerShell only if players cannot connect and you did not get
# (or dismissed) the Windows "Allow access" prompt. Opens TCP 7350 inbound on PRIVATE networks only.
# Undo: Remove-NetFirewallRule -DisplayName 'Skyfire Squad LAN host'
New-NetFirewallRule -DisplayName 'Skyfire Squad LAN host' -Direction Inbound -Protocol TCP -LocalPort 7350 -Action Allow -Profile Private
Write-Host 'Allowed TCP 7350 on Private networks. Make sure your Wi-Fi is set to a Private network profile.'
