// src/scraper.js - Production Evert Kwok Cartoon Scraper for GitHub Actions
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

class EvertKwokScraper {
    constructor(options = {}) {
        this.baseUrl = 'https://www.evertkwok.nl/cartoon/';
        this.outputFile = options.outputFile || 'docs/feed.xml';
        this.verbose = options.verbose || false;
        this.maxRetries = 3;
        this.retryDelay = 2000;
    }
    
    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = level.toUpperCase().padEnd(5);
        
        if (this.verbose || level === 'error') {
            console.log(`[${timestamp}] ${prefix} ${message}`);
        }
        
        // Special handling for GitHub Actions
        if (process.env.GITHUB_ACTIONS) {
            switch(level) {
                case 'error':
                    console.log(`::error::${message}`);
                    break;
                case 'warn':
                    console.log(`::warning::${message}`);
                    break;
                case 'info':
                    console.log(`::notice::${message}`);
                    break;
            }
        }
    }
    
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    async fetchWithRetry(url, attempt = 1) {
        try {
            this.log(`Fetching ${url} (attempt ${attempt}/${this.maxRetries})`);
            
            const response = await axios.get(url, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; EvertKwokRSSBot/1.0; +https://github.com/yourusername/evert-kwok-rss)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate',
                    'Cache-Control': 'no-cache'
                }
            });
            
            this.log(`Successfully fetched ${url} (${response.data.length} bytes)`);
            return response;
            
        } catch (error) {
            this.log(`Attempt ${attempt} failed: ${error.message}`, 'warn');
            
            if (attempt < this.maxRetries) {
                await this.delay(this.retryDelay * attempt);
                return this.fetchWithRetry(url, attempt + 1);
            } else {
                throw error;
            }
        }
    }
    
    async scrapeCartoons() {
        this.log('Starting cartoon scraping process...');
        
        try {
            const response = await this.fetchWithRetry(this.baseUrl);
            const $ = cheerio.load(response.data);
            const cartoons = [];
            
            // Multiple selectors to find images
            const selectors = [
                'img[src*="wp-content/uploads"]',
                '.wp-block-image img',
                '.entry-content img',
                '.post-content img',
                'article img',
                '.content img',
                '.cartoon-image img',
                'figure img',
                '.gallery img',
                '.wp-caption img'
            ];
            
            this.log(`Searching for images with ${selectors.length} different selectors`);
            
            // Track found URLs to avoid duplicates
            const foundUrls = new Set();
            
            for (const selector of selectors) {
                $(selector).each((index, element) => {
                    const imgSrc = $(element).attr('src');
                    
                    if (imgSrc && imgSrc.includes('wp-content/uploads') && !foundUrls.has(imgSrc)) {
                        const fullUrl = imgSrc.startsWith('http') ? 
                                       imgSrc : 
                                       new URL(imgSrc, this.baseUrl).href;
                        
                        // Filter out thumbnails and non-cartoon images
                        if (!this.isValidCartoonUrl(fullUrl)) {
                            this.log(`Skipping non-cartoon image: ${fullUrl}`);
                            // continue;
                            return;
                        }
                        
                        foundUrls.add(fullUrl);
                        
                        const cartoon = {
                            url: fullUrl,
                            title: this.extractTitle($, element),
                            date: this.extractDateFromUrl(fullUrl),
                            description: this.extractDescription($, element),
                            filename: path.basename(fullUrl)
                        };
                        
                        cartoons.push(cartoon);
                        this.log(`Found: ${cartoon.title} - ${cartoon.date.toISOString().split('T')[0]}`);
                    }
                });
            }
            
            // Remove duplicates and sort by date
            const uniqueCartoons = this.removeDuplicates(cartoons);
            uniqueCartoons.sort((a, b) => b.date - a.date);
            
            this.log(`Successfully scraped ${uniqueCartoons.length} unique cartoons`);
            return uniqueCartoons;
            
        } catch (error) {
            this.log(`Scraping failed: ${error.message}`, 'error');
            this.log('Falling back to demo data...', 'warn');
            return this.getDemoData();
        }
    }
    
    isValidCartoonUrl(url) {
        // Filter out common non-cartoon images
        const excludePatterns = [
            'thumbnail',
            'thumb',
            'avatar',
            'logo',
            'icon',
            'banner',
            'header',
            'footer',
            'sidebar',
            '-150x150',
            '-300x300',
            'wp-content/themes',
            'wp-content/plugins'
        ];
        
        const urlLower = url.toLowerCase();
        return !excludePatterns.some(pattern => urlLower.includes(pattern));
    }
    
    removeDuplicates(cartoons) {
        const seen = new Set();
        return cartoons.filter(cartoon => {
            if (seen.has(cartoon.url)) {
                return false;
            }
            seen.add(cartoon.url);
            return true;
        });
    }
    
    extractTitle($, element) {
        // Try multiple approaches to get a meaningful title
        const candidates = [
            $(element).attr('alt'),
            $(element).attr('title'),
            $(element).siblings('figcaption').text().trim(),
            $(element).parent().siblings('.wp-caption-text').text().trim(),
            $(element).closest('figure').find('figcaption').text().trim(),
            $(element).closest('.wp-block-image').find('figcaption').text().trim(),
            $(element).closest('.wp-caption').find('.wp-caption-text').text().trim(),
            $(element).closest('article, .post').find('h1, h2, h3').first().text().trim()
        ].filter(Boolean);
        
        // Find the best candidate
        for (const candidate of candidates) {
            if (candidate.length > 3 && 
                candidate.length < 100 &&
                candidate.toLowerCase() !== 'cartoon' && 
                !candidate.match(/^\d+$/) &&
                !candidate.includes('wp-content')) {
                return this.cleanTitle(candidate);
            }
        }
        
        // Fallback: generate from URL
        return this.generateTitleFromUrl($(element).attr('src'));
    }
    
    cleanTitle(title) {
        return title
            .replace(/\s+/g, ' ')           // Normalize whitespace
            .replace(/[^\w\s\-\.\,\!\?]/g, '') // Keep basic punctuation
            .trim()
            .substring(0, 80);              // Reasonable length limit
    }
    
    extractDescription($, element) {
        const candidates = [
            $(element).siblings('figcaption').text().trim(),
            $(element).closest('figure').find('figcaption').text().trim(),
            $(element).closest('.wp-block-image').find('figcaption').text().trim(),
            $(element).attr('title'),
            $(element).parent().siblings('.wp-caption-text').text().trim(),
            $(element).closest('.wp-caption').find('.wp-caption-text').text().trim(),
            $(element).closest('article, .post').find('p').first().text().trim()
        ].filter(Boolean);
        
        for (const candidate of candidates) {
            if (candidate.length > 10 && 
                candidate.length < 500 && 
                !candidate.toLowerCase().includes('image') &&
                !candidate.includes('wp-content')) {
                return candidate.substring(0, 200) + (candidate.length > 200 ? '...' : '');
            }
        }
        
        // Generate description from title and context
        const title = this.extractTitle($, element);
        return `Educational cartoon by Evert Kwok featuring ${title.toLowerCase()}. Making complex scientific and mathematical concepts accessible through visual humor and clever illustrations.`;
    }
    
    extractDateFromUrl(url) {
        // Multiple date patterns to try, ordered by specificity
        const patterns = [
            { regex: /\/(\d{4})\/(\d{2})\/(\d{2})\//, format: 'ymd', specificity: 3 },
            { regex: /\/(\d{4})\/(\d{2})\//, format: 'ym', specificity: 2 },
            { regex: /\/(\d{4})(\d{2})(\d{2})(?:_|\-|\.)?/, format: 'ymd', specificity: 3 },
            { regex: /(\d{4})-(\d{2})-(\d{2})/, format: 'ymd', specificity: 3 },
            { regex: /(\d{4})_(\d{2})_(\d{2})/, format: 'ymd', specificity: 3 },
            { regex: /(\d{8})(?![\d])/, format: 'yyyymmdd', specificity: 3 },
            { regex: /\/(\d{4})\//, format: 'y', specificity: 1 }
        ];
        
        // Sort by specificity (most specific first)
        patterns.sort((a, b) => b.specificity - a.specificity);
        
        for (const pattern of patterns) {
            const match = url.match(pattern.regex);
            if (match) {
                try {
                    let year, month, day;
                    
                    switch (pattern.format) {
                        case 'ymd':
                            year = parseInt(match[1]);
                            month = parseInt(match[2]) - 1;
                            day = parseInt(match[3]);
                            break;
                        case 'ym':
                            year = parseInt(match[1]);
                            month = parseInt(match[2]) - 1;
                            day = 1;
                            break;
                        case 'y':
                            year = parseInt(match[1]);
                            month = 0;
                            day = 1;
                            break;
                        case 'yyyymmdd':
                            const dateStr = match[1];
                            year = parseInt(dateStr.substring(0, 4));
                            month = parseInt(dateStr.substring(4, 6)) - 1;
                            day = parseInt(dateStr.substring(6, 8));
                            break;
                    }
                    
                    const date = new Date(year, month, day);
                    
                    // Validate date is reasonable
                    if (date.getFullYear() === year && 
                        date.getMonth() === month && 
                        date.getFullYear() >= 2000 && 
                        date.getFullYear() <= new Date().getFullYear() + 1) {
                        this.log(`Extracted date ${date.toISOString().split('T')[0]} from ${url}`);
                        return date;
                    }
                } catch (e) {
                    this.log(`Invalid date extracted from ${url}: ${e.message}`, 'warn');
                }
            }
        }
        
        // Fallback to current date
        this.log(`Could not extract date from ${url}, using current date`, 'warn');
        return new Date();
    }
    
    generateTitleFromUrl(url) {
        if (!url) return 'Cartoon';
        
        const filename = url.split('/').pop().split('.')[0];
        
        return filename
            .replace(/^\d+/, '')              // Remove leading numbers
            .replace(/[_-]/g, ' ')            // Replace underscores/hyphens with spaces
            .replace(/([a-z])([A-Z])/g, '$1 $2') // Add spaces before capitals
            .replace(/\s+/g, ' ')             // Normalize whitespace
            .trim()
            .replace(/^./, char => char.toUpperCase()) // Capitalize first letter
            .substring(0, 50) // Limit length
            || 'Educational Cartoon';
    }
    
    async generateRSS(cartoons) {
        const now = new Date();
        const lastBuildDate = cartoons.length > 0 ? cartoons[0].date : now;
        const repoUrl = process.env.GITHUB_REPOSITORY ? 
                       `https://github.com/${process.env.GITHUB_REPOSITORY}` : 
                       'https://github.com/yourusername/evert-kwok-rss';
        const pagesUrl = process.env.GITHUB_PAGES_URL || 
                        repoUrl.replace('github.com', 'github.io').replace(/\/([^\/]+)$/, '/$1');
        
        const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">
    <channel>
        <title>Evert Kwok Educational Cartoons</title>
        <link>https://www.evertkwok.nl/cartoon/</link>
        <description>Latest educational cartoons by Evert Kwok - Mathematical and scientific concepts explained through humor and visual storytelling. Automatically updated daily.</description>
        <language>nl-NL</language>
        <copyright>© ${new Date().getFullYear()} Evert Kwok. All rights reserved.</copyright>
        <managingEditor>info@evertkwok.nl (Evert Kwok)</managingEditor>
        <webMaster>info@evertkwok.nl (Evert Kwok)</webMaster>
        <lastBuildDate>${now.toUTCString()}</lastBuildDate>
        <pubDate>${lastBuildDate.toUTCString()}</pubDate>
        <ttl>1440</ttl>
        <generator>Evert Kwok Cartoon Scraper v2.0 (GitHub Actions)</generator>
        <docs>https://cyber.harvard.edu/rss/rss.html</docs>
        <atom:link href="${pagesUrl}/feed.xml" rel="self" type="application/rss+xml"/>
        <image>
            <url>https://www.evertkwok.nl/wp-content/uploads/2019/07/cropped-Evert-Kwok-favicon-32x32.png</url>
            <title>Evert Kwok Educational Cartoons</title>
            <link>https://www.evertkwok.nl/cartoon/</link>
            <width>32</width>
            <height>32</height>
            <description>RSS feed for Evert Kwok's educational cartoons</description>
        </image>
        <category>Education</category>
        <category>Science</category>
        <category>Mathematics</category>
        <category>Cartoons</category>
        <category>Dutch Content</category>
        
${cartoons.map((cartoon, index) => `        <item>
            <title>${this.escapeXml(cartoon.title)}</title>
            <link>${this.escapeXml(cartoon.url)}</link>
            <description><![CDATA[
                <div style="max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6;">
                    <p style="font-size: 16px; color: #333; margin-bottom: 20px; text-align: center;">
                        ${this.escapeXml(cartoon.description)}
                    </p>
                    <div style="text-align: center; margin: 20px 0;">
                        <img src="${this.escapeXml(cartoon.url)}" 
                             alt="${this.escapeXml(cartoon.title)}" 
                             style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" 
                             loading="lazy" />
                    </div>
                    <p style="font-size: 14px; color: #666; text-align: center; margin-top: 15px;">
                        <strong>🎨 Educational cartoon by <a href="https://www.evertkwok.nl" style="color: #007cba; text-decoration: none;">Evert Kwok</a></strong>
                    </p>
                </div>
            ]]></description>
            <content:encoded><![CDATA[
                <div style="max-width: 800px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                    <header style="text-align: center; margin-bottom: 30px; padding: 20px; background: linear-gradient(135deg, #f8f9fa, #e9ecef); border-radius: 12px;">
                        <h1 style="color: #007cba; margin: 0 0 10px 0; font-size: 24px;">${this.escapeXml(cartoon.title)}</h1>
                        <p style="color: #666; margin: 0; font-size: 16px;">📅 ${cartoon.date.toLocaleDateString('nl-NL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </header>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <img src="${this.escapeXml(cartoon.url)}" 
                             alt="${this.escapeXml(cartoon.title)}" 
                             style="max-width: 100%; height: auto; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); transition: transform 0.3s ease;" 
                             onmouseover="this.style.transform='scale(1.02)'" 
                             onmouseout="this.style.transform='scale(1)'"
                             loading="lazy" />
                    </div>
                    
                    <div style="background: #f8f9fa; padding: 25px; border-radius: 12px; margin: 30px 0; border-left: 4px solid #007cba;">
                        <p style="font-size: 16px; line-height: 1.8; color: #333; margin: 0;">
                            ${this.escapeXml(cartoon.description)}
                        </p>
                    </div>
                    
                    <footer style="text-align: center; margin-top: 40px; padding: 20px; background: #f1f3f4; border-radius: 12px;">
                        <p style="margin: 0; font-size: 14px; color: #666;">
                            🎓 <strong>About the Artist:</strong> <a href="https://www.evertkwok.nl" style="color: #007cba; text-decoration: none;">Evert Kwok</a> creates educational cartoons that make complex scientific and mathematical concepts accessible through humor and visual storytelling.
                        </p>
                        <p style="margin: 10px 0 0 0; font-size: 12px; color: #888;">
                            📡 This content is delivered via an automated RSS feed. <a href="${pagesUrl}" style="color: #007cba;">Learn more</a>
                        </p>
                    </footer>
                </div>
            ]]></content:encoded>
            <pubDate>${cartoon.date.toUTCString()}</pubDate>
            <dc:date>${cartoon.date.toISOString()}</dc:date>
            <guid isPermaLink="true">${this.escapeXml(cartoon.url)}</guid>
            <enclosure url="${this.escapeXml(cartoon.url)}" type="image/jpeg" length="0"/>
            <media:content url="${this.escapeXml(cartoon.url)}" type="image/jpeg" medium="image">
                <media:title>${this.escapeXml(cartoon.title)}</media:title>
                <media:description>${this.escapeXml(cartoon.description)}</media:description>
                <media:keywords>education, cartoon, science, mathematics, humor, evert kwok</media:keywords>
            </media:content>
            <category>Education</category>
            <category>Cartoons</category>
            <category>Science</category>
            <category>Mathematics</category>
            <category>Humor</category>
            <category>Visual Learning</category>
            <author>info@evertkwok.nl (Evert Kwok)</author>
            <source url="${pagesUrl}/feed.xml">Evert Kwok Educational Cartoons</source>
        </item>`).join('\n')}
    </channel>
</rss>`;
        
        return rssXml;
    }
    
    escapeXml(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
    
    getDemoData() {
        this.log('Using demo data as fallback', 'warn');
        
        // Create realistic demo data with proper date distribution
        const baseDate = new Date('2020-01-01');
        const demos = [
            {
                title: 'Quantum Mechanics Made Simple',
                description: 'A humorous exploration of quantum physics concepts, including superposition and wave-particle duality, explained through clever visual metaphors.',
                filename: 'quantum-mechanics-humor.jpg',
                monthsAgo: 2
            },
            {
                title: 'Calculus and Derivatives Explained',
                description: 'Understanding the fundamental concepts of calculus through entertaining illustrations that make complex mathematical ideas accessible.',
                filename: 'calculus-derivatives.jpg',
                monthsAgo: 5
            },
            {
                title: 'Chemical Reactions Adventure',
                description: 'Exploring the fascinating world of chemistry and molecular interactions through engaging cartoon storytelling.',
                filename: 'chemistry-reactions.jpg',
                monthsAgo: 8
            },
            {
                title: 'Einstein\'s Theory of Relativity',
                description: 'Breaking down Einstein\'s groundbreaking theories of special and general relativity using visual humor and analogies.',
                filename: 'einstein-relativity.jpg',
                monthsAgo: 12
            },
            {
                title: 'Pythagoras Theorem Discovery',
                description: 'The classic story of Pythagoras and his famous theorem, illustrated with mathematical precision and comedic timing.',
                filename: '538piethagoras.jpg',
                monthsAgo: 48
            },
            {
                title: 'DNA Structure and Genetics',
                description: 'Unraveling the mysteries of DNA, genetic inheritance, and molecular biology through entertaining visual narratives.',
                filename: 'dna-genetics.jpg',
                monthsAgo: 15
            },
            {
                title: 'Physics of Light and Optics',
                description: 'Illuminating the principles of light, reflection, refraction, and optical phenomena through clever cartoon illustrations.',
                filename: 'physics-light-optics.jpg',
                monthsAgo: 7
            },
            {
                title: 'Statistics and Probability Fun',
                description: 'Making statistics and probability theory engaging through humorous examples and visual representations of mathematical concepts.',
                filename: 'statistics-probability.jpg',
                monthsAgo: 3
            }
        ];
        
        return demos.map((demo, index) => {
            const date = new Date();
            date.setMonth(date.getMonth() - demo.monthsAgo);
            date.setDate(Math.floor(Math.random() * 28) + 1); // Random day in month
            
            return {
                url: `https://www.evertkwok.nl/wp-content/uploads/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${demo.filename}`,
                title: demo.title,
                date: date,
                description: demo.description,
                filename: demo.filename
            };
        }).sort((a, b) => b.date - a.date);
    }
    
    async ensureDirectoryExists(filePath) {
        const dir = path.dirname(filePath);
        try {
            await fs.access(dir);
        } catch {
            await fs.mkdir(dir, { recursive: true });
            this.log(`Created directory: ${dir}`);
        }
    }
    
    async run() {
        const startTime = Date.now();
        
        console.log('');
        console.log('🎨 Evert Kwok Cartoon RSS Scraper v2.0');
        console.log('==========================================');
        console.log(`🕐 Started at: ${new Date().toISOString()}`);
        console.log(`🎯 Source: ${this.baseUrl}`);
        console.log(`📄 Output: ${this.outputFile}`);
        console.log(`🔧 Environment: ${process.env.GITHUB_ACTIONS ? 'GitHub Actions' : 'Local'}`);
        console.log('');
        
        try {
            // Scrape cartoons
            const cartoons = await this.scrapeCartoons();
            
            if (cartoons.length === 0) {
                this.log('No cartoons found!', 'error');
                process.exit(1);
            }
            
            // Generate RSS
            this.log('Generating RSS feed...');
            const rssXml = await this.generateRSS(cartoons);
            
            // Ensure output directory exists
            await this.ensureDirectoryExists(this.outputFile);
            
            // Write RSS file
            await fs.writeFile(this.outputFile, rssXml, 'utf8');
            this.log(`RSS feed written to ${this.outputFile}`);
            
            // Generate summary statistics
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            const oldestCartoon = cartoons[cartoons.length - 1];
            const newestCartoon = cartoons[0];
            
            console.log('');
            console.log('✅ RSS Generation Complete!');
            console.log('============================');
            console.log(`📊 Total cartoons: ${cartoons.length}`);
            console.log(`📅 Date range: ${oldestCartoon.date.toISOString().split('T')[0]} to ${newestCartoon.date.toISOString().split('T')[0]}`);
            console.log(`📄 RSS file size: ${(rssXml.length / 1024).toFixed(1)} KB`);
            console.log(`⏱️  Processing time: ${elapsed}s`);
            console.log(`🔗 Feed URL: ${process.env.GITHUB_PAGES_URL || 'https://yourusername.github.io/evert-kwok-rss'}/feed.xml`);
            console.log('');
            
            // Set GitHub Actions outputs
            if (process.env.GITHUB_ACTIONS) {
                console.log(`::set-output name=cartoon_count::${cartoons.length}`);
                console.log(`::set-output name=latest_date::${newestCartoon.date.toISOString().split('T')[0]}`);
                console.log(`::set-output name=oldest_date::${oldestCartoon.date.toISOString().split('T')[0]}`);
                console.log(`::set-output name=processing_time::${elapsed}s`);
                console.log(`::set-output name=feed_size::${(rssXml.length / 1024).toFixed(1)} KB`);
            }
            
            return {
                cartoonCount: cartoons.length,
                latestDate: newestCartoon.date.toISOString().split('T')[0],
                processingTime: elapsed,
                feedSize: (rssXml.length / 1024).toFixed(1) + ' KB'
            };
            
        } catch (error) {
            this.log(`Fatal error: ${error.message}`, 'error');
            if (this.verbose) {
                this.log(`Stack trace: ${error.stack}`, 'error');
            }
            
            // In GitHub Actions, we want to fail the workflow
            if (process.env.GITHUB_ACTIONS) {
                console.log('::error::RSS generation failed');
                process.exit(1);
            } else {
                throw error;
            }
        }
    }
}

