param(
  [Parameter(Mandatory=$true)]
  [string]$SourceDir
)

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Read-EntryText($entry) {
  $reader = New-Object IO.StreamReader($entry.Open())
  try { return $reader.ReadToEnd() } finally { $reader.Close() }
}

function Read-Sheet($path) {
  $zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $path))
  try {
    $sharedStrings = @()
    $sharedEntry = $zip.GetEntry('xl/sharedStrings.xml')
    if ($sharedEntry) {
      $sharedXml = [xml](Read-EntryText $sharedEntry)
      $sharedXml.GetElementsByTagName('si') | ForEach-Object {
        $parts = @()
        $_.GetElementsByTagName('t') | ForEach-Object { $parts += $_.'#text' }
        $sharedStrings += ($parts -join '')
      }
    }

    $sheetEntry = $zip.GetEntry('xl/worksheets/sheet1.xml')
    if (-not $sheetEntry) { return }
    $sheetXml = [xml](Read-EntryText $sheetEntry)
    foreach ($row in $sheetXml.GetElementsByTagName('row')) {
      if ([int]$row.r -lt 4) { continue }
      $cells = @{}
      foreach ($cell in $row.GetElementsByTagName('c')) {
        $valueNode = $cell.GetElementsByTagName('v') | Select-Object -First 1
        if (-not $valueNode) { continue }
        $value = $valueNode.'#text'
        if ($cell.t -eq 's') { $value = $sharedStrings[[int]$value] }
        $column = ($cell.r -replace '\d', '')
        $cells[$column] = $value
      }

      $name = $cells['A']
      $total = $cells['U']
      if (-not $name -or -not $total -or $name -match '^\d+\s+PCHs$') { continue }

      $address = $cells['C']
      if (-not $address) { $address = $cells['B'] }
      $source = [IO.Path]::GetFileName($path)
      $sdoCode = if ($source -match '_([^_]+)_(?:April|FEB|FEBRUARY|FEB2026)') { $matches[1] } else { 'UNKNOWN' }
      if ($source -match 'WRHA') { $sdoCode = 'WRHA' }
      if ($source -match 'IERHA') { $sdoCode = 'IERHA' }
      if ($source -match 'NRHA') { $sdoCode = 'NRHA' }
      if ($source -match 'PMH') { $sdoCode = 'PMH' }
      if ($source -match 'SH-SS') { $sdoCode = 'SH-SS' }

      [pscustomobject]@{
        sdoCode = $sdoCode
        source = $source
        name = ($name -replace '\s+', ' ').Trim()
        address = (($address -replace '\s+', ' ').Trim())
        operator = (($cells['E'] -replace '\s+', ' ').Trim())
        generalBeds = [int]($cells['L'] -replace '[^\d]', '')
        respiteBeds = if ($cells['M']) { [int]($cells['M'] -replace '[^\d]', '') } else { 0 }
        totalBeds = [int]($total -replace '[^\d]', '')
      }
    }
  } finally {
    $zip.Dispose()
  }
}

$results = Get-ChildItem -LiteralPath $SourceDir -Filter '*.xlsx' | ForEach-Object { Read-Sheet $_.FullName }
$results | ConvertTo-Json -Depth 5
