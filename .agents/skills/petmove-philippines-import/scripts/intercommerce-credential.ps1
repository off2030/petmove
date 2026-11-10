# Local secret storage only. Never write a password or customer identity to the repository.
# Dot-source this file; returned SecureString values must not be printed to tool output.
function Get-PetmoveInterCommerceSecretPath {
    if ([Environment]::OSVersion.Platform -ne 'Win32NT') {
        throw 'InterCommerce local credentials require the original Windows user.'
    }
    Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Petmove\Credentials\intercommerce-default.dpapi'
}

function Save-PetmoveInterCommercePassword {
    param([Parameter(Mandatory = $true)][System.Security.SecureString]$Password)
    if ($Password.Length -eq 0) { throw 'An empty password cannot be saved.' }
    $secretPath = Get-PetmoveInterCommerceSecretPath
    $secretDirectory = Split-Path -Parent $secretPath
    [IO.Directory]::CreateDirectory($secretDirectory) | Out-Null

    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetOwner($identity)
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($principal in @($identity, $system)) {
        $rule = [Security.AccessControl.FileSystemAccessRule]::new(
            $principal, 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow'
        )
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $secretDirectory -AclObject $acl -ErrorAction Stop
    # Without a supplied key, Windows ConvertFrom-SecureString uses current-user DPAPI.
    $cipher = ConvertFrom-SecureString -SecureString $Password -ErrorAction Stop
    $temporaryPath = Join-Path $secretDirectory ([Guid]::NewGuid().ToString() + '.tmp')
    try {
        [IO.File]::WriteAllText($temporaryPath, $cipher, [Text.Encoding]::ASCII)
        Move-Item -LiteralPath $temporaryPath -Destination $secretPath -Force -ErrorAction Stop
    } finally {
        if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath -Force }
    }
}

function Read-PetmoveInterCommercePassword {
    $secretPath = Get-PetmoveInterCommerceSecretPath
    if (-not (Test-Path -LiteralPath $secretPath -PathType Leaf)) {
        throw 'The InterCommerce password has not been provisioned for this Windows user.'
    }
    ConvertTo-SecureString -String ([IO.File]::ReadAllText($secretPath)) -ErrorAction Stop
}