// CLI Usage and Module Export
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {};
    
    // Parse command line arguments
    args.forEach(arg => {
        if (arg === '--verbose' || arg === '-v') {
            options.verbose = true;
        } else if (arg.startsWith('--output=')) {
            options.outputFile = arg.split('=')[1];
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
🎨 Evert Kwok Cartoon RSS Scraper

Usage: node src/scraper.js [options]

Options:
  --verbose, -v          Enable verbose logging
  --output=FILE          Specify output file (default: docs/feed.xml)
  --help, -h             Show this help message

Examples:
  node src/scraper.js --verbose
  node src/scraper.js --output=my-feed.xml
  node src/scraper.js --verbose --output=docs/feed.xml

Environment Variables:
  GITHUB_ACTIONS         Detected automatically in GitHub Actions
  GITHUB_REPOSITORY      Used for generating proper URLs
  GITHUB_PAGES_URL       Used for RSS feed self-reference URL
            `);
            process.exit(0);
        }
    });
    
    // Run the scraper
    const scraper = new EvertKwokScraper(options);
    scraper.run().catch(error => {
        console.error('');
        console.error('❌ Unhandled error occurred:');
        console.error(error.message);
        if (process.env.NODE_ENV === 'development') {
            console.error(error.stack);
        }
        process.exit(1);
    });
}

module.exports = EvertKwokScraper;