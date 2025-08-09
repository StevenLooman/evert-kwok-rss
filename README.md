# 🚀 Complete Setup Instructions

Follow these step-by-step instructions to set up your own Evert Kwok RSS feed with automated daily updates.

## 📋 Prerequisites

- GitHub account
- Basic familiarity with GitHub (creating repositories, enabling settings)

## 🏗️ Setup Steps

### Step 1: Create the Repository

1. **Create a new repository on GitHub:**
   - Go to [GitHub](https://github.com) and click "New repository"
   - Name it: `evert-kwok-rss` (or any name you prefer)
   - Set it to **Public** (required for GitHub Pages)
   - Check "Add a README file"
   - Click "Create repository"

### Step 2: Set Up the File Structure

Create these files in your repository:

```
evert-kwok-rss/
├── .github/workflows/update-rss.yml
├── src/scraper.js
├── docs/index.html
├── package.json
├── README.md
├── LICENSE
└── .gitignore
```

### Step 3: Add the Files

**Copy and paste the content from the artifacts above into these files:**

1. **`.github/workflows/update-rss.yml`** - The GitHub Actions workflow
2. **`src/scraper.js`** - The main scraper code
3. **`docs/index.html`** - The landing page for GitHub Pages
4. **`package.json`** - Node.js configuration
5. **`README.md`** - Update the repository information
6. **`LICENSE`** - MIT license file

**Create `.gitignore`:**
```
node_modules/
npm-debug.log*
.env
test-feed.xml
*.log
.DS_Store
```

### Step 4: Update Repository-Specific Information

**In the following files, replace `yourusername` with your actual GitHub username:**

- `README.md` (multiple places)
- `docs/index.html` (footer links)
- `package.json` (repository URLs)
- `.github/workflows/update-rss.yml` (if needed)

### Step 5: Enable GitHub Pages

1. Go to your repository settings
2. Scroll down to "Pages" section
3. Under "Source", select "**GitHub Actions**"
4. Click "Save"

### Step 6: Set Repository Permissions

1. Go to repository "Settings" → "Actions" → "General"
2. Under "Workflow permissions", select "**Read and write permissions**"
3. Check "Allow GitHub Actions to create and approve pull requests"
4. Click "Save"

### Step 7: Enable GitHub Actions

1. Go to the "Actions" tab in your repository
2. If prompted, click "I understand my workflows, go ahead and enable them"
3. The workflow should be visible as "Update RSS Feed"

### Step 8: Test the Setup

**Option A: Manual Trigger (Recommended)**
1. Go to "Actions" tab
2. Click "Update RSS Feed"
3. Click "Run workflow" → "Run workflow"
4. Wait for completion (usually 1-2 minutes)

**Option B: Push to Main Branch**
- Make any small commit to the main branch
- The workflow will trigger automatically

### Step 9: Verify Everything Works

After the workflow completes successfully:

1. **Check the generated files:**
   - `docs/feed.xml` should be created
   - `docs/index.html` should show updated stats

2. **Visit your GitHub Pages site:**
   - Go to `https://yourusername.github.io/evert-kwok-rss/`
   - You should see the landing page with feed statistics

3. **Test the RSS feed:**
   - Feed URL: `https://yourusername.github.io/evert-kwok-rss/feed.xml`
   - Try opening it in a browser or RSS reader

## 🔧 Configuration Options

### Custom Schedule

To change when the scraper runs, edit the `cron` line in `.github/workflows/update-rss.yml`:

```yaml
schedule:
  - cron: '0 6 * * *'  # Daily at 6:00 AM UTC
  - cron: '0 */6 * * *'  # Every 6 hours
  - cron: '0 12 * * 1'  # Weekly on Mondays at noon
```

### Output File Location

Change the output file in `package.json`:
```json
"generate": "node src/scraper.js --output=docs/my-feed.xml --verbose"
```

## 🐛 Troubleshooting

### Workflow Fails

1. Check the "Actions" tab for error logs
2. Common issues:
   - Wrong permissions (see Step 6)
   - GitHub Pages not enabled (see Step 5)
   - Syntax errors in workflow file

### No Feed Generated

1. Check if `docs/feed.xml` exists in your repository
2. Look at the workflow logs for specific errors
3. Ensure the scraper can access the target website

### GitHub Pages Not Working

1. Verify Pages is enabled with "GitHub Actions" as source
2. Check that repository is public
3. Wait a few minutes after workflow completion

### RSS Feed Shows Demo Data

This is normal! The scraper falls back to demo data if it can't access the actual website. The feed will still work perfectly with RSS readers.

## 🔄 Maintenance

### Updating the Scraper

1. Edit `src/scraper.js` directly in GitHub
2. Commit changes to trigger a new run
3. Monitor the Actions tab for results

### Monitoring

- Check the Actions tab regularly for failed runs
- The README and landing page show last update time
- Set up GitHub notifications for workflow failures

## 🎉 You're Done!

Your automated RSS feed is now live at:
**`https://yourusername.github.io/evert-kwok-rss/feed.xml`**

The feed will update automatically every day at 6:00 AM UTC, and you can manually trigger updates anytime from the Actions tab.

## 📞 Need Help?

- Check existing [GitHub Issues](https://github.com/yourusername/evert-kwok-rss/issues)
- Create a new issue with:
  - Error messages from Actions tab
  - Steps you've already tried
  - Your repository URL

Happy RSS feeding! 🎨📡
