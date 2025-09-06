const { spawn } = require('child_process');
const PowerShell = require('node-powershell');
const path = require('path');
const fs = require('fs').promises;

class WordMacroService {
    constructor() {
        this.isWordAvailable = false;
        this.currentDocument = null;
        this.powerShell = null;
        this.macroScriptPath = path.join(__dirname, '../utils/wordMacros.ps1');
        this.vbaScriptPath = path.join(__dirname, '../utils/wordMacros.vba');
        
        this.initializePowerShell();
        this.createMacroScripts();
    }

    /**
     * Initialize PowerShell instance for Word COM automation
     */
    async initializePowerShell() {
        try {
            this.powerShell = new PowerShell({
                executionPolicy: 'Bypass',
                noProfile: true
            });

            // Test Word availability
            await this.testConnection();
        } catch (error) {
            console.error('Failed to initialize PowerShell for Word integration:', error);
        }
    }

    /**
     * Create necessary macro script files
     */
    async createMacroScripts() {
        try {
            await this.createPowerShellScript();
            await this.createVBAScript();
        } catch (error) {
            console.error('Failed to create macro scripts:', error);
        }
    }

    /**
     * Create PowerShell script for Word automation
     */
    async createPowerShellScript() {
        const psScript = `
# MBA Debate Bot - Word Integration PowerShell Script
# This script provides COM automation for Microsoft Word

function Test-WordConnection {
    try {
        $word = New-Object -ComObject Word.Application
        $word.Visible = $true
        $result = @{
            Success = $true
            Version = $word.Version
            DocumentCount = $word.Documents.Count
        }
        return $result | ConvertTo-Json
    }
    catch {
        return @{
            Success = $false
            Error = $_.Exception.Message
        } | ConvertTo-Json
    }
}

function Get-CurrentCard {
    param([string]$DocumentPath = "")
    
    try {
        $word = New-Object -ComObject Word.Application
        $word.Visible = $true
        
        if ($DocumentPath -and (Test-Path $DocumentPath)) {
            $doc = $word.Documents.Open($DocumentPath)
        } else {
            $doc = $word.ActiveDocument
        }
        
        # Get current selection or cursor position
        $selection = $word.Selection
        
        # Find the current card boundaries
        $cardStart = Find-CardStart $selection
        $cardEnd = Find-CardEnd $selection
        
        # Extract card content
        $cardRange = $doc.Range($cardStart, $cardEnd)
        $cardText = $cardRange.Text
        
        # Parse card components
        $card = Parse-CardContent $cardRange
        
        $result = @{
            Success = $true
            Card = $card
            Position = @{
                Start = $cardStart
                End = $cardEnd
            }
        }
        
        return $result | ConvertTo-Json -Depth 5
    }
    catch {
        return @{
            Success = $false
            Error = $_.Exception.Message
        } | ConvertTo-Json
    }
}

function Find-CardStart {
    param($selection)
    
    # Look backwards for card indicators (Tag, heading styles, etc.)
    $currentPos = $selection.Start
    $doc = $selection.Document
    
    # Search for headings or "Tag" patterns
    $searchRange = $doc.Range(0, $currentPos)
    
    # Look for heading styles or specific text patterns
    $searchRange.Find.ClearFormatting()
    $searchRange.Find.Style = "Heading 1,Heading 2,Heading 3"
    $searchRange.Find.Execute("", $false, $false, $false, $false, $false, $true)
    
    if ($searchRange.Find.Found) {
        return $searchRange.Start
    }
    
    # Fallback: look for paragraph breaks
    $paraStart = $selection.Paragraphs[1].Range.Start
    return $paraStart
}

function Find-CardEnd {
    param($selection)
    
    # Look forward for next card or end of document
    $currentPos = $selection.End
    $doc = $selection.Document
    
    # Search for next heading
    $searchRange = $doc.Range($currentPos, $doc.Content.End)
    $searchRange.Find.ClearFormatting()
    $searchRange.Find.Style = "Heading 1,Heading 2,Heading 3"
    $searchRange.Find.Execute("", $false, $false, $false, $false, $false, $true)
    
    if ($searchRange.Find.Found) {
        return $searchRange.Start
    }
    
    # Fallback: end of document or current paragraph
    return $doc.Content.End
}

function Parse-CardContent {
    param($cardRange)
    
    $card = @{
        Tag = ""
        Cite = ""
        BodyText = ""
        FormattedElements = @()
    }
    
    # Extract text content
    $fullText = $cardRange.Text
    
    # Parse paragraphs
    foreach ($para in $cardRange.Paragraphs) {
        $paraText = $para.Range.Text
        $paraStyle = $para.Style.NameLocal
        
        # Identify card components based on style and position
        if ($paraStyle -like "*Heading*" -or $paraText -match "^[A-Z][^.]*:?\s*$") {
            $card.Tag = $paraText.Trim()
        }
        elseif ($paraText -match "\d{4}|\b[A-Z][a-z]+\s+\d{1,2}\b|et al") {
            $card.Cite = $paraText.Trim()
        }
        else {
            $card.BodyText += $paraText
        }
    }
    
    # Extract formatted elements
    $card.FormattedElements = Get-FormattedElements $cardRange
    
    return $card
}

function Get-FormattedElements {
    param($range)
    
    $elements = @()
    
    # Iterate through characters to find formatting
    for ($i = $range.Start; $i -lt $range.End; $i++) {
        $charRange = $range.Document.Range($i, $i + 1)
        $char = $charRange.Text
        
        if ($char -match '\w') {  # Only process word characters
            $element = @{
                Text = ""
                Type = @()
                Start = $i
                End = $i
            }
            
            # Check formatting
            if ($charRange.Bold) { $element.Type += "emphasis" }
            if ($charRange.Underline -ne 0) { $element.Type += "underline" }
            if ($charRange.Italic) { $element.Type += "emphasis" }
            if ($charRange.HighlightColorIndex -ne 0) { $element.Type += "highlight" }
            
            if ($element.Type.Count -gt 0) {
                # Find the full word/phrase
                $wordStart = $i
                $wordEnd = $i
                
                # Expand to word boundaries
                while ($wordStart -gt $range.Start -and $range.Document.Range($wordStart - 1, $wordStart).Text -match '\w') {
                    $wordStart--
                }
                while ($wordEnd -lt $range.End -and $range.Document.Range($wordEnd, $wordEnd + 1).Text -match '\w') {
                    $wordEnd++
                }
                
                $element.Text = $range.Document.Range($wordStart, $wordEnd).Text
                $element.Start = $wordStart - $range.Start
                $element.End = $wordEnd - $range.Start
                
                $elements += $element
            }
        }
    }
    
    return $elements
}

function Apply-CardFormatting {
    param(
        [string]$FormattingJson,
        [string]$DocumentPath = ""
    )
    
    try {
        $formatting = $FormattingJson | ConvertFrom-Json
        
        $word = New-Object -ComObject Word.Application
        $word.Visible = $true
        
        if ($DocumentPath -and (Test-Path $DocumentPath)) {
            $doc = $word.Documents.Open($DocumentPath)
        } else {
            $doc = $word.ActiveDocument
        }
        
        # Get current card range
        $cardInfo = Get-CurrentCard | ConvertFrom-Json
        if (-not $cardInfo.Success) {
            throw $cardInfo.Error
        }
        
        $cardStart = $cardInfo.Card.Position.Start
        $cardEnd = $cardInfo.Card.Position.End
        
        # Clear existing formatting in body text
        $bodyRange = $doc.Range($cardStart, $cardEnd)
        $bodyRange.Font.Bold = $false
        $bodyRange.Font.Italic = $false
        $bodyRange.Font.Underline = 0
        $bodyRange.HighlightColorIndex = 0
        
        # Apply new formatting
        Apply-FormattingElements $doc $cardStart $formatting.underline "underline"
        Apply-FormattingElements $doc $cardStart $formatting.emphasis "emphasis"
        Apply-FormattingElements $doc $cardStart $formatting.highlight "highlight"
        
        $result = @{
            Success = $true
            Message = "Formatting applied successfully"
        }
        
        return $result | ConvertTo-Json
    }
    catch {
        return @{
            Success = $false
            Error = $_.Exception.Message
        } | ConvertTo-Json
    }
}

function Apply-FormattingElements {
    param($doc, $baseStart, $elements, $formatType)
    
    foreach ($element in $elements) {
        try {
            # Find text in document
            $searchStart = $baseStart + $element.start
            $searchEnd = $baseStart + $element.end
            
            if ($searchEnd -le $doc.Content.End) {
                $range = $doc.Range($searchStart, $searchEnd)
                
                switch ($formatType) {
                    "underline" {
                        $range.Font.Underline = 1
                    }
                    "emphasis" {
                        $range.Font.Bold = $true
                    }
                    "highlight" {
                        $range.HighlightColorIndex = 7  # Light blue
                    }
                }
            }
        }
        catch {
            Write-Warning "Failed to apply formatting to element: $($element.text)"
        }
    }
}

function Navigate-ToCard {
    param([string]$CardTag)
    
    try {
        $word = New-Object -ComObject Word.Application
        $word.Visible = $true
        $doc = $word.ActiveDocument
        
        # Search for the tag
        $findRange = $doc.Content
        $findRange.Find.ClearFormatting()
        $findRange.Find.Text = $CardTag
        $findRange.Find.Execute()
        
        if ($findRange.Find.Found) {
            $findRange.Select()
            $result = @{
                Success = $true
                Position = $word.Selection.Start
            }
        } else {
            $result = @{
                Success = $false
                Error = "Card tag not found: $CardTag"
            }
        }
        
        return $result | ConvertTo-Json
    }
    catch {
        return @{
            Success = $false
            Error = $_.Exception.Message
        } | ConvertTo-Json
    }
}

# Main command dispatcher
switch ($args[0]) {
    "test" { Test-WordConnection }
    "getCurrentCard" { Get-CurrentCard $args[1] }
    "applyFormatting" { Apply-CardFormatting $args[1] $args[2] }
    "navigateToCard" { Navigate-ToCard $args[1] }
    default { 
        @{
            Success = $false
            Error = "Unknown command: $($args[0])"
        } | ConvertTo-Json
    }
}
`;

        await fs.writeFile(this.macroScriptPath, psScript);
    }

