# Ноутбук не уходит в сон от простоя (на питании от сети). Запуск от администратора.
# После перезагрузки настройки AC сохраняются; для батареи — отдельно ниже.
$ErrorActionPreference = "Stop"

Write-Host "AC power: no sleep/hibernate on idle"
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change monitor-timeout-ac 45

Write-Host "On battery: allow sleep after 30 min (change if needed)"
powercfg /change standby-timeout-dc 30

Write-Host "Done. Plug in laptop for 24/7 bot operation."
