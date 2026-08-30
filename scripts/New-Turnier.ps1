<#
.SYNOPSIS
    Erzeugt die Turnierdatei (Raster + Spieler) für die Vereinsmeisterschaft.

.DESCRIPTION
    Liest je Bewerb eine Namensliste (eine Zeile pro Spieler, Reihenfolge = Setzung)
    und baut daraus ein vollständiges K.-o.-Raster: Spieler auf den Setzpositionen,
    alle Spiele mit Sieger-Referenzen. Fehlende Nennungen werden mit "Freilos"
    aufgefüllt - der Gegner steigt dann automatisch auf.

    Achtung: Die Datei wird komplett neu geschrieben. Bereits eingetragene
    Ergebnisse gehen verloren, darum ist -Force nötig, wenn die Zieldatei existiert.

.EXAMPLE
    .\scripts\New-Turnier.ps1 -A .\_archiv\spieler-a.txt -B .\_archiv\spieler-b.txt -Force

.EXAMPLE
    .\scripts\New-Turnier.ps1 -A .\a.txt -B .\b.txt -Deadlines '2026-08-28','2026-09-06','2026-09-13','2026-09-20'
#>
[CmdletBinding()]
param(
    # Namensliste A-Bewerb (eine Zeile pro Spieler, Reihenfolge = Setzung)
    [Parameter(Mandatory)][string]$A,
    # Namensliste B-Bewerb
    [Parameter(Mandatory)][string]$B,
    [string]$Ziel = "$PSScriptRoot\..\docs\data\vm-2026.json",
    [int]$Groesse = 16,
    [string]$Verein = 'UTC Ostermiething',
    [string]$Titel = 'Vereinsmeisterschaft 2026',
    [string]$Hinweis = 'Ergebnisse bitte an die Turnierleitung melden.',
    # Deadline je Runde (Runde 1 zuerst); leer lassen, wenn es keine gibt
    [string[]]$Deadlines = @(),
    [switch]$Demo,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

if (($Groesse -band ($Groesse - 1)) -ne 0 -or $Groesse -lt 2) {
    throw "Rastergroesse muss eine Zweierpotenz sein (2, 4, 8, 16, 32). Angegeben: $Groesse"
}
if ((Test-Path $Ziel) -and -not $Force) {
    throw "$Ziel existiert bereits. Mit -Force überschreiben (eingetragene Ergebnisse gehen dabei verloren)."
}

# Setzreihenfolge wie im klassischen Turnierraster:
# 16er-Raster -> 1, 16, 9, 8, 5, 12, 13, 4, 3, 14, 11, 6, 7, 10, 15, 2
function Get-Setzreihenfolge {
    param([int]$Groesse)
    $reihe = @(1, 2)
    while ($reihe.Count -lt $Groesse) {
        $n = $reihe.Count * 2
        $neu = New-Object System.Collections.Generic.List[int]
        for ($i = 0; $i -lt $reihe.Count; $i++) {
            $s = $reihe[$i]
            if ($i % 2 -eq 0) { $neu.Add($s); $neu.Add($n + 1 - $s) }
            else { $neu.Add($n + 1 - $s); $neu.Add($s) }
        }
        $reihe = $neu.ToArray()
    }
    return $reihe
}

function Get-Namen {
    param([string]$Pfad)
    if (-not (Test-Path $Pfad)) { throw "Namensliste nicht gefunden: $Pfad" }
    Get-Content -LiteralPath $Pfad -Encoding UTF8 |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ -and -not $_.StartsWith('#') }
}

function New-Bewerb {
    param([string]$Id, [string]$Name, [string[]]$Namen, [int]$Groesse, [string[]]$Deadlines)

    if ($Namen.Count -gt $Groesse) {
        throw "$Name : $($Namen.Count) Namen passen nicht in ein ${Groesse}er-Raster."
    }
    $runden = [int][Math]::Log($Groesse, 2)
    $setzung = Get-Setzreihenfolge -Groesse $Groesse

    # Setzung Nr. n (1 = stärkster) landet auf jener Rasterposition,
    # an der ihre Nummer in der Setzreihenfolge steht.
    $spieler = @()
    for ($pos = 1; $pos -le $Groesse; $pos++) {
        $setznummer = $setzung[$pos - 1]
        $spielerName = if ($setznummer -le $Namen.Count) { $Namen[$setznummer - 1] } else { 'Freilos' }
        $eintrag = [ordered]@{ pos = $pos; name = $spielerName }
        if ($setznummer -le 4 -and $setznummer -le $Namen.Count) { $eintrag['setzung'] = $setznummer }
        $spieler += [pscustomobject]$eintrag
    }

    $spiele = @()
    for ($runde = 1; $runde -le $runden; $runde++) {
        $anzahl = $Groesse / [Math]::Pow(2, $runde)
        for ($nr = 1; $nr -le $anzahl; $nr++) {
            if ($runde -eq 1) {
                $heim = [ordered]@{ quelle = 'spieler'; pos = ($nr * 2 - 1) }
                $gast = [ordered]@{ quelle = 'spieler'; pos = ($nr * 2) }
            }
            else {
                $heim = [ordered]@{ quelle = 'sieger'; spiel = "$Id-R$($runde - 1)-$($nr * 2 - 1)" }
                $gast = [ordered]@{ quelle = 'sieger'; spiel = "$Id-R$($runde - 1)-$($nr * 2)" }
            }
            $spiele += [pscustomobject][ordered]@{
                id       = "$Id-R$runde-$nr"
                runde    = $runde
                heim     = [pscustomobject]$heim
                gast     = [pscustomobject]$gast
                termin   = $null
                platz    = $null
                ergebnis = $null
            }
        }
    }

    $deadlineObjekt = [ordered]@{}
    for ($runde = 1; $runde -le $runden; $runde++) {
        if ($Deadlines.Count -ge $runde -and $Deadlines[$runde - 1]) {
            $deadlineObjekt["$runde"] = $Deadlines[$runde - 1]
        }
    }

    return [pscustomobject][ordered]@{
        id        = $Id
        name      = $Name
        groesse   = $Groesse
        deadlines = [pscustomobject]$deadlineObjekt
        spieler   = $spieler
        spiele    = $spiele
    }
}

$turnier = [ordered]@{
    verein  = $Verein
    titel   = $Titel
    stand   = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
    hinweis = $Hinweis
}
if ($Demo) { $turnier['demo'] = $true }
$turnier['bewerbe'] = @(
    (New-Bewerb -Id 'A' -Name 'A-Bewerb' -Namen (Get-Namen $A) -Groesse $Groesse -Deadlines $Deadlines),
    (New-Bewerb -Id 'B' -Name 'B-Bewerb' -Namen (Get-Namen $B) -Groesse $Groesse -Deadlines $Deadlines)
)

$json = [pscustomobject]$turnier | ConvertTo-Json -Depth 12
$zielPfad = [System.IO.Path]::GetFullPath($Ziel)
$ordner = Split-Path -Parent $zielPfad
if (-not (Test-Path $ordner)) { New-Item -ItemType Directory -Path $ordner | Out-Null }
[System.IO.File]::WriteAllText($zielPfad, $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Output "Turnierdatei geschrieben: $zielPfad"
Write-Output "Bitte pruefen mit: node scripts/check-data.mjs"