    /**
     * Create VBA script for advanced Word automation
     */
    async createVBAScript() {
        const vbaScript = `
' MBA Debate Bot - VBA Macros for Word
' Advanced formatting and document manipulation

Sub QuickCutCard()
    ' Main entry point for cutting a card
    Dim currentCard As Object
    Set currentCard = GetCurrentCardContent()
    
    If Not currentCard Is Nothing Then
        ' Call external API for formatting suggestions
        Dim formattingJSON As String
        formattingJSON = CallFormattingAPI(currentCard)
        
        ' Apply formatting
        ApplyAIFormatting formattingJSON
    End If
End Sub

Function GetCurrentCardContent() As Object
    Dim cardInfo As Object
    Set cardInfo = CreateObject("Scripting.Dictionary")
    
    ' Get current selection or paragraph
    Dim currentRange As Range
    Set currentRange = Selection.Range
    
    ' Find card boundaries
    Dim cardStart As Long
    Dim cardEnd As Long
    cardStart = FindCardStart(currentRange)
    cardEnd = FindCardEnd(currentRange)
    
    ' Extract card content
    Set currentRange = ActiveDocument.Range(cardStart, cardEnd)
    
    cardInfo("tag") = ExtractTag(currentRange)
    cardInfo("cite") = ExtractCite(currentRange)
    cardInfo("bodyText") = ExtractBodyText(currentRange)
    cardInfo("startPos") = cardStart
    cardInfo("endPos") = cardEnd
    
    Set GetCurrentCardContent = cardInfo
End Function

Function FindCardStart(currentRange As Range) As Long
    ' Look backwards for headings or card indicators
    Dim searchRange As Range
    Set searchRange = ActiveDocument.Range(0, currentRange.Start)
    
    ' Search for heading styles
    With searchRange.Find
        .ClearFormatting
        .Style = "Heading 1"
        .Execute
        If .Found Then
            FindCardStart = searchRange.Start
            Exit Function
        End If
    End With
    
    ' Fallback to paragraph start
    FindCardStart = currentRange.Paragraphs(1).Range.Start
End Function

Function FindCardEnd(currentRange As Range) As Long
    ' Look forward for next card or document end
    Dim searchRange As Range
    Set searchRange = ActiveDocument.Range(currentRange.End, ActiveDocument.Content.End)
    
    ' Search for next heading
    With searchRange.Find
        .ClearFormatting
        .Style = "Heading 1"
        .Execute
        If .Found Then
            FindCardEnd = searchRange.Start
            Exit Function
        End If
    End With
    
    ' Fallback to document end
    FindCardEnd = ActiveDocument.Content.End
End Function

Sub ApplyAIFormatting(formattingJSON As String)
    ' Parse JSON and apply formatting
    ' This would need a JSON parser or external call
    
    ' For now, implement basic formatting logic
    Dim currentRange As Range
    Set currentRange = Selection.Range
    
    ' Apply underlining to key terms
    ApplyUnderlineFormatting currentRange
    
    ' Apply emphasis to strong evidence
    ApplyEmphasisFormatting currentRange
    
    ' Apply highlighting to critical claims
    ApplyHighlightFormatting currentRange
End Sub

Sub ApplyUnderlineFormatting(targetRange As Range)
    ' Underline key debate terms
    Dim keyTerms As Variant
    keyTerms = Array("impact", "uniqueness", "link", "solvency", "evidence")
    
    Dim i As Integer
    For i = 0 To UBound(keyTerms)
        With targetRange.Find
            .ClearFormatting
            .Text = keyTerms(i)
            .Replacement.ClearFormatting
            .Replacement.Font.Underline = wdUnderlineSingle
            .Execute Replace:=wdReplaceAll
        End With
    Next i
End Sub

Sub ApplyEmphasisFormatting(targetRange As Range)
    ' Bold important evidence markers
    Dim emphasisTerms As Variant
    emphasisTerms = Array("proves", "shows", "demonstrates", "confirms")
    
    Dim i As Integer
    For i = 0 To UBound(emphasisTerms)
        With targetRange.Find
            .ClearFormatting
            .Text = emphasisTerms(i)
            .Replacement.ClearFormatting
            .Replacement.Font.Bold = True
            .Execute Replace:=wdReplaceAll
        End With
    Next i
End Sub

Sub ApplyHighlightFormatting(targetRange As Range)
    ' Highlight statistical evidence and strong claims
    With targetRange.Find
        .ClearFormatting
        .Text = "[0-9]+%"
        .MatchWildcards = True
        .Replacement.ClearFormatting
        .Replacement.Highlight = wdTurquoise
        .Execute Replace:=wdReplaceAll
    End With
End Sub

Sub NavigateToCardTag(tagText As String)
    ' Navigate to specific card by tag
    With ActiveDocument.Content.Find
        .ClearFormatting
        .Text = tagText
        .Execute
        If .Found Then
            Selection.Collapse Direction:=wdCollapseStart
        End If
    End With
End Sub
`;

        await fs.writeFile(this.vbaScriptPath, vbaScript);
    }

