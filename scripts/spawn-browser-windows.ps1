param(
  [Parameter(Mandatory=$true)][string]$ConfigJson
)

$cfg = $ConfigJson | ConvertFrom-Json

$cmdLine = ""
if ($cfg.commandLine) {
  $cmdLine = $cfg.commandLine
} elseif ($cfg.browserPath) {
  $escapedArgs = $cfg.args | ForEach-Object {
    if ($_ -match '[\s"]') {
      '"' + ($_ -replace '"', '\"') + '"'
    } else {
      $_
    }
  }
  $cmdLine = "`"$($cfg.browserPath)`" " + ($escapedArgs -join ' ')
} elseif ($cfg.command) {
  $escapedArgs = $cfg.args | ForEach-Object {
    if ($_ -match '[\s"]') {
      '"' + ($_ -replace '"', '\"') + '"'
    } else {
      $_
    }
  }
  $inner = "`"$($cfg.command)`" " + ($escapedArgs -join ' ')
  $envPrefix = ""
  if ($cfg.env) {
    $cfg.env.psobject.properties | ForEach-Object {
      $envPrefix += "set $($_.Name)=$($_.Value)&& "
    }
  }
  if ($cfg.stdoutFile) {
    $cmdLine = "cmd.exe /c `"$envPrefix$inner > `"$($cfg.stdoutFile)`" 2>&1`""
  } else {
    $cmdLine = if ($envPrefix) { "cmd.exe /c `"$envPrefix$inner`"" } else { $inner }
  }
}

$argsMap = @{ CommandLine = $cmdLine }
if ($cfg.cwd) {
  $argsMap.CurrentDirectory = $cfg.cwd
}

$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments $argsMap
if ($result.ReturnValue -ne 0) {
  Write-Error "Win32_Process.Create failed with code: $($result.ReturnValue)"
  exit $result.ReturnValue
}
Write-Output $result.ProcessId
