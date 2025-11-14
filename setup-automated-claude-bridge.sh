#!/bin/bash
# Run this in your eBay Price Reducer project root

echo "🚀 Setting up Automated Claude Bridge..."

# Create the bridge directory structure
mkdir -p .claude-bridge/{inbox,processing,completed}

# Create the AUTO-WATCH script that Claude Code will run
cat > .claude-bridge/auto-watch.py << 'EOF'
#!/usr/bin/env python3
"""
Automated Claude Bridge - Zero Human Intervention Required
This script watches for instructions from Claude AI and automatically implements them.
"""

import os
import json
import time
import subprocess
import re
from pathlib import Path
from datetime import datetime

class AutomatedClaudeBridge:
    def __init__(self):
        self.bridge_dir = Path(".claude-bridge")
        self.inbox = self.bridge_dir / "inbox"
        self.processing = self.bridge_dir / "processing"
        self.completed = self.bridge_dir / "completed"

        # Create directories if they don't exist
        for dir in [self.inbox, self.processing, self.completed]:
            dir.mkdir(parents=True, exist_ok=True)

    def extract_code_blocks(self, content):
        """Extract code blocks and their target files from markdown"""
        # Pattern to find code blocks with file targets
        pattern = r'(?:File|Target|Path):\s*`([^`]+)`.*?```(?:jsx?|javascript|typescript|tsx?)?\n(.*?)```'
        matches = re.findall(pattern, content, re.DOTALL | re.IGNORECASE)

        # Also find inline fixes
        inline_pattern = r'(?:Change|Replace|Update)\s+from:\s*```(.*?)```\s*(?:To|With):\s*```(.*?)```'
        inline_matches = re.findall(inline_pattern, content, re.DOTALL)

        return matches, inline_matches

    def find_and_replace(self, search_text, replace_text, file_pattern="*.jsx"):
        """Find and replace text in project files"""
        print(f"  🔍 Searching for: {search_text[:50]}...")

        # Search in common React locations
        search_dirs = ["src", "components", "pages", "app", "frontend/src"]
        files_modified = 0

        for dir in search_dirs:
            if Path(dir).exists():
                for file_path in Path(dir).rglob(file_pattern):
                    try:
                        with open(file_path, 'r') as f:
                            content = f.read()

                        if search_text in content:
                            new_content = content.replace(search_text, replace_text)
                            with open(file_path, 'w') as f:
                                f.write(new_content)
                            print(f"    ✏️ Modified: {file_path}")
                            files_modified += 1
                    except Exception as e:
                        print(f"    ⚠️ Error processing {file_path}: {e}")

        return files_modified

    def auto_implement(self, instruction_file):
        """Automatically implement the changes described in the instruction file"""
        print(f"\n{'='*60}")
        print(f"🤖 AUTO-IMPLEMENTING: {instruction_file.name}")
        print(f"{'='*60}\n")

        # Read the instruction file
        with open(instruction_file, 'r') as f:
            content = f.read()

        # Move to processing
        processing_file = self.processing / instruction_file.name
        instruction_file.rename(processing_file)

        # Extract implementation details
        changes_made = []

        # Look for search/replace patterns
        if "Search Code For:" in content or "Search for:" in content:
            search_section = content.split("Search")[1].split("\n")[1:5]
            for line in search_section:
                if line.strip().startswith('-') or line.strip().startswith('"'):
                    search_term = line.strip(' -"`)\'')
                    if search_term:
                        print(f"🔍 Searching for: {search_term}")
                        # Implement specific fixes based on known patterns

                        if "Real Supabase mode - not implemented yet" in search_term:
                            # This is the main issue - replace mock with real data
                            self.find_and_replace(
                                'console.log("Real Supabase mode - not implemented yet")',
                                '// Using real Supabase data'
                            )
                            self.find_and_replace(
                                'const mockListings = ',
                                '// const mockListings = '
                            )
                            changes_made.append("Disabled mock data mode")

                        if "placeholder-image.jpg" in search_term:
                            # Fix image URLs
                            self.find_and_replace(
                                'src="/placeholder-image.jpg"',
                                'src={listing.image_url || "/placeholder-image.jpg"}'
                            )
                            self.find_and_replace(
                                "src='/placeholder-image.jpg'",
                                "src={listing.image_url || '/placeholder-image.jpg'}"
                            )
                            changes_made.append("Fixed image URL mapping")

        # Extract and apply code blocks
        file_updates, inline_fixes = self.extract_code_blocks(content)

        for file_path, code in file_updates:
            print(f"📝 Updating file: {file_path}")
            # Try to find and update the file
            if self.update_file_content(file_path, code):
                changes_made.append(f"Updated {file_path}")

        for old_code, new_code in inline_fixes:
            if self.find_and_replace(old_code.strip(), new_code.strip()):
                changes_made.append("Applied inline fix")

        # Look for specific bug fixes mentioned
        if "listing.image_url" in content:
            self.apply_image_fix()
            changes_made.append("Applied image URL fix")

        if "listing.ebay_url" in content and "undefined" in content:
            self.apply_ebay_link_fix()
            changes_made.append("Applied eBay link fix")

        if "enable_auto_reduction" in content:
            self.apply_toggle_fix()
            changes_made.append("Applied toggle fix")

        # Create completion report
        self.create_completion_report(processing_file, changes_made)

        # Move to completed
        completed_file = self.completed / f"completed-{instruction_file.name}"
        processing_file.rename(completed_file)

        print(f"\n✅ Completed {len(changes_made)} changes")
        return True

    def apply_image_fix(self):
        """Specific fix for image display issue"""
        patterns = [
            ('src="/placeholder-image.jpg"', 'src={listing.image_url || "/placeholder-image.jpg"}'),
            ("src='/placeholder-image.jpg'", "src={listing.image_url || '/placeholder-image.jpg'}"),
            ('<img src="placeholder', '<img src={listing.image_url || "placeholder'),
        ]
        for old, new in patterns:
            self.find_and_replace(old, new, "*.jsx")
            self.find_and_replace(old, new, "*.js")
            self.find_and_replace(old, new, "*.tsx")

    def apply_ebay_link_fix(self):
        """Specific fix for eBay link issue"""
        patterns = [
            ('href={`https://www.ebay.com/itm/${listing.itemId}`}', 'href={listing.ebay_url}'),
            ('href={`https://www.ebay.com/itm/${undefined}`}', 'href={listing.ebay_url}'),
            ('href="https://www.ebay.com/itm/undefined"', 'href={listing.ebay_url || "#"}'),
        ]
        for old, new in patterns:
            self.find_and_replace(old, new, "*.jsx")
            self.find_and_replace(old, new, "*.js")

    def apply_toggle_fix(self):
        """Specific fix for toggle/checkbox issue"""
        # This is more complex - need to add onChange handler
        print("  🔧 Applying toggle fix - adding onChange handlers...")
        # Look for checkbox without onChange
        self.find_and_replace(
            '<input type="checkbox"',
            '<input type="checkbox" onChange={(e) => handleToggleReduction(listing.id, listing.enable_auto_reduction)}'
        )

    def update_file_content(self, file_path, new_content):
        """Update a specific file with new content"""
        search_paths = [
            Path(file_path),
            Path("src") / file_path,
            Path("src/pages") / file_path,
            Path("src/components") / file_path,
            Path("frontend/src") / file_path,
            Path("frontend/src/pages") / file_path,
            Path("frontend/src/components") / file_path,
        ]

        for path in search_paths:
            if path.exists():
                with open(path, 'w') as f:
                    f.write(new_content)
                print(f"    ✅ Updated: {path}")
                return True

        print(f"    ⚠️ File not found: {file_path}")
        return False

    def create_completion_report(self, instruction_file, changes_made):
        """Create a report of what was done"""
        report_file = self.completed / f"report-{datetime.now().strftime('%Y%m%d-%H%M%S')}.md"
        with open(report_file, 'w') as f:
            f.write(f"# Auto-Implementation Report\n\n")
            f.write(f"**Instruction File**: {instruction_file.name}\n")
            f.write(f"**Timestamp**: {datetime.now().isoformat()}\n")
            f.write(f"**Changes Made**: {len(changes_made)}\n\n")
            f.write("## Changes:\n")
            for change in changes_made:
                f.write(f"- {change}\n")
        print(f"📊 Report saved: {report_file}")

    def watch(self):
        """Continuously watch for new instruction files"""
        print("🤖 Automated Claude Bridge Started")
        print("👀 Watching for instructions...")
        print("⏸️ Press Ctrl+C to stop\n")

        processed = set()

        try:
            while True:
                # Check for new instruction files
                for file_path in self.inbox.glob("*.md"):
                    if file_path.name not in processed:
                        print(f"\n🔔 New instruction detected: {file_path.name}")
                        processed.add(file_path.name)

                        # Auto-implement
                        try:
                            self.auto_implement(file_path)

                            # Optional: Auto-commit changes
                            if Path(".git").exists():
                                print("\n📦 Committing changes...")
                                subprocess.run(["git", "add", "-A"])
                                subprocess.run(["git", "commit", "-m", f"Auto-fix: {file_path.stem}"])
                                print("✅ Changes committed")

                        except Exception as e:
                            print(f"❌ Error: {e}")

                time.sleep(2)  # Check every 2 seconds

        except KeyboardInterrupt:
            print("\n\n👋 Auto-watch stopped")

if __name__ == "__main__":
    bridge = AutomatedClaudeBridge()
    bridge.watch()
EOF

chmod +x .claude-bridge/auto-watch.py

# Create instruction template for Claude AI
cat > .claude-bridge/INSTRUCTION-TEMPLATE.md << 'EOF'
# Instruction Template for Claude AI

When creating fix instructions, save them as:
`.claude-bridge/inbox/fix-[timestamp].md`

## Required Format:

```markdown
# Fix: [Brief Description]

## Problem
[What's broken]

## Solution
[What needs to be changed]

## Search Code For:
- "exact string to search"
- "another string"

## Changes Required:

### File: `path/to/file.jsx`
```jsx
// New code here
```

### Replace:
Change from:
```jsx
old code
```
To:
```jsx
new code
```
```
EOF

echo "✅ Automated Claude Bridge installed!"
echo ""
echo "📝 To use:"
echo "1. Claude AI creates: .claude-bridge/inbox/fix-*.md"
echo "2. Run: python3 .claude-bridge/auto-watch.py"
echo "3. Changes are automatically applied!"
echo ""
echo "🤖 Starting auto-watch now..."
python3 .claude-bridge/auto-watch.py
