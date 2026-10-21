param([string]$InvokeName = '', [string]$DialogName = '', [string]$StatePath = (Join-Path $PSScriptRoot 'active-profile.json'))
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$profile = Get-Content $StatePath -Raw | ConvertFrom-Json
$taskProcess = Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe' OR Name = 'msedge.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($profile.dir) -and !$_.CommandLine.Contains('--type=') }
if (@($taskProcess).Count -ne 1) { throw 'Expected exactly one isolated test browser' }
$condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty, [int]$taskProcess.ProcessId)
$windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
foreach ($window in $windows) {
  $elements = $window.FindAll([System.Windows.Automation.TreeScope]::Subtree, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($element in $elements) {
    $name = $element.Current.Name
    $type = $element.Current.ControlType.ProgrammaticName
    if ($name) { Write-Output "$type | $name" }
    if ($InvokeName -and $name -ceq $InvokeName -and $type -eq 'ControlType.Button' -and $element.Current.IsEnabled) {
      $pattern = $element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
      $pattern.Invoke()
      Write-Output "INVOKED $InvokeName"
      exit 0
    }
  }
}
if ($InvokeName) { throw "Button not found: $InvokeName" }
