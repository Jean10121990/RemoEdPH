# Quick RemoEdPH Backup Script
Write-Host "Creating quick backup of RemoEdPH project..." -ForegroundColor Green

# Create backup directory
$backupPath = "C:\RemoEdPH-Backup"
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = "$backupPath\RemoEdPH-QuickBackup_$timestamp"

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Write-Host "Created backup directory: $backupDir" -ForegroundColor Green

# 1. Backup code files (excluding node_modules)
Write-Host "Backing up code files..." -ForegroundColor Cyan
$codeBackupDir = "$backupDir\code"
New-Item -ItemType Directory -Force -Path $codeBackupDir | Out-Null

# Copy important directories and files
$itemsToBackup = @(
    "public",
    "server",
    "package.json",
    "package-lock.json",
    "README.md",
    "backup-project.ps1",
    "quick-backup.ps1"
)

foreach ($item in $itemsToBackup) {
    if (Test-Path $item) {
        Copy-Item -Path $item -Destination $codeBackupDir -Recurse -Force
        Write-Host "Backed up: $item" -ForegroundColor Green
    }
}

# 2. Backup database data directory
Write-Host "Backing up database..." -ForegroundColor Cyan
$dbBackupDir = "$backupDir\database"
New-Item -ItemType Directory -Force -Path $dbBackupDir | Out-Null

# Try to backup MongoDB data directories
$mongoDataDirs = @(
    "C:\Program Files\MongoDB\Server\8.0\data",
    "C:\data\db"
)

foreach ($dataDir in $mongoDataDirs) {
    if (Test-Path $dataDir) {
        $targetDataDir = "$dbBackupDir\mongodb-data-$(Split-Path $dataDir -Leaf)"
        Copy-Item -Path $dataDir -Destination $targetDataDir -Recurse -Force
        Write-Host "MongoDB data backed up: $dataDir" -ForegroundColor Green
    }
}

# 3. Create backup info
$backupInfo = @{
    backupDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    projectPath = (Get-Location).Path
    backupPath = $backupDir
    codeFiles = (Get-ChildItem -Path $codeBackupDir -Recurse -File).Count
    databaseBackup = Test-Path "$dbBackupDir\mongodb-data-*"
    totalSize = [math]::Round((Get-ChildItem -Path $backupDir -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB, 2)
}

$backupInfo | ConvertTo-Json | Out-File "$backupDir\backup-info.json" -Encoding UTF8

# 4. Create restore instructions
$restoreInstructions = @"
# Quick Restore Instructions

## Backup Information
- Date: $($backupInfo.backupDate)
- Location: $($backupInfo.backupPath)
- Code Files: $($backupInfo.codeFiles)
- Database: $($backupInfo.databaseBackup)
- Size: $($backupInfo.totalSize) MB

## How to Restore

### 1. Restore Code
1. Copy files from '$codeBackupDir' to your project directory
2. Run: npm install
3. Start server: node server/index.js

### 2. Restore Database
1. Stop MongoDB
2. Copy data from '$dbBackupDir\mongodb-data-*' to MongoDB data directory
3. Or run: node server/seed-data.js to recreate data

### 3. Login Credentials
- Admin: admin@remoedph.com / admin123
- Teachers: kjbflores@remoedph.com, teacher2@remoedph.com / teacher123
- Students: student1@remoedph.com, student2@remoedph.com / student123
"@

$restoreInstructions | Out-File "$backupDir\RESTORE.md" -Encoding UTF8

Write-Host "`nQuick backup completed!" -ForegroundColor Green
Write-Host "Backup location: $backupDir" -ForegroundColor Yellow
Write-Host "Backup size: $($backupInfo.totalSize) MB" -ForegroundColor Yellow
Write-Host "Backup date: $($backupInfo.backupDate)" -ForegroundColor Yellow
Write-Host "`nTip: Keep this backup safe!" -ForegroundColor Cyan 