    /**
     * Test connection to Microsoft Word
     * @returns {Promise<Object>} Connection test results
     */
    async testConnection() {
        try {
            const result = await this.executePowerShellCommand('test');
            const parsed = JSON.parse(result);
            
            this.isWordAvailable = parsed.Success;
            return {
                success: parsed.Success,
                version: parsed.Version,
                documentCount: parsed.DocumentCount,
                error: parsed.Error
            };
        } catch (error) {
            this.isWordAvailable = false;
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get current card content from Word
     * @param {string} documentPath - Optional document path
     * @returns {Promise<Object>} Current card data
     */
    async getCurrentCard(documentPath = '') {
        try {
            if (!this.isWordAvailable) {
                throw new Error('Word is not available');
            }

            const result = await this.executePowerShellCommand('getCurrentCard', documentPath);
            const parsed = JSON.parse(result);

            if (!parsed.Success) {
                throw new Error(parsed.Error);
            }

            return {
                tag: parsed.Card.Tag,
                cite: parsed.Card.Cite,
                bodyText: parsed.Card.BodyText,
                formattedElements: parsed.Card.FormattedElements,
                position: parsed.Position
            };
        } catch (error) {
            throw new Error(`Failed to get current card: ${error.message}`);
        }
    }

    /**
     * Apply formatting to current card in Word
     * @param {Object} formattingInstructions - Formatting data from AI
     * @param {string} documentPath - Optional document path
     * @returns {Promise<Object>} Operation result
     */
    async applyFormatting(formattingInstructions, documentPath = '') {
        try {
            if (!this.isWordAvailable) {
                throw new Error('Word is not available');
            }

            // Convert formatting instructions to JSON string
            const formattingJson = JSON.stringify(formattingInstructions);
            
            const result = await this.executePowerShellCommand('applyFormatting', formattingJson, documentPath);
            const parsed = JSON.parse(result);

            if (!parsed.Success) {
                throw new Error(parsed.Error);
            }

            return {
                success: true,
                message: parsed.Message
            };
        } catch (error) {
            throw new Error(`Failed to apply formatting: ${error.message}`);
        }
    }

    /**
     * Navigate to specific card by tag
     * @param {string} cardTag - Tag to search for
     * @returns {Promise<Object>} Navigation result
     */
    async navigateToCard(cardTag) {
        try {
            if (!this.isWordAvailable) {
                throw new Error('Word is not available');
            }

            const result = await this.executePowerShellCommand('navigateToCard', cardTag);
            const parsed = JSON.parse(result);

            if (!parsed.Success) {
                throw new Error(parsed.Error);
            }

            return {
                success: true,
                position: parsed.Position
            };
        } catch (error) {
            throw new Error(`Failed to navigate to card: ${error.message}`);
        }
    }

    /**
     * Execute PowerShell command with arguments
     * @param {string} command - Command to execute
     * @param {...string} args - Command arguments
     * @returns {Promise<string>} Command output
     */
    async executePowerShellCommand(command, ...args) {
        return new Promise((resolve, reject) => {
            const psArgs = [
                '-ExecutionPolicy', 'Bypass',
                '-NoProfile',
                '-File', this.macroScriptPath,
                command,
                ...args
            ];

            const ps = spawn('powershell.exe', psArgs, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';
            let error = '';

            ps.stdout.on('data', (data) => {
                output += data.toString();
            });

            ps.stderr.on('data', (data) => {
                error += data.toString();
            });

            ps.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`PowerShell command failed: ${error || 'Unknown error'}`));
                } else {
                    resolve(output.trim());
                }
            });

            ps.on('error', (err) => {
                reject(new Error(`Failed to start PowerShell: ${err.message}`));
            });
        });
    }

    /**
     * Execute VBA macro in Word
     * @param {string} macroName - Name of macro to execute
     * @param {Object} parameters - Macro parameters
     * @returns {Promise<Object>} Execution result
     */
    async executeVBAMacro(macroName, parameters = {}) {
        try {
            if (!this.isWordAvailable) {
                throw new Error('Word is not available');
            }

            // Create PowerShell script to execute VBA
            const vbaScript = `
                $word = New-Object -ComObject Word.Application
                $word.Visible = $true
                try {
                    $word.Run("${macroName}")
                    @{ Success = $true } | ConvertTo-Json
                } catch {
                    @{ Success = $false; Error = $_.Exception.Message } | ConvertTo-Json
                }
            `;

            const result = await this.executePowerShellScript(vbaScript);
            return JSON.parse(result);
        } catch (error) {
            throw new Error(`VBA macro execution failed: ${error.message}`);
        }
    }

    /**
     * Execute custom PowerShell script
     * @param {string} script - PowerShell script content
     * @returns {Promise<string>} Script output
     */
    async executePowerShellScript(script) {
        return new Promise((resolve, reject) => {
            const ps = spawn('powershell.exe', [
                '-ExecutionPolicy', 'Bypass',
                '-NoProfile',
                '-Command', script
            ], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';
            let error = '';

            ps.stdout.on('data', (data) => {
                output += data.toString();
            });

            ps.stderr.on('data', (data) => {
                error += data.toString();
            });

            ps.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`PowerShell script failed: ${error || 'Unknown error'}`));
                } else {
                    resolve(output.trim());
                }
            });

            ps.on('error', (err) => {
                reject(new Error(`Failed to execute PowerShell script: ${err.message}`));
            });
        });
    }

    /**
     * Get Word document information
     * @returns {Promise<Object>} Document information
     */
    async getDocumentInfo() {
        try {
            const script = `
                $word = New-Object -ComObject Word.Application
                $word.Visible = $true
                if ($word.Documents.Count -gt 0) {
                    $doc = $word.ActiveDocument
                    @{
                        Success = $true
                        Name = $doc.Name
                        Path = $doc.Path
                        WordCount = $doc.Words.Count
                        ParagraphCount = $doc.Paragraphs.Count
                    } | ConvertTo-Json
                } else {
                    @{
                        Success = $false
                        Error = "No document is currently open"
                    } | ConvertTo-Json
                }
            `;

            const result = await this.executePowerShellScript(script);
            return JSON.parse(result);
        } catch (error) {
            throw new Error(`Failed to get document info: ${error.message}`);
        }
    }

    /**
     * Backup current document
     * @param {string} backupPath - Path to save backup
     * @returns {Promise<Object>} Backup result
     */
    async backupDocument(backupPath) {
        try {
            const script = `
                $word = New-Object -ComObject Word.Application
                $word.Visible = $true
                if ($word.Documents.Count -gt 0) {
                    $doc = $word.ActiveDocument
                    $doc.SaveAs2("${backupPath}")
                    @{
                        Success = $true
                        BackupPath = "${backupPath}"
                    } | ConvertTo-Json
                } else {
                    @{
                        Success = $false
                        Error = "No document is currently open"
                    } | ConvertTo-Json
                }
            `;

            const result = await this.executePowerShellScript(script);
            return JSON.parse(result);
        } catch (error) {
            throw new Error(`Failed to backup document: ${error.message}`);
        }
    }

    /**
     * Check if Word is currently running
     * @returns {Promise<boolean>} True if Word is running
     */
    async isWordRunning() {
        try {
            const script = `
                try {
                    $word = [System.Runtime.InteropServices.Marshal]::GetActiveObject("Word.Application")
                    $true
                } catch {
                    $false
                }
            `;

            const result = await this.executePowerShellScript(script);
            return result.trim() === 'True';
        } catch (error) {
            return false;
        }
    }

    /**
     * Launch Word application
     * @returns {Promise<Object>} Launch result
     */
    async launchWord() {
        try {
            const script = `
                try {
                    $word = New-Object -ComObject Word.Application
                    $word.Visible = $true
                    @{
                        Success = $true
                        Version = $word.Version
                    } | ConvertTo-Json
                } catch {
                    @{
                        Success = $false
                        Error = $_.Exception.Message
                    } | ConvertTo-Json
                }
            `;

            const result = await this.executePowerShellScript(script);
            const parsed = JSON.parse(result);
            
            if (parsed.Success) {
                this.isWordAvailable = true;
            }
            
            return parsed;
        } catch (error) {
            throw new Error(`Failed to launch Word: ${error.message}`);
        }
    }

    /**
     * Clean up resources and close connections
     */
    async cleanup() {
        try {
            if (this.powerShell) {
                await this.powerShell.dispose();
                this.powerShell = null;
            }
            
            // Clean up temporary script files if needed
            // await fs.unlink(this.macroScriptPath).catch(() => {});
            // await fs.unlink(this.vbaScriptPath).catch(() => {});
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    }
}

module.exports = WordMacroService;