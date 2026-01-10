# RemoEdPH Project Backup Script
# This script creates a comprehensive backup of the entire project

param(
    [string]$BackupPath = "C:\RemoEdPH-Backup",
    [string]$ProjectPath = "C:\Users\Window11\online-distance-learning"
)

Write-Host "🚀 Starting RemoEdPH Project Backup..." -ForegroundColor Green
Write-Host "📁 Project Path: $ProjectPath" -ForegroundColor Yellow
Write-Host "💾 Backup Path: $BackupPath" -ForegroundColor Yellow

# Create backup directory with timestamp
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = "$BackupPath\RemoEdPH-Backup_$timestamp"

try {
    # Create backup directory
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    Write-Host "✅ Created backup directory: $backupDir" -ForegroundColor Green

    # 1. Backup Code Files (excluding node_modules)
    Write-Host "📦 Backing up code files..." -ForegroundColor Cyan
    
    $codeBackupDir = "$backupDir\code"
    New-Item -ItemType Directory -Force -Path $codeBackupDir | Out-Null
    
    # Copy all files except node_modules
    $excludeDirs = @("node_modules", ".git", "backup", "*.log")
    $includeFiles = @("*.js", "*.html", "*.css", "*.json", "*.md", "*.txt", "*.png", "*.jpg", "*.jpeg", "*.gif", "*.ico")
    
    Get-ChildItem -Path $ProjectPath -Recurse | Where-Object {
        $isExcluded = $false
        foreach ($exclude in $excludeDirs) {
            if ($_.FullName -like "*$exclude*") {
                $isExcluded = $true
                break
            }
        }
        return -not $isExcluded
    } | ForEach-Object {
        $relativePath = $_.FullName.Substring($ProjectPath.Length + 1)
        $targetPath = Join-Path $codeBackupDir $relativePath
        
        if ($_.PSIsContainer) {
            New-Item -ItemType Directory -Force -Path $targetPath | Out-Null
        } else {
            $targetDir = Split-Path $targetPath -Parent
            if (!(Test-Path $targetDir)) {
                New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
            }
            Copy-Item $_.FullName $targetPath -Force
        }
    }
    
    Write-Host "✅ Code backup completed" -ForegroundColor Green

    # 2. Backup Database
    Write-Host "🗄️ Backing up database..." -ForegroundColor Cyan
    
    $dbBackupDir = "$backupDir\database"
    New-Item -ItemType Directory -Force -Path $dbBackupDir | Out-Null
    
    # Check if MongoDB is running
    $mongoProcess = Get-Process -Name "mongod" -ErrorAction SilentlyContinue
    if ($mongoProcess) {
        Write-Host "📊 MongoDB is running, creating database dump..." -ForegroundColor Yellow
        
        # Create MongoDB dump
        $dumpPath = "$dbBackupDir\mongodb-dump"
        & "C:\Program Files\MongoDB\Server\8.0\bin\mongodump.exe" --db online-distance-learning --out $dumpPath
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Database dump completed" -ForegroundColor Green
        } else {
            Write-Host "⚠️ Database dump failed, but continuing..." -ForegroundColor Yellow
        }
    } else {
        Write-Host "⚠️ MongoDB is not running, skipping database dump" -ForegroundColor Yellow
    }
    
    # 3. Backup MongoDB data directory
    Write-Host "📁 Backing up MongoDB data directory..." -ForegroundColor Cyan
    
    $mongoDataDirs = @(
        "C:\Program Files\MongoDB\Server\8.0\data",
        "C:\data\db"
    )
    
    foreach ($dataDir in $mongoDataDirs) {
        if (Test-Path $dataDir) {
            $targetDataDir = "$dbBackupDir\mongodb-data-$(Split-Path $dataDir -Leaf)"
            Copy-Item -Path $dataDir -Destination $targetDataDir -Recurse -Force
            Write-Host "✅ MongoDB data directory backed up: $dataDir" -ForegroundColor Green
        }
    }

    # 4. Create backup manifest
    Write-Host "📋 Creating backup manifest..." -ForegroundColor Cyan
    
    $manifest = @{
        backupDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        projectPath = $ProjectPath
        backupPath = $backupDir
        codeFiles = (Get-ChildItem -Path $codeBackupDir -Recurse -File).Count
        databaseBackup = Test-Path "$dbBackupDir\mongodb-dump"
        mongoDataBackup = Test-Path "$dbBackupDir\mongodb-data-*"
        totalSize = [math]::Round((Get-ChildItem -Path $backupDir -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB, 2)
    }
    
    $manifest | ConvertTo-Json -Depth 10 | Out-File "$backupDir\backup-manifest.json" -Encoding UTF8
    Write-Host "✅ Backup manifest created" -ForegroundColor Green

    # 5. Create restore instructions
    Write-Host "📖 Creating restore instructions..." -ForegroundColor Cyan
    
    $restoreInstructions = @"
# RemoEdPH Project Restore Instructions

## Backup Information
- Backup Date: $($manifest.backupDate)
- Project Path: $($manifest.projectPath)
- Backup Path: $($manifest.backupPath)
- Code Files: $($manifest.codeFiles)
- Database Backup: $($manifest.databaseBackup)
- Total Size: $($manifest.totalSize) MB

## How to Restore

### 1. Restore Code Files
1. Copy all files from `$codeBackupDir` to your project directory
2. Run `npm install` to reinstall dependencies
3. Start the server with `node server/index.js`

### 2. Restore Database
1. Stop MongoDB if running
2. Copy MongoDB data from `$dbBackupDir\mongodb-data-*` to your MongoDB data directory
3. Or restore from dump using: `mongorestore --db online-distance-learning $dbBackupDir\mongodb-dump\online-distance-learning`

### 3. Restore with Seeding Script
If database restore fails, run the seeding script:
1. Navigate to server directory
2. Run: `node seed-data.js`

## Login Credentials
- Admin: admin@remoedph.com / admin123
- Teachers: kjbflores@remoedph.com, teacher2@remoedph.com / teacher123
- Students: student1@remoedph.com, student2@remoedph.com / student123

## Important Notes
- This backup was created on $($manifest.backupDate)
- Always test the restore process in a safe environment first
- Keep this backup in a secure location
"@
    
    $restoreInstructions | Out-File "$backupDir\RESTORE-INSTRUCTIONS.md" -Encoding UTF8
    Write-Host "✅ Restore instructions created" -ForegroundColor Green

    # 6. Create compressed backup
    Write-Host "🗜️ Creating compressed backup..." -ForegroundColor Cyan
    
    $compressedBackup = "$BackupPath\RemoEdPH-Backup_$timestamp.zip"
    
    # Use PowerShell to create ZIP (requires .NET Framework)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory($backupDir, $compressedBackup)
    
    $compressedSize = [math]::Round((Get-Item $compressedBackup).Length / 1MB, 2)
    Write-Host "✅ Compressed backup created: $compressedBackup ($compressedSize MB)" -ForegroundColor Green

    # 7. Clean up uncompressed backup (optional)
    Write-Host "🧹 Cleaning up uncompressed backup..." -ForegroundColor Cyan
    Remove-Item -Path $backupDir -Recurse -Force
    Write-Host "✅ Cleanup completed" -ForegroundColor Green

    # Final summary
    Write-Host "`n🎉 Backup completed successfully!" -ForegroundColor Green
    Write-Host "📁 Backup location: $compressedBackup" -ForegroundColor Yellow
    Write-Host "📊 Backup size: $compressedSize MB" -ForegroundColor Yellow
    Write-Host "📅 Backup date: $($manifest.backupDate)" -ForegroundColor Yellow
    
    # Create backup log
    $logEntry = "$($manifest.backupDate) - Backup created: $compressedBackup ($compressedSize MB)`n"
    Add-Content -Path "$BackupPath\backup-log.txt" -Value $logEntry
    
    Write-Host "`n💡 Tip: Keep this backup in a safe location and test the restore process!" -ForegroundColor Cyan

} catch {
    Write-Host "❌ Backup failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Stack trace: $($_.ScriptStackTrace)" -ForegroundColor Red
    exit 1
} 